
const express = require('express');
const pool = require('../config/db');
const fs = require('fs/promises');
const path = require('path');
const { createNotification } = require('../utils/notifications');
const { sendEmail } = require('../utils/mailer');
const { deleteImage } = require('../config/storage');

const router = express.Router();

// ========================================
// ADMIN ACCESS PROTECTION
// ========================================
const requireAdmin = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }

    if (req.session.user.role !== 'admin') {
        return res.status(403).send('Access denied. Admin only.');
    }

    next();
};


// ========================================
// ADMIN DASHBOARD
// ========================================

router.get('/', requireAdmin, async (req, res, next) => {
    try {
        const [
            usersResult,
            postsResult,
            publishedResult,
            pendingResult,
            commentsResult,
            categoriesResult,
            latestUsersResult,
            latestPostsResult,
            weeklyPostsResult
        ] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM users'),
            pool.query('SELECT COUNT(*) FROM posts'),
            pool.query("SELECT COUNT(*) FROM posts WHERE status = 'published'"),
            pool.query("SELECT COUNT(*) FROM posts WHERE status = 'pending'"),
            pool.query('SELECT COUNT(*) FROM comments'),
            pool.query('SELECT COUNT(*) FROM categories'),

            pool.query(`
                SELECT id, name, email, created_at
                FROM users
                ORDER BY created_at DESC
                LIMIT 5
            `),

            pool.query(`
                SELECT posts.id, posts.title, posts.status,
                       posts.created_at, users.name AS author_name
                FROM posts
                LEFT JOIN users ON posts.user_id = users.id
                ORDER BY posts.created_at DESC
                LIMIT 5
            `),

            pool.query(`
                SELECT
                    days.day::date AS date,
                    COUNT(posts.id)::int AS total
                FROM generate_series(
                    CURRENT_DATE - INTERVAL '6 days',
                    CURRENT_DATE,
                    INTERVAL '1 day'
                ) AS days(day)
                LEFT JOIN posts
                    ON posts.created_at >= days.day
                    AND posts.created_at < days.day + INTERVAL '1 day'
                GROUP BY days.day
                ORDER BY days.day
            `)
        ]);

        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            stats: {
                users: Number(usersResult.rows[0].count),
                posts: Number(postsResult.rows[0].count),
                published: Number(publishedResult.rows[0].count),
                pending: Number(pendingResult.rows[0].count),
                comments: Number(commentsResult.rows[0].count),
                categories: Number(categoriesResult.rows[0].count)
            },
            latestUsers: latestUsersResult.rows,
            latestPosts: latestPostsResult.rows,
            weeklyPosts: weeklyPostsResult.rows
        });

    } catch (error) {
        next(error);
    }
});



// ========================================
// ALL ARTICLES
// ========================================
router.get('/articles', requireAdmin, async (req, res, next) => {
    try {
        const status = ['pending', 'published'].includes(req.query.status)
            ? req.query.status
            : '';

        const result = await pool.query(
            `SELECT
                posts.id,
                posts.title,
                posts.slug,
                posts.status,
                posts.created_at,
                posts.published_at,
                users.name AS author_name,
                categories.name AS category_name
             FROM posts
             LEFT JOIN users ON posts.user_id = users.id
             LEFT JOIN categories ON posts.category_id = categories.id
             WHERE ($1 = '' OR posts.status = $1)
             ORDER BY posts.created_at DESC`,
            [status]
        );

        res.render('admin/articles', {
            title: status
                ? status.charAt(0).toUpperCase() + status.slice(1) + ' Articles'
                : 'Manage Articles',
            articles: result.rows
        });

    } catch (error) {
        next(error);
    }
});
// ========================================
// REVIEW SINGLE ARTICLE
// ========================================
router.get('/articles/:id', requireAdmin, async (req, res, next) => {
    try {
        const articleId = req.params.id;

        if (!/^\d+$/.test(articleId)) {
            return res.status(400).send('Invalid article ID.');
        }

        const result = await pool.query(
            `SELECT
                posts.*,
                users.name AS author_name,
                categories.name AS category_name
             FROM posts
             LEFT JOIN users ON posts.user_id = users.id
             LEFT JOIN categories ON posts.category_id = categories.id
             WHERE posts.id = $1`,
            [articleId]
        );

        if (result.rows.length === 0) {
            return res.status(404).send('Article not found.');
        }

        const imagesResult = await pool.query(
            `SELECT id, image_path
             FROM post_images
             WHERE post_id = $1
             ORDER BY id ASC`,
            [articleId]
        );

        res.render('admin/article-review', {
            title: 'Review Article',
            post: result.rows[0],
            images: imagesResult.rows
        });

    } catch (error) {
        next(error);
    }
});

