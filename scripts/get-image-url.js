require('dotenv').config();
const pool = require('../config/db');

async function check() {
    const result = await pool.query(`
        SELECT image_path
        FROM post_images
        WHERE image_path LIKE 'https://%'
        LIMIT 1
    `);

    console.log(result.rows[0]?.image_path || 'No image URL found');
}

check()
    .catch(console.error)
    .finally(() => pool.end());
