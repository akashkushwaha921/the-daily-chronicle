
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

// Allowed report reasons
const allowedReasons = [
    'spam',
    'harassment',
    'misinformation',
    'inappropriate',
    'other'
];

// Report an article
router.post('/post/:postId', requireLogin, async (req, res, next) => {
    try {
        const { postId } = req.params;
        const reporterId = req.session.user.id;
        const reason = (req.body.reason || '').trim();
        const details = (req.body.details || '').trim();

        if (!/^\d+$/.test(postId)) {
            return res.status(400).send('Invalid article ID');
        }

        if (!allowedReasons.includes(reason) || details.length > 1000) {
            return res.status(400).send('Invalid report information');
        }

        const postResult = await pool.query(
            `SELECT id, slug, user_id
             FROM posts
             WHERE id = $1 AND status = 'published'`,
            [postId]
        );

        if (postResult.rows.length === 0) {
            return res.status(404).send('Article not found');
        }

        const post = postResult.rows[0];

        if (String(post.user_id) === String(reporterId)) {
            return res.status(403).send('You cannot report your own article.');
        }

        await pool.query(
            `INSERT INTO reports (reporter_id, post_id, reason, details)
             VALUES ($1, $2, $3, $4)`,
            [reporterId, postId, reason, details || null]
        );

        return res.redirect(`/posts/${post.slug}?report=success`);

    } catch (error) {
        if (error.code === '23505') {
            const postResult = await pool.query(
                'SELECT slug FROM posts WHERE id = $1',
                [req.params.postId]
            );

            if (postResult.rows.length > 0) {
                return res.redirect(`/posts/${postResult.rows[0].slug}?report=duplicate`);
            }
        }

        next(error);
    }
});

// Report a comment
router.post('/comment/:commentId', requireLogin, async (req, res, next) => {
    try {
        const { commentId } = req.params;
        const reporterId = req.session.user.id;
        const reason = (req.body.reason || '').trim();
        const details = (req.body.details || '').trim();

        if (!/^\d+$/.test(commentId)) {
            return res.status(400).send('Invalid comment ID');
        }

        if (!allowedReasons.includes(reason) || details.length > 1000) {
            return res.status(400).send('Invalid report information');
        }

        const commentResult = await pool.query(
            `SELECT c.id, c.user_id, p.slug
             FROM comments c
             JOIN posts p ON p.id = c.post_id
             WHERE c.id = $1 AND p.status = 'published'`,
            [commentId]
        );

        if (commentResult.rows.length === 0) {
            return res.status(404).send('Comment not found');
        }

        const comment = commentResult.rows[0];

        if (String(comment.user_id) === String(reporterId)) {
            return res.status(403).send('You cannot report your own comment.');
        }

        await pool.query(
            `INSERT INTO reports (reporter_id, comment_id, reason, details)
             VALUES ($1, $2, $3, $4)`,
            [reporterId, commentId, reason, details || null]
        );

        return res.redirect(`/posts/${comment.slug}?report=success`);

    } catch (error) {
        if (error.code === '23505') {
            const commentResult = await pool.query(
                `SELECT p.slug
                 FROM comments c
                 JOIN posts p ON p.id = c.post_id
                 WHERE c.id = $1`,
                [req.params.commentId]
            );

            if (commentResult.rows.length > 0) {
                return res.redirect(`/posts/${commentResult.rows[0].slug}?report=duplicate`);
            }
        }

        next(error);
    }
});

module.exports = router;
