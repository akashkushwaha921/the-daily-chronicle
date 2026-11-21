
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { createNotification } = require('../utils/notifications');

// LOGIN CHECK
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
}

// FOLLOWERS LIST
router.get('/followers/:userId', async (req, res, next) => {
    try {
        const userId = req.params.userId;

        if (!/^\d+$/.test(userId)) {
            return res.status(404).send('User not found.');
        }

        const userResult = await pool.query(
            `SELECT id, name, profile_image, bio
             FROM users
             WHERE id = $1`,
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).send('User not found.');
        }

        const followersResult = await pool.query(
            `SELECT u.id, u.name, u.profile_image, u.bio
             FROM follows f
             JOIN users u ON u.id = f.follower_id
             WHERE f.following_id = $1
             ORDER BY u.name ASC`,
            [userId]
        );

        res.render('pages/follow-list', {
            title: 'Followers',
            profileUser: userResult.rows[0],
            users: followersResult.rows,
            listType: 'Followers'
        });

    } catch (error) {
        next(error);
    }
});

// FOLLOWING LIST
router.get('/following/:userId', async (req, res, next) => {
    try {
        const userId = req.params.userId;

        if (!/^\d+$/.test(userId)) {
            return res.status(404).send('User not found.');
        }

        const userResult = await pool.query(
            `SELECT id, name, profile_image, bio
             FROM users
             WHERE id = $1`,
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).send('User not found.');
        }

        const followingResult = await pool.query(
            `SELECT u.id, u.name, u.profile_image, u.bio
             FROM follows f
             JOIN users u ON u.id = f.following_id
             WHERE f.follower_id = $1
             ORDER BY u.name ASC`,
            [userId]
        );

        res.render('pages/follow-list', {
            title: 'Following',
            profileUser: userResult.rows[0],
            users: followingResult.rows,
            listType: 'Following'
        });

    } catch (error) {
        next(error);
    }
});

// FOLLOW / UNFOLLOW AUTHOR
router.post('/:authorId', requireLogin, async (req, res, next) => {
    try {
        console.log('FOLLOW ROUTE HIT:', req.params.authorId);

        const followerId = req.session.user.id;
        const followingId = req.params.authorId;

        if (!/^\d+$/.test(followingId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid author.'
            });
        }

        if (Number(followerId) === Number(followingId)) {
            return res.status(400).json({
                success: false,
                message: 'You cannot follow yourself.'
            });
        }

        const author = await pool.query(
            'SELECT id, name FROM users WHERE id = $1',
            [followingId]
        );

        if (author.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Author not found.'
            });
        }

        const existingFollow = await pool.query(
            `SELECT id FROM follows
             WHERE follower_id = $1 AND following_id = $2`,
            [followerId, followingId]
        );

        let following;

        if (existingFollow.rows.length > 0) {
            await pool.query(
                `DELETE FROM follows
                 WHERE follower_id = $1 AND following_id = $2`,
                [followerId, followingId]
            );

            following = false;
        } else {
            await pool.query(
                `INSERT INTO follows (follower_id, following_id)
         VALUES ($1, $2)`,
                [followerId, followingId]
            );

            following = true;

            // Notify user about the new follower
            try {
                await createNotification({
                    userId: followingId,
                    type: 'new_follower',
                    message: 'Someone started following you.',
                    relatedUserId: followerId
                });
            } catch (notificationError) {
                console.error('Follower notification error:', notificationError);
            }
        }

        const countResult = await pool.query(
            `SELECT COUNT(*) AS count
             FROM follows
             WHERE following_id = $1`,
            [followingId]
        );

        res.json({
            success: true,
            following,
            followersCount: Number(countResult.rows[0].count)
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;
