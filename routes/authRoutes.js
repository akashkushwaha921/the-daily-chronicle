
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { sendEmail } = require('../utils/mailer');

const router = express.Router();

// ========================================
// REDIRECT LOGGED-IN USERS
// ========================================
const redirectLoggedInUser = (req, res, next) => {
    if (req.session.user) {
        return res.redirect(
            req.session.user.role === 'admin' ? '/admin' : '/'
        );
    }

    next();
};

// ========================================
// REGISTRATION PAGE
// ========================================
router.get('/register', redirectLoggedInUser, (req, res) => {
    res.render('auth/register', {
        title: 'Create Account',
        error: null,
        formData: {}
    });
});

// ========================================
// CREATE NEW ACCOUNT
// ========================================
router.post('/register', async (req, res, next) => {
    try {
        const name = (req.body.name || '').trim();
        const email = (req.body.email || '').trim().toLowerCase();
        const password = req.body.password || '';

        if (!name || !email || !password) {
            return res.status(400).render('auth/register', {
                title: 'Create Account',
                error: 'All fields are required.',
                formData: { name, email }
            });
        }

        if (name.length > 120 || email.length > 255) {
            return res.status(400).render('auth/register', {
                title: 'Create Account',
                error: 'Name or email is too long.',
                formData: { name, email }
            });
        }

        if (
            password.length < 8 ||
            Buffer.byteLength(password, 'utf8') > 72
        ) {
            return res.status(400).render('auth/register', {
                title: 'Create Account',
                error: 'Password must be at least 8 characters and no more than 72 bytes.',
                formData: { name, email }
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `INSERT INTO users (name, email, password_hash)
             VALUES ($1, $2, $3)
             RETURNING id, name, email, role, profile_image`,
            [name, email, passwordHash]
        );

        const user = result.rows[0];

        req.session.regenerate((error) => {
            if (error) return next(error);

            req.session.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                profile_image: user.profile_image
            };
            req.session.save((saveError) => {
                if (saveError) return next(saveError);

                sendEmail({
                    to: process.env.ADMIN_EMAIL,
                    subject: 'New User Registration - The Daily Chronicle',
                    text: `A new user has registered on The Daily Chronicle.

              Name: ${user.name}
              Email: ${user.email}
              User ID: ${user.id}`
                }).catch((error) => {
                    console.error('Registration email failed:', error.message);
                });

                res.redirect('/');
            });
        });

    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).render('auth/register', {
                title: 'Create Account',
                error: 'This email is already registered.',
                formData: {
                    name: (req.body.name || '').trim(),
                    email: (req.body.email || '').trim().toLowerCase()
                }
            });
        }

        next(error);
    }
});

// ========================================
// LOGIN PAGE
// ========================================
router.get('/login', redirectLoggedInUser, (req, res) => {
    res.render('auth/login', {
        title: 'Sign In',
        error: null,
        email: ''
    });
});

// ========================================
// LOGIN FORM SUBMISSION
// ========================================
router.post('/login', async (req, res, next) => {
    try {
        const email = (req.body.email || '').trim().toLowerCase();
        const password = req.body.password || '';

        if (!email || !password) {
            return res.status(400).render('auth/login', {
                title: 'Sign In',
                error: 'Please enter your email and password.',
                email
            });
        }

        const result = await pool.query(
            `SELECT id, name, email, password_hash, role, profile_image, is_blocked
     FROM users
     WHERE email = $1`,
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).render('auth/login', {
                title: 'Sign In',
                error: 'Invalid email or password.',
                email
            });
        }

        const user = result.rows[0];

        const passwordMatches = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatches) {
            return res.status(401).render('auth/login', {
                title: 'Sign In',
                error: 'Invalid email or password.',
                email
            });
        }
        if (user.is_blocked) {
            return res.status(403).render('auth/login', {
                title: 'Sign In',
                error: 'Your account has been blocked. Please contact the administrator.',
                email
            });
        }


        req.session.regenerate((error) => {
            if (error) return next(error);

            req.session.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                profile_image: user.profile_image
            };

            req.session.save((saveError) => {
                if (saveError) return next(saveError);

                // Admin goes to admin dashboard
                // Reader goes to homepage
                res.redirect(
                    user.role === 'admin' ? '/admin' : '/'
                );
            });
        });

    } catch (error) {
        next(error);
    }
});

// ========================================
// LOGOUT
// ========================================
router.post('/logout', (req, res, next) => {
    req.session.destroy((error) => {
        if (error) return next(error);

        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

module.exports = router;
