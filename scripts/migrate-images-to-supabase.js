require('dotenv').config();

const path = require('path');
const fs = require('fs/promises');
const pool = require('../config/db');
const { uploadImage } = require('../config/storage');
const FileType = require('file-type');

const uploadsDir = path.join(__dirname, '..', 'uploads');

async function main() {
    const postsResult = await pool.query(
        `SELECT DISTINCT image_path
         FROM post_images
         WHERE image_path LIKE '/uploads/%'`
    );

    const profilesResult = await pool.query(
        `SELECT DISTINCT profile_image
         FROM users
         WHERE profile_image LIKE '/uploads/%'`
    );

    const files = new Map();

    for (const row of postsResult.rows) {
        const oldPath = row.image_path;

        if (!oldPath.startsWith('/uploads/posts/')) {
            throw new Error(`Unexpected post image path: ${oldPath}`);
        }

        const filename = path.basename(oldPath);

        files.set(oldPath, {
            oldPath,
            localPath: path.join(uploadsDir, 'posts', filename),
            filename,
            folder: 'posts'
        });
    }

    for (const row of profilesResult.rows) {
        const oldPath = row.profile_image;

        if (!oldPath.startsWith('/uploads/')) {
            throw new Error(`Unexpected profile image path: ${oldPath}`);
        }

        const filename = path.basename(oldPath);

        if (filename !== oldPath.slice('/uploads/'.length)) {
            throw new Error(`Unexpected profile image path: ${oldPath}`);
        }

        files.set(oldPath, {
            oldPath,
            localPath: path.join(uploadsDir, filename),
            filename,
            folder: ''
        });
    }

    console.log(`Found ${files.size} unique old images.`);

    // Check every local file before uploading anything.
    for (const file of files.values()) {
        await fs.access(file.localPath);
    }

    const uploaded = new Map();

    for (const file of files.values()) {
        const detected = await FileType.fromFile(file.localPath);

        if (!detected || !detected.mime.startsWith('image/')) {
            throw new Error(`Invalid image file: ${file.filename}`);
        }

        console.log(`Uploading: ${file.filename}`);

        const publicUrl = await uploadImage(
            file.localPath,
            file.filename,
            file.folder,
            detected.mime
        );

        uploaded.set(file.oldPath, publicUrl);
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        for (const [oldPath, publicUrl] of uploaded) {
            if (oldPath.startsWith('/uploads/posts/')) {
                await client.query(
                    `UPDATE post_images
                     SET image_path = $1
                     WHERE image_path = $2`,
                    [publicUrl, oldPath]
                );
            } else {
                await client.query(
                    `UPDATE users
                     SET profile_image = $1
                     WHERE profile_image = $2`,
                    [publicUrl, oldPath]
                );
            }
        }

        await client.query('COMMIT');

        console.log('\nImage migration completed successfully.');
        console.log(`Uploaded and updated: ${uploaded.size} unique images.`);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

main()
    .catch(error => {
        console.error('\nImage migration failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