// ========================================
// PUBLISH ARTICLE
// ========================================

router.post('/articles/:id/publish', requireAdmin, async (req, res, next) => {
    try {
        const articleId = req.params.id;

        const result = await pool.query(
            `UPDATE posts
             SET status = 'published',
                 published_at = COALESCE(published_at, NOW()),
                 updated_at = NOW()
             WHERE id = $1
             AND status IN ('pending', 'draft')
             RETURNING id, user_id, title`,
            [articleId]
        );

        // Notify article author after successful publishing
        if (result.rows.length > 0) {
            const article = result.rows[0];

            try {
                await createNotification({
                    userId: article.user_id,
                    type: 'article_published',
                    message: `Your article "${article.title}" has been published.`,
                    postId: article.id
                });
            } catch (notificationError) {
                console.error('Author notification error:', notificationError);
            }
        }

        res.redirect('/admin/articles');

    } catch (error) {
        next(error);
    }
});

// ========================================
// DELETE ARTICLE
// ========================================
router.post('/articles/:id/delete', requireAdmin, async (req, res, next) => {
    const client = await pool.connect();

    try {
        const articleId = req.params.id;

        await client.query('BEGIN');

        // Get all image paths before deleting the article
        const imagesResult = await client.query(
            'SELECT image_path FROM post_images WHERE post_id = $1',
            [articleId]
        );

        // Delete article (image database records will cascade)
        const result = await client.query(
            'DELETE FROM posts WHERE id = $1 RETURNING id',
            [articleId]
        );

        if (result.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).send('Article not found.');
        }

        await client.query('COMMIT');

      // Delete article images from Supabase Storage
for (const image of imagesResult.rows) {
    try {
        await deleteImage(image.image_path);
    } catch (imageError) {
        console.error('Supabase image deletion error:', imageError);
    }
}

        res.redirect('/admin/articles');

    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            console.error('Rollback error:', rollbackError);
        }

        next(error);

    } finally {
        client.release();
    }
});


// ========================================
// ALL USERS + SEARCH
// ========================================
router.get('/users', requireAdmin, async (req, res, next) => {
    try {
        const search = (req.query.search || '').trim();

        const result = await pool.query(
            `SELECT
                id,
                name,
                email,
                role,
                created_at,
                is_blocked
             FROM users
             WHERE name ILIKE $1 OR email ILIKE $1
             ORDER BY created_at DESC`,
            [`%${search}%`]
        );

        res.render('admin/users', {
            title: 'Manage Users',
            users: result.rows,
            search,
            currentAdminId: req.session.user.id
        });

    } catch (error) {
        next(error);
    }
});
// ========================================
// EMAIL ALL REGISTERED USERS - OPEN FORM
// ========================================
router.get('/email-all', requireAdmin, async (req, res, next) => {
    try {
        res.render('admin/email-all-users', {
            title: 'Email All Users',
            success: req.query.success === '1'
        });
    } catch (error) {
        next(error);
    }
});
// ========================================
// SEND EMAIL TO ALL REGISTERED USERS
// ========================================
router.post('/email-all', requireAdmin, async (req, res, next) => {
    try {
        const subject = (req.body.subject || '').trim();
        const message = (req.body.message || '').trim();

        if (!subject || !message) {
            return res.status(400).send('Subject and message are required.');
        }

        if (subject.length > 150 || message.length > 10000) {
            return res.status(400).send('Subject or message is too long.');
        }

        const usersResult = await pool.query(
            `SELECT email
             FROM users
             WHERE email IS NOT NULL
             AND email <> ''`
        );

        const recipients = usersResult.rows.map(user => user.email);

        if (recipients.length === 0) {
            return res.status(400).send('No registered user emails found.');
        }

        await sendEmail({
            to: process.env.ADMIN_EMAIL,
            bcc: recipients,
            subject,
            text: message
        });

        res.redirect('/admin/email-all?success=1');

    } catch (error) {
        next(error);
    }
});

