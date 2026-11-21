
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        posts.id,
        posts.title,
        posts.slug,
        posts.excerpt,
        posts.published_at,
        users.name AS author_name,
        categories.name AS category_name
      FROM posts
      LEFT JOIN users ON posts.user_id = users.id
      LEFT JOIN categories ON posts.category_id = categories.id
      WHERE posts.status = 'published'
      ORDER BY posts.published_at DESC NULLS LAST
      LIMIT 6
    `);

    res.render('pages/home', {
      title: 'The Daily Chronicle',
      posts: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// ABOUT PAGE ROUTE
router.get('/about', (req, res) => {
  res.render('pages/about', {
    title: 'About Us | The Daily Chronicle'
  });
});


// EXPLORE PAGE ROUTE
router.get('/explore', async (req, res, next) => {
  try {
    const sort = req.query.sort === 'oldest' ? 'oldest' : 'latest';

    const orderBy = sort === 'oldest' ? 'ASC' : 'DESC';

    const [categoriesResult, postsResult] = await Promise.all([
      pool.query(`
        SELECT
          categories.id,
          categories.name,
          categories.slug,
          COUNT(posts.id)::int AS post_count
        FROM categories
        LEFT JOIN posts
          ON posts.category_id = categories.id
          AND posts.status = 'published'
        GROUP BY categories.id, categories.name, categories.slug
        ORDER BY categories.name ASC
      `),

      pool.query(`
        SELECT
          posts.id,
          posts.title,
          posts.slug,
          posts.excerpt,
          posts.published_at,
          users.name AS author_name,
          categories.name AS category_name
        FROM posts
        LEFT JOIN users ON posts.user_id = users.id
        LEFT JOIN categories ON posts.category_id = categories.id
        WHERE posts.status = 'published'
        ORDER BY posts.published_at ${orderBy} NULLS LAST
        LIMIT 6
      `)
    ]);

    res.render('pages/explore', {
      title: 'Explore | The Daily Chronicle',
      categories: categoriesResult.rows,
      posts: postsResult.rows,
      sort
    });

  } catch (error) {
    next(error);
  }
});



// SEARCH PAGE ROUTE
router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();

    const sort = req.query.sort === 'oldest' ? 'oldest' : 'latest';
    const orderBy = sort === 'oldest' ? 'ASC' : 'DESC';

    const limit = 6;
    let currentPage = Math.max(parseInt(req.query.page, 10) || 1, 1);
    let posts = [];
    let totalPosts = 0;
    let totalPages = 0;

    if (q) {
      const searchTerm = `%${q}%`;

      const whereClause = `
        FROM posts
        LEFT JOIN users ON posts.user_id = users.id
        LEFT JOIN categories ON posts.category_id = categories.id
        WHERE posts.status = 'published'
        AND (
          posts.title ILIKE $1
          OR posts.excerpt ILIKE $1
          OR posts.content ILIKE $1
          OR categories.name ILIKE $1
          OR users.name ILIKE $1
        )
      `;

      // TOTAL SEARCH RESULTS
      const countResult = await pool.query(`
        SELECT COUNT(*)::int AS total
        ${whereClause}
      `, [searchTerm]);

      totalPosts = countResult.rows[0].total;
      totalPages = Math.ceil(totalPosts / limit);

      currentPage = totalPages > 0
        ? Math.min(currentPage, totalPages)
        : 1;

      const offset = (currentPage - 1) * limit;

      // PAGINATED SEARCH RESULTS
      const result = await pool.query(`
        SELECT
          posts.id,
          posts.title,
          posts.slug,
          posts.excerpt,
          posts.published_at,
          users.name AS author_name,
          categories.name AS category_name
        ${whereClause}
        ORDER BY posts.published_at ${orderBy} NULLS LAST
        LIMIT $2 OFFSET $3
      `, [searchTerm, limit, offset]);

      posts = result.rows;
    }

    res.render('pages/search', {
      title: q ? `Search Results for "${q}"` : 'Search Articles',
      q,
      posts,
      currentPage,
      totalPages,
      totalPosts,
      sort
    });

  } catch (error) {
    next(error);
  }
});

// CATEGORY PAGE ROUTE
router.get('/categories/:category', async (req, res, next) => {
  try {
    const category = req.params.category;

    // Only allow safe sorting options
    const sort = req.query.sort === 'oldest' ? 'oldest' : 'latest';

    const orderBy = sort === 'oldest'
      ? 'ASC'
      : 'DESC';

    const result = await pool.query(`
      SELECT
        posts.id,
        posts.title,
        posts.slug,
        posts.excerpt,
        posts.published_at,
        users.name AS author_name,
        categories.name AS category_name
      FROM posts
      LEFT JOIN users ON posts.user_id = users.id
      LEFT JOIN categories ON posts.category_id = categories.id
      WHERE posts.status = 'published'
      AND LOWER(REPLACE(categories.name, ' ', '-')) = LOWER($1)
      ORDER BY posts.published_at ${orderBy} NULLS LAST
    `, [category]);

    res.render('pages/category', {
      title: category.charAt(0).toUpperCase() + category.slice(1) + ' Posts',
      category,
      posts: result.rows,
      sort
    });

  } catch (error) {
    next(error);
  }
});

// LIVE SEARCH SUGGESTIONS API
router.get('/search-suggestions', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();

    if (q.length < 2) {
      return res.json([]);
    }

    const searchTerm = `%${q}%`;

    const result = await pool.query(`
      SELECT
        title,
        slug
      FROM posts
      WHERE status = 'published'
      AND (
        title ILIKE $1
        OR excerpt ILIKE $1
        OR content ILIKE $1
      )
      ORDER BY published_at DESC NULLS LAST
      LIMIT 5
    `, [searchTerm]);

    res.json(result.rows);

  } catch (error) {
    next(error);
  }
});

module.exports = router;
