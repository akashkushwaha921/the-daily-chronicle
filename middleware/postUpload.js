
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const FileType = require('file-type');

const uploadDir = path.join(__dirname, '..', 'uploads', 'posts');

fs.mkdirSync(uploadDir, { recursive: true });

const allowedTypes = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    'image/webp': ['.webp'],
    'image/avif': ['.avif']
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },

    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const uniqueName = `${crypto.randomUUID()}${extension}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    if (!allowedTypes[file.mimetype]) {
        return cb(
            new Error('Only JPG, PNG, GIF, WEBP and AVIF images are allowed.')
        );
    }

    cb(null, true);
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 100
    }
});

// Verify the actual file contents after upload.
async function verifyImageFile(file) {
    const detected = await FileType.fromFile(file.path);

    if (!detected || !allowedTypes[detected.mime]) {
        throw new Error('Invalid image file. Please upload a genuine image.');
    }

    const extension = path.extname(file.originalname).toLowerCase();

    if (!allowedTypes[detected.mime].includes(extension)) {
        throw new Error('Image extension does not match its actual file type.');
    }
}

module.exports = upload;
module.exports.verifyImageFile = verifyImageFile;