// ========================================
// BLOCK USER
// ========================================
router.post('/users/:id/block', requireAdmin, async (req, res, next) => {
    try {
        const userId = req.params.id;

        // Admin cannot block their own account
        if (String(userId) === String(req.session.user.id)) {
            return res.status(400).send(
                'You cannot block your own account.'
            );
        }

        // Admin accounts cannot be blocked
        await pool.query(
            `UPDATE users
             SET is_blocked = TRUE
             WHERE id = $1
             AND role <> 'admin'`,
            [userId]
        );

        res.redirect('/admin/users');

    } catch (error) {
        next(error);
    }
});

// ========================================
// UNBLOCK USER
// ========================================
router.post('/users/:id/unblock', requireAdmin, async (req, res, next) => {
    try {
        const userId = req.params.id;

        // Admin accounts cannot be modified through this route
        await pool.query(
            `UPDATE users
             SET is_blocked = FALSE
             WHERE id = $1
             AND role <> 'admin'`,
            [userId]
        );

        res.redirect('/admin/users');

    } catch (error) {
        next(error);
    }
});

// ========================================
// MANAGE CATEGORIES + SEARCH
// ========================================
router.get('/categories', requireAdmin, async (req, res, next) => {
    try {
        const search = (req.query.search || '').trim();

        const result = await pool.query(
            `SELECT
                categories.id,
                categories.name,
                categories.slug,
                COUNT(posts.id) AS article_count
             FROM categories
             LEFT JOIN posts ON posts.category_id = categories.id
             WHERE categories.name ILIKE $1
             GROUP BY categories.id
             ORDER BY categories.name ASC`,
            [`%${search}%`]
        );

        res.render('admin/categories', {
            title: 'Manage Categories',
            categories: result.rows,
            search
        });

    } catch (error) {
        next(error);
    }
});

// ========================================
// ADD CATEGORY
// ========================================
router.post('/categories/add', requireAdmin, async (req, res, next) => {
    try {
        const name = (req.body.name || '').trim();

        if (!name) {
            return res.redirect('/admin/categories');
        }

        const slug = name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        if (!slug) {
            return res.redirect('/admin/categories');
        }

        await pool.query(
            'INSERT INTO categories (name, slug) VALUES ($1, $2)',
            [name, slug]
        );

        res.redirect('/admin/categories');

    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).send(
                'Category name or slug already exists.'
            );
        }

        next(error);
    }
});

// ========================================
// DELETE CATEGORY
// ========================================
router.post('/categories/:id/delete', requireAdmin, async (req, res, next) => {
    try {
        const categoryId = req.params.id;

        const result = await pool.query(
            'SELECT COUNT(*) FROM posts WHERE category_id = $1',
            [categoryId]
        );

        if (Number(result.rows[0].count) > 0) {
            return res.status(400).send(
                'This category has articles and cannot be deleted.'
            );
        }

        await pool.query(
            'DELETE FROM categories WHERE id = $1',
            [categoryId]
        );

        res.redirect('/admin/categories');

    } catch (error) {
        next(error);
    }
});

