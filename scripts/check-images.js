require('dotenv').config();
const pool = require('../config/db');

async function check() {
    const posts = await pool.query(
        "SELECT COUNT(DISTINCT image_path)::int AS total FROM post_images WHERE image_path LIKE '/uploads/%'"
    );

    const profiles = await pool.query(
        "SELECT COUNT(DISTINCT profile_image)::int AS total FROM users WHERE profile_image LIKE '/uploads/%'"
    );

    console.log('Old post images:', posts.rows[0].total);
    console.log('Old profile images:', profiles.rows[0].total);
    console.log('Total:', posts.rows[0].total + profiles.rows[0].total);
}

check()
    .catch(console.error)
    .finally(() => pool.end());
