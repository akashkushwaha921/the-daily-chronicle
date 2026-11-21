
const express = require('express');
const pool = require('../config/db');

const router = express.Router();

// Login protection
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }

    next();
}

// User dashboard
router.get('/dashboard', requireLogin, async (req, res, next) => {
    try {
        const userId = req.session.user.id;

        // User's own articles
        const postsResult = await pool.query(
            `SELECT
                posts.id,
                posts.title,
                posts.slug,
                posts.status,
                posts.created_at,
                posts.published_at,
                categories.name AS category_name
             FROM posts
             LEFT JOIN categories ON posts.category_id = categories.id
             WHERE posts.user_id = $1
             ORDER BY posts.created_at DESC`,
            [userId]
        );

        // Pending articles for admin
        let pendingPosts = [];

        if (req.session.user.role === 'admin') {
            const pendingResult = await pool.query(
                `SELECT
                    posts.id,
                    posts.title,
                    posts.created_at,
                    users.name AS author_name,
                    categories.name AS category_name
                 FROM posts
                 LEFT JOIN users ON posts.user_id = users.id
                 LEFT JOIN categories ON posts.category_id = categories.id
                 WHERE posts.status = 'pending'
                 ORDER BY posts.created_at ASC`
            );

            pendingPosts = pendingResult.rows;
        }

        // Articles liked by the user
        const likedResult = await pool.query(
            `SELECT
                posts.id,
                posts.title,
                posts.slug,
                posts.published_at,
                categories.name AS category_name,
                users.name AS author_name
             FROM likes
             INNER JOIN posts ON likes.post_id = posts.id
             LEFT JOIN categories ON posts.category_id = categories.id
             LEFT JOIN users ON posts.user_id = users.id
             WHERE likes.user_id = $1
             AND posts.status = 'published'
             ORDER BY likes.created_at DESC`,
            [userId]
        );

        // Articles bookmarked by the user
        const bookmarkedResult = await pool.query(
            `SELECT
                posts.id,
                posts.title,
                posts.slug,
                posts.published_at,
                categories.name AS category_name,
                users.name AS author_name
             FROM bookmarks
             INNER JOIN posts ON bookmarks.post_id = posts.id
             LEFT JOIN categories ON posts.category_id = categories.id
             LEFT JOIN users ON posts.user_id = users.id
             WHERE bookmarks.user_id = $1
             AND posts.status = 'published'
             ORDER BY bookmarks.created_at DESC`,
            [userId]
        );

        // Latest published articles from followed authors
        const followingResult = await pool.query(
            `SELECT
                posts.id,
                posts.title,
                posts.slug,
                posts.excerpt,
                posts.published_at,
                categories.name AS category_name,
                users.id AS author_id,
                users.name AS author_name,
                users.profile_image AS author_image
             FROM follows
             INNER JOIN posts ON posts.user_id = follows.following_id
             INNER JOIN users ON users.id = posts.user_id
             LEFT JOIN categories ON categories.id = posts.category_id
             WHERE follows.follower_id = $1
             AND posts.status = 'published'
             ORDER BY posts.published_at DESC NULLS LAST
             LIMIT 20`,
            [userId]
        );

        res.render('pages/dashboard', {
            title: 'My Dashboard',
            posts: postsResult.rows,
            likedPosts: likedResult.rows,
            bookmarkedPosts: bookmarkedResult.rows,
            pendingPosts,
            followingPosts: followingResult.rows
        });

    } catch (error) {
        next(error);
    }
});

// Admin: Approve pending post
router.post(
    '/dashboard/posts/:id/approve',
    requireLogin,
    async (req, res, next) => {
        try {
            if (req.session.user.role !== 'admin') {
                return res.status(403).send('Access denied');
            }

            const postId = req.params.id;

            await pool.query(
                `UPDATE posts
                 SET status = 'published',
                     published_at = NOW()
                 WHERE id = $1
                 AND status = 'pending'`,
                [postId]
            );

            res.redirect('/dashboard');

        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;