// ========================================
// MANAGE COMMENTS
// ========================================
router.get('/comments', requireAdmin, async (req, res, next) => {
    try {
        const search = (req.query.search || '').trim();

        const result = await pool.query(
            `SELECT
                comments.id,
                comments.content,
                comments.created_at,
                users.name AS user_name,
                posts.title AS post_title
             FROM comments
             LEFT JOIN users ON comments.user_id = users.id
             LEFT JOIN posts ON comments.post_id = posts.id
             WHERE
                comments.content ILIKE $1
                OR users.name ILIKE $1
                OR posts.title ILIKE $1
             ORDER BY comments.created_at DESC`,
            [`%${search}%`]
        );

        res.render('admin/comments', {
            title: 'Manage Comments',
            comments: result.rows,
            search
        });

    } catch (error) {
        next(error);
    }
});

// ========================================
// DELETE COMMENT
// ========================================
router.post('/comments/:id/delete', requireAdmin, async (req, res, next) => {
    try {
        const commentId = req.params.id;

        const result = await pool.query(
            'DELETE FROM comments WHERE id = $1 RETURNING id',
            [commentId]
        );

        if (result.rowCount === 0) {
            return res.status(404).send('Comment not found.');
        }

        res.redirect('/admin/comments');

    } catch (error) {
        next(error);
    }
});


// ========================================
// MANAGE REPORTS
// ========================================
router.get('/reports', requireAdmin, async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT
                r.id,
                r.reporter_id,
                reporter.name AS reporter_name,
                reporter.email AS reporter_email,
                r.post_id,
                r.comment_id,
                r.reason,
                r.details,
                r.status,
                r.created_at,
                r.resolved_at,
                p.title AS post_title,
                post_author.name AS post_author_name,
                c.content AS comment_content,
                comment_author.name AS comment_author_name
             FROM reports r
             LEFT JOIN users reporter
                ON r.reporter_id = reporter.id
             LEFT JOIN posts p
                ON r.post_id = p.id
             LEFT JOIN users post_author
                ON p.user_id = post_author.id
             LEFT JOIN comments c
                ON r.comment_id = c.id
             LEFT JOIN users comment_author
                ON c.user_id = comment_author.id
             ORDER BY
                CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END,
                r.created_at DESC`
        );

        res.render('admin/reports', {
            title: 'Manage Reports',
            reports: result.rows
        });

    } catch (error) {
        next(error);
    }
});

// ========================================
// RESOLVE REPORT
// ========================================
router.post('/reports/:id/resolve', requireAdmin, async (req, res, next) => {
    try {
        const reportId = req.params.id;

        if (!/^\d+$/.test(reportId)) {
            return res.status(400).send('Invalid report ID.');
        }

        const result = await pool.query(
            `UPDATE reports
             SET status = 'resolved',
                 resolved_at = NOW()
             WHERE id = $1
             RETURNING id`,
            [reportId]
        );

        if (result.rowCount === 0) {
            return res.status(404).send('Report not found.');
        }

        res.redirect('/admin/reports');

    } catch (error) {
        next(error);
    }
});

// ========================================
// DISMISS REPORT
// ========================================
router.post('/reports/:id/dismiss', requireAdmin, async (req, res, next) => {
    try {
        const reportId = req.params.id;

        if (!/^\d+$/.test(reportId)) {
            return res.status(400).send('Invalid report ID.');
        }

        const result = await pool.query(
            `UPDATE reports
             SET status = 'dismissed',
                 resolved_at = NOW()
             WHERE id = $1
             RETURNING id`,
            [reportId]
        );

        if (result.rowCount === 0) {
            return res.status(404).send('Report not found.');
        }

        res.redirect('/admin/reports');

    } catch (error) {
        next(error);
    }
});

module.exports = router;
