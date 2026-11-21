
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const { uploadImage, deleteImage } = require('../config/storage');

const router = express.Router();

// LOGIN CHECK
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }

    next();
}

// MULTER CONFIGURATION
const uploadDir = path.join(__dirname, '..', 'uploads');

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },

    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const filename = `profile-${req.session.user.id}-${Date.now()}${extension}`;

        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/jpeg',
            'image/png',
            'image/webp'
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPG, PNG and WEBP images are allowed.'));
        }
    }
});

// GET PROFILE PAGE
router.get('/profile', requireLogin, async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT id, name, email, role, profile_image, bio
             FROM users
             WHERE id = $1`,
            [req.session.user.id]
        );

        if (result.rows.length === 0) {
            return res.redirect('/auth/login');
        }

        const user = result.rows[0];

        req.session.user = user;

        res.render('pages/profile', {
            title: 'My Profile',
            user,
            error: null,
            success: null
        });

    } catch (error) {
        next(error);
    }
});

// UPDATE PROFILE DETAILS
router.post('/profile/update', requireLogin, async (req, res, next) => {
    try {
        const name = (req.body.name || '').trim();
        const email = (req.body.email || '').trim().toLowerCase();
        const bio = (req.body.bio || '').trim();

        const currentPassword = req.body.currentPassword || '';
        const newPassword = req.body.newPassword || '';

        const result = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [req.session.user.id]
        );

        if (result.rows.length === 0) {
            return res.redirect('/auth/login');
        }

        const currentUser = result.rows[0];

        const renderProfile = (error, success = null) => {
            return res.status(error ? 400 : 200).render('pages/profile', {
                title: 'My Profile',

                user: {
                    id: currentUser.id,
                    name,
                    email,
                    bio,
                    role: currentUser.role,
                    profile_image: currentUser.profile_image
                },

                error,
                success
            });
        };

        if (!name || !email) {
            return renderProfile('Name and email are required.');
        }

        if (name.length > 120 || email.length > 255) {
            return renderProfile('Name or email is too long.');
        }

        if (bio.length > 500) {
            return renderProfile('Bio must not exceed 500 characters.');
        }

        let passwordHash = currentUser.password_hash;

        if (currentPassword || newPassword) {
            if (!currentPassword || !newPassword) {
                return renderProfile('Enter both current and new password.');
            }

            if (
                newPassword.length < 8 ||
                Buffer.byteLength(newPassword, 'utf8') > 72
            ) {
                return renderProfile(
                    'New password must be at least 8 characters and no more than 72 bytes.'
                );
            }

            const passwordMatches = await bcrypt.compare(
                currentPassword,
                currentUser.password_hash
            );

            if (!passwordMatches) {
                return renderProfile('Current password is incorrect.');
            }

            passwordHash = await bcrypt.hash(newPassword, 12);
        }

        const updated = await pool.query(
            `UPDATE users
             SET name = $1,
                 email = $2,
                 bio = $3,
                 password_hash = $4
             WHERE id = $5
             RETURNING id, name, email, role, profile_image, bio`,
            [name, email, bio, passwordHash, currentUser.id]
        );

        const updatedUser = updated.rows[0];

        req.session.user = updatedUser;

        req.session.save((error) => {
            if (error) {
                return next(error);
            }

            res.render('pages/profile', {
                title: 'My Profile',
                user: updatedUser,
                error: null,
                success: 'Profile updated successfully!'
            });
        });

    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).render('pages/profile', {
                title: 'My Profile',
                user: {
                    ...req.session.user,
                    name: (req.body.name || '').trim(),
                    email: (req.body.email || '').trim().toLowerCase(),
                    bio: (req.body.bio || '').trim()
                },
                error: 'This email is already registered.',
                success: null
            });
        }

        next(error);
    }
});

// UPLOAD PROFILE PHOTO
router.post(
    '/profile/upload',
    requireLogin,
    upload.single('profileImage'),
    async (req, res, next) => {
        try {
            if (!req.file) {
                return res.redirect('/profile');
            }

          const oldImagePath = req.session.user.profile_image;

// Upload new profile image to Supabase
const imagePath = await uploadImage(
    req.file.path,
    req.file.filename,
    '',
    req.file.mimetype
);

const result = await pool.query(
    `UPDATE users
     SET profile_image = $1
     WHERE id = $2
     RETURNING id, name, email, role, profile_image, bio`,
    [imagePath, req.session.user.id]
);

// Remove temporary local image
await fs.promises.unlink(req.file.path).catch(() => {});

           if (result.rows.length === 0) {
    await deleteImage(imagePath);
    return res.redirect('/profile');
}

// Delete old profile image from Supabase
if (oldImagePath && oldImagePath !== imagePath) {
    await deleteImage(oldImagePath);
}

req.session.user = result.rows[0];

            req.session.save((error) => {
                if (error) {
                    return next(error);
                }

                res.redirect('/profile');
            });

        } catch (error) {
            next(error);
        }
    }
);

// PUBLIC AUTHOR PROFILE
router.get('/author/:id', async (req, res, next) => {
    try {
        const authorId = req.params.id;

        if (!/^\d+$/.test(authorId)) {
            return res.status(404).send('Author not found');
        }

        const authorResult = await pool.query(
            `SELECT id, name, bio, profile_image
             FROM users
             WHERE id = $1`,
            [authorId]
        );

        if (authorResult.rows.length === 0) {
            return res.status(404).send('Author not found');
        }

        const postsResult = await pool.query(
            `SELECT id, title, slug, excerpt, created_at
             FROM posts
             WHERE user_id = $1
             AND status = 'published'
             ORDER BY created_at DESC`,
            [authorId]
        );

        // GET FOLLOWERS COUNT
        const followersResult = await pool.query(
            `SELECT COUNT(*) AS count
             FROM follows
             WHERE following_id = $1`,
            [authorId]
        );
        // GET FOLLOWING COUNT
        const followingCountResult = await pool.query(
            `SELECT COUNT(*) AS count
     FROM follows
     WHERE follower_id = $1`,
            [authorId]
        );

        // CHECK IF CURRENT USER FOLLOWS THIS AUTHOR
        let isFollowing = false;

        if (req.session.user) {
            const followResult = await pool.query(
                `SELECT id
                 FROM follows
                 WHERE follower_id = $1
                 AND following_id = $2`,
                [req.session.user.id, authorId]
            );

            isFollowing = followResult.rows.length > 0;
        }

        res.render('pages/author-profile', {
            title: `${authorResult.rows[0].name} - Author Profile`,
            author: authorResult.rows[0],
            posts: postsResult.rows,
            followersCount: Number(followersResult.rows[0].count),
            isFollowing,
            followingCount: Number(followingCountResult.rows[0].count),
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;
