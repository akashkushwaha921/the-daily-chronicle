
const express = require('express');
const router = express.Router();
const { sendEmail } = require('../utils/mailer');

// CONTACT PAGE
router.get('/', (req, res) => {
    res.render('pages/contact', {
        title: 'Contact Us | The Daily Chronicle',
        csrfToken: res.locals.csrfToken,
        error: null,
        success: null,
        formData: {}
    });
});

// SEND CONTACT MESSAGE
router.post('/', async (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        const email = (req.body.email || '').trim().toLowerCase();
        const subject = (req.body.subject || '').trim();
        const message = (req.body.message || '').trim();
        const website = (req.body.website || '').trim();

        const formData = { name, email, subject, message };

        // Honeypot spam protection
        if (website) {
            return res.redirect('/contact');
        }

        if (!name || !email || !subject || !message) {
            return res.status(400).render('pages/contact', {
                title: 'Contact Us | The Daily Chronicle',
                csrfToken: res.locals.csrfToken,
                error: 'Please fill in all fields.',
                success: null,
                formData
            });
        }

        if (
            name.length > 120 ||
            email.length > 255 ||
            subject.length > 150 ||
            message.length > 5000 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
            return res.status(400).render('pages/contact', {
                title: 'Contact Us | The Daily Chronicle',
                csrfToken: res.locals.csrfToken,
                error: 'Please check your details and try again.',
                success: null,
                formData
            });
        }

        await sendEmail({
            to: process.env.ADMIN_EMAIL,
            subject: `Contact Form: ${subject}`,
            text: `New message from The Daily Chronicle contact form.

Name: ${name}
Email: ${email}
Subject: ${subject}

Message:
${message}`
        });

        res.render('pages/contact', {
            title: 'Contact Us | The Daily Chronicle',
            csrfToken: res.locals.csrfToken,
            error: null,
            success: 'Your message has been sent successfully!',
            formData: {}
        });

    } catch (error) {
        console.error('Contact form email failed:', error.message);

        res.status(500).render('pages/contact', {
            title: 'Contact Us | The Daily Chronicle',
            csrfToken: res.locals.csrfToken,
            error: 'Unable to send your message right now. Please try again later.',
            success: null,
            formData: {
                name: req.body.name || '',
                email: req.body.email || '',
                subject: req.body.subject || '',
                message: req.body.message || ''
            }
        });
    }
});

module.exports = router;
