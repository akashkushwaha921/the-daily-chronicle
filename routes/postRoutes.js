
const express = require('express');
const pool = require('../config/db');
const upload = require('../middleware/postUpload');
const imageModeration = require('../middleware/imageModeration');
const fs = require('fs/promises');
const path = require('path');
const { createNotification } = require('../utils/notifications');

const { uploadImage, deleteImage } = require('../config/storage');

const router = express.Router();

// Login protection
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }

    next();
}

// Remove newly uploaded files if database operation fails
async function removeUploadedFiles(files) {
    for (const file of files || []) {
        try {
            await fs.unlink(file.path);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Uploaded file cleanup error:', error);
            }
        }
    }
}

// Verify actual image file types
async function verifyUploadedFiles(files) {
    for (const file of files || []) {
        await upload.verifyImageFile(file);
    }
}

// Delete saved post images from Supabase Storage
async function removeSavedImageFiles(imagePaths) {
    for (const imagePath of imagePaths || []) {
        try {
            await deleteImage(imagePath);
        } catch (error) {
            console.error('Post image deletion error:', error);
        }
    }
}

// Get user-friendly post submission error
function getPostError(error) {
    if (error.code === 'IMAGE_MODERATION_BLOCKED') {
        return {
            message: 'This image contains prohibited adult or explicit content. Please upload another image.',
            status: 400
        };
    }

    if (
        error.code === 'IMAGE_MODERATION_API_ERROR' ||
        error.code === 'IMAGE_MODERATION_TIMEOUT' ||
        error.code === 'IMAGE_MODERATION_FAILED' ||
        error.code === 'IMAGE_MODERATION_CONFIG_ERROR'
    ) {
        return {
            message: 'Image moderation service is temporarily unavailable. Please try again later.',
            status: 503
        };
    }

    if (
        error.message ===
        'Invalid image file. Please upload a genuine image.'
    ) {
        return {
            message: error.message,
            status: 400
        };
    }

    return {
        message: 'Something went wrong. Please try again.',
        status: 500
    };
}

// Create post page
router.get('/new', requireLogin, async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT id, name FROM categories ORDER BY name ASC'
        );

        res.render('posts/create', {
            title: 'Write a Post',
            categories: result.rows,
            error: null,
            formData: {}
        });

    } catch (error) {
        next(error);
    }
});

