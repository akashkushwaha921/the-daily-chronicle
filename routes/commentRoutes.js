
const express = require('express');
const pool = require('../config/db');
const { createNotification } = require('../utils/notifications');

const router = express.Router();

// Login protection
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
}

// Submit a comment
router.post('/:postId', requireLogin, async (req, res, next) => {
    try {
        const postId = req.params.postId;
        const userId = req.session.user.id;
        const content = (req.body.content || '').trim();

        if (!/^\d+$/.test(postId)) {
            return res.status(400).send('Invalid post ID');
        }

        if (!content || content.length > 2000) {
            return res.status(400).send('Comment must be between 1 and 2000 characters.');
        }

        const postResult = await pool.query(
            `SELECT id, slug, user_id, title FROM posts
     WHERE id = $1 AND status = 'published'`,
            [postId]
        );

        if (postResult.rows.length === 0) {
            return res.status(404).send('Article not found');
        }

        await pool.query(
            `INSERT INTO comments (post_id, user_id, content)
             VALUES ($1, $2, $3)`,
            [postId, userId, content]
        );

        // Notify article author about the new comment
        const article = postResult.rows[0];

        if (String(article.user_id) !== String(userId)) {
            try {
                const commenterName = req.session.user.name || 'Someone';

                await createNotification({
                    userId: article.user_id,
                    type: 'new_comment',
                    message: `${commenterName} commented on your article "${article.title}": "${content}"`,
                    postId: article.id,
                    relatedUserId: userId
                });
            } catch (notificationError) {
                console.error('Comment notification error:', notificationError);
            }
        }


        res.redirect(`/posts/${postResult.rows[0].slug}`);

    } catch (error) {
        next(error);
    }
});

module.exports = router;
