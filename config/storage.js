const { createClient } = require('@supabase/supabase-js');
const fs = require('fs/promises');
const path = require('path');

let supabase = null;

function getSupabase() {
    if (supabase) return supabase;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        throw new Error('Supabase Storage credentials are missing in .env');
    }

    supabase = createClient(url, key);
    return supabase;
}

// Upload a local image to Supabase Storage
async function uploadImage(localPath, filename, folder = '', contentType) {
    const client = getSupabase();

    const safeFilename = path.basename(filename);
    const objectPath = folder
        ? `${folder}/${safeFilename}`
        : safeFilename;

    const fileBuffer = await fs.readFile(localPath);

    const { error } = await client.storage
        .from('uploads')
        .upload(objectPath, fileBuffer, {
            contentType,
            upsert: true,
            cacheControl: '31536000'
        });

    if (error) throw error;

    const { data } = client.storage
        .from('uploads')
        .getPublicUrl(objectPath);

    return data.publicUrl;
}

// Delete an image from Supabase Storage
async function deleteImage(imagePath) {
    if (!imagePath) return false;

    let objectPath = null;

    try {
        const parsedUrl = new URL(imagePath);
        const marker = '/storage/v1/object/public/uploads/';

        if (parsedUrl.pathname.includes(marker)) {
            objectPath = decodeURIComponent(
                parsedUrl.pathname.split(marker)[1]
            );
        }
    } catch {
        // The value may be an old local path.
    }

    // Support old database paths during migration.
    if (!objectPath && imagePath.startsWith('/uploads/posts/')) {
        objectPath = `posts/${path.basename(imagePath)}`;
    } else if (!objectPath && imagePath.startsWith('/uploads/')) {
        objectPath = path.basename(imagePath);
    }

    if (!objectPath) return false;

    const { error } = await getSupabase()
        .storage
        .from('uploads')
        .remove([objectPath]);

    if (error) throw error;

    return true;
}

module.exports = {
    uploadImage,
    deleteImage
};