// Save new post
router.post(
    '/',
    requireLogin,
    upload.array('images', 100),
    async (req, res, next) => {
               let client;
        const uploadedImageUrls = [];

        try {
            await verifyUploadedFiles(req.files);

            // Check uploaded images for explicit content
            await imageModeration.moderateImages(req.files);

            const title = (req.body.title || '').trim();
            const excerpt = (req.body.excerpt || '').trim();
            const content = (req.body.content || '').trim();
            const categoryId = req.body.category_id || null;

            const categoriesResult = await pool.query(
                'SELECT id, name FROM categories ORDER BY name ASC'
            );

            const categories = categoriesResult.rows;

            let errorMessage = null;

            if (!title || !content) {
                errorMessage = 'Please enter a post title and article content.';
            } else if (title.length > 200 || excerpt.length > 500) {
                errorMessage = 'Title must be under 200 characters and excerpt under 500 characters.';
            } else if (content.length > 100000) {
                errorMessage = 'Your article is too long.';
            }

            let validCategoryId = null;

            if (!errorMessage && categoryId) {
                const category = categories.find(
                    item => String(item.id) === String(categoryId)
                );

                if (!category) {
                    errorMessage = 'Please select a valid category.';
                } else {
                    validCategoryId = category.id;
                }
            }

            if (errorMessage) {
                await removeUploadedFiles(req.files);

                return res.status(400).render('posts/create', {
                    title: 'Write a Post',
                    categories,
                    error: errorMessage,
                    formData: {
                        title,
                        excerpt,
                        content,
                        category_id: categoryId
                    }
                });
            }

            const slugBase = title
                .toLowerCase()
                .normalize('NFKD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '')
                .slice(0, 150) || 'post';

            const slug = `${slugBase}-${Date.now()}`;

            client = await pool.connect();

            await client.query('BEGIN');

            const postResult = await client.query(
                `INSERT INTO posts
                 (user_id, category_id, title, slug, excerpt, content, status)
                 VALUES ($1, $2, $3, $4, $5, $6, 'pending')
                 RETURNING id`,
                [
                    req.session.user.id,
                    validCategoryId,
                    title,
                    slug,
                    excerpt || null,
                    content
                ]
            );

            const postId = postResult.rows[0].id;

         for (const file of req.files || []) {
                const imageUrl = await uploadImage(
                    file.path,
                    file.filename,
                    'posts',
                    file.mimetype
                );

                uploadedImageUrls.push(imageUrl);

                await client.query(
                    `INSERT INTO post_images (post_id, image_path)
                     VALUES ($1, $2)`,
                    [postId, imageUrl]
                );
            }

            await client.query('COMMIT');
        await removeUploadedFiles(req.files);

            // Notify all admins about the new pending article
            try {
                const adminsResult = await pool.query(
                    `SELECT id FROM users WHERE role = 'admin'`
                );

                for (const admin of adminsResult.rows) {
                    await createNotification({
                        userId: admin.id,
                        type: 'new_pending_article',
                        message: `A new article "${title}" has been submitted for review.`,
                        postId
                    });
                }
            } catch (notificationError) {
                console.error('Admin notification error:', notificationError);
            }

            res.redirect('/dashboard');

        } catch (error) {
            if (client) {
                try {
                    await client.query('ROLLBACK');
                } catch (rollbackError) {
                    console.error('Post creation rollback error:', rollbackError);
                }
            }

                       await removeSavedImageFiles(uploadedImageUrls);

            await removeUploadedFiles(req.files);

            console.error('Post creation error:', error);

            const formError = getPostError(error);

            try {
                const categoriesResult = await pool.query(
                    'SELECT id, name FROM categories ORDER BY name ASC'
                );

                return res.status(formError.status).render('posts/create', {
                    title: 'Write a Post',
                    categories: categoriesResult.rows,
                    error: formError.message,
                    formData: {
                        title: req.body.title || '',
                        excerpt: req.body.excerpt || '',
                        content: req.body.content || '',
                        category_id: req.body.category_id || ''
                    }
                });


            } catch (renderError) {
                console.error('Create form rendering error:', renderError);
                return next(error);
            }

        } finally {
            if (client) {
                client.release();
            }
        }
    }
);

// Edit post page
router.get('/:id/edit', requireLogin, async (req, res, next) => {
    try {
        const postId = req.params.id;
        const userId = req.session.user.id;

        if (!/^\d+$/.test(postId)) {
            return res.status(400).send('Invalid post ID');
        }

        const postResult = await pool.query(
            `SELECT *
             FROM posts
             WHERE id = $1 AND user_id = $2`,
            [postId, userId]
        );

        if (postResult.rows.length === 0) {
            return res.status(404).send('Post not found or access denied');
        }

        const categoriesResult = await pool.query(
            'SELECT id, name FROM categories ORDER BY name ASC'
        );

        const imagesResult = await pool.query(
            `SELECT id, image_path
             FROM post_images
             WHERE post_id = $1
             ORDER BY id ASC`,
            [postId]
        );

        res.render('posts/edit', {
            title: 'Edit Post',
            post: postResult.rows[0],
            categories: categoriesResult.rows,
            images: imagesResult.rows,
            error: null
        });

    } catch (error) {
        next(error);
    }
});

// Update post
router.post(
    '/:id/edit',
    requireLogin,
    upload.array('images', 100),
        async (req, res, next) => {
        let client;
        const uploadedImageUrls = [];

        try {
            await verifyUploadedFiles(req.files);

            // Check uploaded images for explicit content
            await imageModeration.moderateImages(req.files);

            const postId = req.params.id;
            const userId = req.session.user.id;

            if (!/^\d+$/.test(postId)) {
                await removeUploadedFiles(req.files);
                return res.status(400).send('Invalid post ID');
            }

            const title = (req.body.title || '').trim();
            const excerpt = (req.body.excerpt || '').trim();
            const content = (req.body.content || '').trim();
            const categoryId = req.body.category_id || null;

            const postResult = await pool.query(
                `SELECT *
                 FROM posts
                 WHERE id = $1 AND user_id = $2`,
                [postId, userId]
            );

            if (postResult.rows.length === 0) {
                await removeUploadedFiles(req.files);
                return res.status(404).send('Post not found or access denied');
            }

            const originalPost = postResult.rows[0];

            const categoriesResult = await pool.query(
                'SELECT id, name FROM categories ORDER BY name ASC'
            );

            const categories = categoriesResult.rows;

            const imagesResult = await pool.query(
                `SELECT id, image_path
                 FROM post_images
                 WHERE post_id = $1
                 ORDER BY id ASC`,
                [postId]
            );

            const images = imagesResult.rows;

            let errorMessage = null;
            let validCategoryId = null;

            if (!title || !content) {
                errorMessage = 'Please enter a post title and article content.';
            } else if (
                title.length > 200 ||
                excerpt.length > 500 ||
                content.length > 100000
            ) {
                errorMessage = 'Title, excerpt or article content exceeds the allowed length.';
            }

            if (!errorMessage && categoryId) {
                const category = categories.find(
                    item => String(item.id) === String(categoryId)
                );

                if (!category) {
                    errorMessage = 'Please select a valid category.';
                } else {
                    validCategoryId = category.id;
                }
            }

            if (errorMessage) {
                await removeUploadedFiles(req.files);

                return res.status(400).render('posts/edit', {
                    title: 'Edit Post',
                    post: {
                        ...originalPost,
                        title,
                        excerpt,
                        content,
                        category_id: categoryId
                    },
                    categories,
                    images,
                    error: errorMessage
                });
            }

            // Selected existing image IDs to delete
            let deleteImageIds = req.body.delete_image_ids || [];

            if (!Array.isArray(deleteImageIds)) {
                deleteImageIds = [deleteImageIds];
            }

            deleteImageIds = deleteImageIds.filter(
                id => /^\d+$/.test(String(id))
            );

            const deletedImagePaths = [];

            client = await pool.connect();

            await client.query('BEGIN');

            await client.query(
                `UPDATE posts
                 SET title = $1,
                     excerpt = $2,
                     content = $3,
                     category_id = $4
                 WHERE id = $5 AND user_id = $6`,
                [
                    title,
                    excerpt || null,
                    content,
                    validCategoryId,
                    postId,
                    userId
                ]
            );

            // Delete only images belonging to this post
            if (deleteImageIds.length > 0) {
                const deletedResult = await client.query(
                    `DELETE FROM post_images
                     WHERE id = ANY($1::bigint[])
                     AND post_id = $2
                     RETURNING image_path`,
                    [deleteImageIds, postId]
                );

                deletedImagePaths.push(
                    ...deletedResult.rows.map(row => row.image_path)
                );
            }

          // Save newly uploaded images to Supabase Storage
for (const file of req.files || []) {
    const imageUrl = await uploadImage(
        file.path,
        file.filename,
        'posts',
        file.mimetype
    );

    uploadedImageUrls.push(imageUrl);

    await client.query(
        `INSERT INTO post_images (post_id, image_path)
         VALUES ($1, $2)`,
        [postId, imageUrl]
    );
}

           await client.query('COMMIT');

// Remove temporary local files
await removeUploadedFiles(req.files);

// Remove deleted images from Supabase Storage
await removeSavedImageFiles(deletedImagePaths);

            res.redirect('/dashboard');

        } catch (error) {
            if (client) {
                try {
                    await client.query('ROLLBACK');
                } catch (rollbackError) {
                    console.error('Post update rollback error:', rollbackError);
                }
            }
// Remove newly uploaded images from Supabase if update fails
await removeSavedImageFiles(uploadedImageUrls);

            await removeUploadedFiles(req.files);

            console.error('Post update error:', error);

            const formError = getPostError(error);

            try {
                const postId = req.params.id;
                const userId = req.session.user.id;

                const postResult = await pool.query(
                    `SELECT *
                     FROM posts
                     WHERE id = $1 AND user_id = $2`,
                    [postId, userId]
                );

                if (postResult.rows.length === 0) {
                    return next(error);
                }

                const categoriesResult = await pool.query(
                    'SELECT id, name FROM categories ORDER BY name ASC'
                );

                const imagesResult = await pool.query(
                    `SELECT id, image_path
                     FROM post_images
                     WHERE post_id = $1
                     ORDER BY id ASC`,
                    [postId]
                );

                const originalPost = postResult.rows[0];

                return res.status(formError.status).render('posts/edit', {
                    title: 'Edit Post',
                    post: {
                        ...originalPost,
                        title: req.body.title ?? originalPost.title,
                        excerpt: req.body.excerpt ?? originalPost.excerpt,
                        content: req.body.content ?? originalPost.content,
                        category_id: req.body.category_id ?? originalPost.category_id
                    },
                    categories: categoriesResult.rows,
                    images: imagesResult.rows,
                    error: formError.message
                });

            } catch (renderError) {
                console.error('Edit form rendering error:', renderError);
                return next(error);
            }

        } finally {
            if (client) {
                client.release();
            }
        }
    }
);

// Delete post
router.post('/:id/delete', requireLogin, async (req, res, next) => {
    let client;
    let transactionStarted = false;

    try {
        const postId = req.params.id;
        const userId = req.session.user.id;

        if (!/^\d+$/.test(postId)) {
            return res.status(400).send('Invalid post ID');
        }

        client = await pool.connect();

        await client.query('BEGIN');
        transactionStarted = true;

        const postResult = await client.query(
            `SELECT id
             FROM posts
             WHERE id = $1 AND user_id = $2`,
            [postId, userId]
        );

        if (postResult.rows.length === 0) {
            await client.query('ROLLBACK');
            transactionStarted = false;

            return res.status(404).send('Post not found or access denied');
        }

        // Get image paths before deleting the post
        const imagesResult = await client.query(
            `SELECT image_path
             FROM post_images
             WHERE post_id = $1`,
            [postId]
        );

        const imagePaths = imagesResult.rows.map(row => row.image_path);

        await client.query(
            'DELETE FROM likes WHERE post_id = $1',
            [postId]
        );

        await client.query(
            'DELETE FROM bookmarks WHERE post_id = $1',
            [postId]
        );

        // post_images records are deleted by ON DELETE CASCADE
        await client.query(
            'DELETE FROM posts WHERE id = $1 AND user_id = $2',
            [postId, userId]
        );

        await client.query('COMMIT');
        transactionStarted = false;

        // Delete actual image files after database commit
        await removeSavedImageFiles(imagePaths);

        res.redirect('/dashboard');

    } catch (error) {
        if (client && transactionStarted) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Post deletion rollback error:', rollbackError);
            }
        }

        next(error);

    } finally {
        if (client) {
            client.release();
        }
    }
});

