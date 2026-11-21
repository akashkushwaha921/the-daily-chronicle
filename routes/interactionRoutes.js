
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Check whether user is logged in
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Please login first'
        });
    }

    next();
}

// Like / Unlike a post
router.post('/posts/:postId/like', requireLogin, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const postId = Number(req.params.postId);

        if (!Number.isSafeInteger(postId) || postId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid post ID'
            });
        }

        const result = await pool.query(
            `INSERT INTO likes (user_id, post_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, post_id) DO NOTHING
       RETURNING post_id`,
            [userId, postId]
        );

        let liked = result.rowCount > 0;

        if (!liked) {
            await pool.query(
                'DELETE FROM likes WHERE user_id = $1 AND post_id = $2',
                [userId, postId]
            );
        }

        const countResult = await pool.query(
            'SELECT COUNT(*) FROM likes WHERE post_id = $1',
            [postId]
        );

        res.json({
            success: true,
            liked,
            likesCount: Number(countResult.rows[0].count)
        });

    } catch (error) {
        console.error('Like error:', error);
        res.status(500).json({
            success: false,
            message: 'Something went wrong'
        });
    }
});

// Bookmark / Remove Bookmark a post
router.post('/posts/:postId/bookmark', requireLogin, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const postId = Number(req.params.postId);

        if (!Number.isSafeInteger(postId) || postId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid post ID'
            });
        }

        const result = await pool.query(
            `INSERT INTO bookmarks (user_id, post_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, post_id) DO NOTHING
       RETURNING post_id`,
            [userId, postId]
        );

        let bookmarked = result.rowCount > 0;

        if (!bookmarked) {
            await pool.query(
                'DELETE FROM bookmarks WHERE user_id = $1 AND post_id = $2',
                [userId, postId]
            );
        }

        res.json({
            success: true,
            bookmarked
        });

    } catch (error) {
        console.error('Bookmark error:', error);
        res.status(500).json({
            success: false,
            message: 'Something went wrong'
        });
    }
});

module.exports = router;
