require('dotenv').config();
const pool = require('../config/db');

async function check() {
    const posts = await pool.query(`
        SELECT
            COUNT(*) FILTER (
                WHERE image_path LIKE 'https://%/storage/v1/object/public/uploads/posts/%'
            )::int AS migrated,
            COUNT(*) FILTER (
                WHERE image_path LIKE '/uploads/%'
            )::int AS old_paths
        FROM post_images
    `);

    const profiles = await pool.query(`
        SELECT
            COUNT(*) FILTER (
                WHERE profile_image LIKE 'https://%/storage/v1/object/public/uploads/%'
            )::int AS migrated,
            COUNT(*) FILTER (
                WHERE profile_image LIKE '/uploads/%'
            )::int AS old_paths
        FROM users
    `);

    console.log('POST IMAGES');
    console.log('Migrated:', posts.rows[0].migrated);
    console.log('Old paths remaining:', posts.rows[0].old_paths);

    console.log('\nPROFILE IMAGES');
    console.log('Migrated:', profiles.rows[0].migrated);
    console.log('Old paths remaining:', profiles.rows[0].old_paths);
}

check()
    .catch(console.error)
    .finally(() => pool.end());