// Show single published article with comments and images
router.get('/:slug', async (req, res, next) => {
    try {
        const userId = req.session.user
            ? req.session.user.id
            : null;

        const result = await pool.query(
            `SELECT
                posts.*,
                users.name AS author_name,
                categories.name AS category_name,

                (SELECT COUNT(*)
                 FROM likes
                 WHERE likes.post_id = posts.id) AS likes_count,

                EXISTS (
                    SELECT 1 FROM likes
                    WHERE likes.post_id = posts.id
                    AND likes.user_id = $2
                ) AS liked,

                EXISTS (
                    SELECT 1 FROM bookmarks
                    WHERE bookmarks.post_id = posts.id
                    AND bookmarks.user_id = $2
                ) AS bookmarked

            FROM posts
            LEFT JOIN users ON posts.user_id = users.id
            LEFT JOIN categories ON posts.category_id = categories.id
            WHERE posts.slug = $1
            AND posts.status = 'published'`,
            [req.params.slug, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).send('Article not found');
        }

        const postId = result.rows[0].id;

        // Fetch comments for this article
        const commentsResult = await pool.query(
            `SELECT
                comments.id,
                comments.content,
                comments.created_at,
                users.id AS author_id,
                users.name AS author_name,
                users.profile_image AS author_image
             FROM comments
             INNER JOIN users ON comments.user_id = users.id
             WHERE comments.post_id = $1
             ORDER BY comments.created_at DESC`,
            [postId]
        );

        // Fetch article images
        const imagesResult = await pool.query(
            `SELECT id, image_path
             FROM post_images
             WHERE post_id = $1
             ORDER BY id ASC`,
            [postId]
        );

        res.render('posts/show', {
            title: result.rows[0].title,
            post: result.rows[0],
            comments: commentsResult.rows,
            images: imagesResult.rows
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;
