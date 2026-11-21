
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function moderateImage(filePath) {
    const apiUser = process.env.SIGHTENGINE_API_USER;
    const apiSecret = process.env.SIGHTENGINE_API_SECRET;

    if (!apiUser || !apiSecret) {
        const error = new Error(
            'Image moderation service is not configured.'
        );
        error.code = 'IMAGE_MODERATION_CONFIG_ERROR';
        throw error;
    }

    const form = new FormData();

    form.append('media', fs.createReadStream(filePath));
    form.append('models', 'nudity-2.1');
    form.append('api_user', apiUser);
    form.append('api_secret', apiSecret);

    let response;

    try {
        response = await axios.post(
            'https://api.sightengine.com/1.0/check.json',
            form,
            {
                headers: form.getHeaders(),
                timeout: 30000,
                maxBodyLength: Infinity
            }
        );
    } catch (err) {
        const error = new Error(
            'Image moderation service is temporarily unavailable. Please try again later.'
        );

        error.code = 'IMAGE_MODERATION_API_ERROR';

        if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
            error.code = 'IMAGE_MODERATION_TIMEOUT';
        }

        if (err.response) {
            error.status = err.response.status;
        }

        throw error;
    }

    const result = response.data;

    if (
        result.status !== 'success' ||
        !result.nudity
    ) {
        const error = new Error(
            'Image moderation could not be completed. Please try again.'
        );

        error.code = 'IMAGE_MODERATION_FAILED';
        throw error;
    }

    const nudity = result.nudity;

    const score = (value) =>
        typeof value === 'number' && Number.isFinite(value)
            ? value
            : 0;

    const blocked =
        score(nudity.sexual_activity) >= 0.50 ||
        score(nudity.sexual_display) >= 0.50 ||
        score(nudity.erotica) >= 0.50 ||
        score(nudity.suggestive_classes?.sextoy) >= 0.70;

    if (blocked) {
        const error = new Error(
            'This image contains prohibited adult or explicit content.'
        );

        error.code = 'IMAGE_MODERATION_BLOCKED';
        throw error;
    }

    return true;
}

async function moderateImages(files) {
    for (const file of files || []) {
        await moderateImage(file.path);
    }
}

module.exports = {
    moderateImage,
    moderateImages
};
