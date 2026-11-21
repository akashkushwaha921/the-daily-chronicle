
const pool = require('../config/db');

async function createNotification({
    userId,
    type,
    message,
    postId = null,
    relatedUserId = null
}) {
    if (!userId || !type || !message) {
        throw new Error('userId, type and message are required.');
    }

    await pool.query(
        `INSERT INTO notifications
            (user_id, type, message, post_id, related_user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, type, message, postId, relatedUserId]
    );
}

module.exports = {
    createNotification
};
