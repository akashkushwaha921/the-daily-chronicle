
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const { createNotification } = require('../utils/notifications');

// Check whether user is logged in
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
}

// Show notifications
router.get('/', requireLogin, async (req, res, next) => {
    try {
        const userId = req.session.user.id;

        const result = await pool.query(
            `SELECT
                n.id,
                n.type,
                n.message,
                n.post_id,
                n.related_user_id,
                n.is_read,
                n.created_at,
                p.slug AS post_slug
             FROM notifications n
             LEFT JOIN posts p ON p.id = n.post_id
             WHERE n.user_id = $1
             ORDER BY n.created_at DESC
             LIMIT 50`,
            [userId]
        );

        res.render('pages/notifications', {
            title: 'Notifications',
            notifications: result.rows,
            user: req.session.user
        });

    } catch (error) {
        next(error);
    }
});

// Get live unread notification count
router.get('/unread-count', requireLogin, async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT COUNT(*) AS count
             FROM notifications
             WHERE user_id = $1 AND is_read = FALSE`,
            [req.session.user.id]
        );

        res.json({
            count: Number(result.rows[0].count)
        });

    } catch (error) {
        next(error);
    }
});


// Open notification and automatically mark it as read
router.get('/:id/open', requireLogin, async (req, res, next) => {
    try {
        const notificationId = req.params.id;
        const userId = req.session.user.id;

        if (!/^\d+$/.test(notificationId)) {
            return res.redirect('/notifications');
        }

        const result = await pool.query(
            `SELECT
                n.id,
                n.type,
                n.post_id,
                n.related_user_id,
                p.slug AS post_slug
             FROM notifications n
             LEFT JOIN posts p ON p.id = n.post_id
             WHERE n.id = $1 AND n.user_id = $2`,
            [notificationId, userId]
        );

        if (result.rows.length === 0) {
            return res.redirect('/notifications');
        }

        const notification = result.rows[0];

        await pool.query(
            `UPDATE notifications
             SET is_read = TRUE
             WHERE id = $1 AND user_id = $2`,
            [notificationId, userId]
        );

        if (notification.type === 'new_pending_article') {
            if (req.session.user.role !== 'admin') {
                return res.redirect('/notifications');
            }

            return res.redirect(`/admin/articles/${notification.post_id}`);
        }

        if (notification.type === 'new_follower' && notification.related_user_id) {
            return res.redirect(`/author/${notification.related_user_id}`);
        }

        if (notification.post_slug) {
            return res.redirect(`/posts/${notification.post_slug}`);
        }

        return res.redirect('/notifications');

    } catch (error) {
        next(error);
    }
});


// Mark one notification as read
router.post('/:id/read', requireLogin, async (req, res, next) => {
    try {
        await pool.query(
            `UPDATE notifications
             SET is_read = TRUE
             WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.session.user.id]
        );

        res.redirect('/notifications');

    } catch (error) {
        next(error);
    }
});

// Mark all notifications as read
router.post('/read-all', requireLogin, async (req, res, next) => {
    try {
        await pool.query(
            `UPDATE notifications
             SET is_read = TRUE
             WHERE user_id = $1 AND is_read = FALSE`,
            [req.session.user.id]
        );

        res.redirect('/notifications');

    } catch (error) {
        next(error);
    }
});

// Delete one notification
router.post('/:id/delete', requireLogin, async (req, res, next) => {
    try {
        await pool.query(
            `DELETE FROM notifications
             WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.session.user.id]
        );

        res.redirect('/notifications');

    } catch (error) {
        next(error);
    }
});

module.exports = router;
