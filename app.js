
require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { csrfSync } = require('csrf-sync');

const pool = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const indexRoutes = require('./routes/indexRoutes');
const postRoutes = require('./routes/postRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const profileRoutes = require('./routes/profileRoutes');
const interactionRoutes = require('./routes/interactionRoutes');
const followRoutes = require('./routes/followRoutes');
const commentRoutes = require('./routes/commentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const reportRoutes = require('./routes/reportRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const contactRoutes = require('./routes/contactRoutes');

const app = express();

// Check required environment variables
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is missing from .env');
}

// EJS configuration
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Helmet security configuration
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        imgSrc: [
          "'self'",
          'data:',
          'https://idhfyufdqadswxvndjxt.supabase.co'
        ],

        upgradeInsecureRequests:
          process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
  })
);

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store user sessions in PostgreSQL
app.use(session({
  store: new PgSession({
    pool: pool,
    tableName: 'user_sessions',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

// Check whether a logged-in user's account is still active
app.use(async (req, res, next) => {
  try {
    if (!req.session.user) {
      return next();
    }

    const result = await pool.query(
      `SELECT is_blocked
       FROM users
       WHERE id = $1`,
      [req.session.user.id]
    );

    if (result.rows.length === 0 || result.rows[0].is_blocked) {
      return req.session.destroy((error) => {
        if (error) return next(error);

        res.clearCookie('connect.sid');
        res.redirect('/auth/login');
      });
    }

    next();

  } catch (error) {
    next(error);
  }
});

// CSRF protection setup
const {
  csrfSynchronisedProtection,
  generateToken
} = csrfSync({
  getTokenFromRequest: (req) => {
    return req.body?._csrf || req.headers['x-csrf-token'];
  }
});

// Make logged-in user available in all EJS pages
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

// Make unread notification count available on every page
app.use(async (req, res, next) => {
  res.locals.unreadNotificationCount = 0;

  if (!req.session.user) {
    return next();
  }

  try {
    const result = await pool.query(
      `SELECT COUNT(*) AS count
       FROM notifications
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.session.user.id]
    );

    res.locals.unreadNotificationCount = Number(result.rows[0].count);
    next();

  } catch (error) {
    next(error);
  }
});

// Normal website routes
app.use('/', indexRoutes);
app.use('/auth', authRoutes);

// Contact routes with CSRF protection
app.use(
  '/contact',
  csrfSynchronisedProtection,
  (req, res, next) => {
    res.locals.csrfToken = generateToken(req);
    next();
  },
  contactRoutes
);

// Generate CSRF token for article pages and report forms
app.use('/posts', (req, res, next) => {
  if (req.method === 'GET') {
    res.locals.csrfToken = generateToken(req);
    res.locals.reportStatus = req.query.report || null;
  }

  next();
}, postRoutes);

app.use('/', dashboardRoutes);
app.use('/', profileRoutes);
app.use('/interactions', interactionRoutes);
app.use('/follow', followRoutes);
app.use('/comments', commentRoutes);

// Notification routes with CSRF protection
app.use(
  '/notifications',
  csrfSynchronisedProtection,
  (req, res, next) => {
    if (req.method === 'GET') {
      res.locals.csrfToken = generateToken(req);
    }
    next();
  },
  notificationRoutes
);

// Report routes with CSRF protection
app.use('/reports', csrfSynchronisedProtection, reportRoutes);

// Admin routes with CSRF protection
app.use(
  '/admin',
  csrfSynchronisedProtection,
  (req, res, next) => {
    res.locals.csrfToken = generateToken(req);
    next();
  },
  adminRoutes
);

// 404 page
app.use((req, res) => {
  res.status(404).render('errors/404', {
    title: 'Page Not Found'
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Application Error:', error);

  if (res.headersSent) {
    return next(error);
  }

  let statusCode = 500;
  let message = 'Something went wrong. Please try again later.';

  // Multer upload errors
  if (error.name === 'MulterError') {
    statusCode = 400;

    if (error.code === 'LIMIT_FILE_SIZE') {
      message = 'Each image must be smaller than 5 MB.';
    } else if (
      error.code === 'LIMIT_FILE_COUNT' ||
      error.code === 'LIMIT_UNEXPECTED_FILE'
    ) {
      message = 'You can upload a maximum of 100 images.';
    } else {
      message = 'There was a problem uploading your images.';
    }
  }

  // Image moderation API errors
  else if (
    error.code === 'IMAGE_MODERATION_API_ERROR' ||
    error.code === 'IMAGE_MODERATION_TIMEOUT' ||
    error.code === 'IMAGE_MODERATION_FAILED' ||
    error.code === 'IMAGE_MODERATION_CONFIG_ERROR'
  ) {
    statusCode = 503;
    message = 'Image moderation service is temporarily unavailable. Please try again later.';
  }

  // Explicit image content blocked by moderation
  else if (error.code === 'IMAGE_MODERATION_BLOCKED') {
    statusCode = 400;
    message = 'This image contains prohibited adult or explicit content. Please upload another image.';
  }

  // Image validation errors
  else if (
    error.message === 'Invalid image file. Please upload a genuine image.' ||
    error.message === 'Image extension does not match its actual file type.' ||
    error.message === 'Only JPG, PNG, GIF, WEBP and AVIF images are allowed.'
  ) {
    statusCode = 400;
    message = error.message;
  }

  res.status(statusCode).send(message);
});

module.exports = app;
