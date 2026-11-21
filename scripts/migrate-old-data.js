require('dotenv').config();
const { Client } = require('pg');

const source = new Client({
  host: 'localhost',
  port: 5433,
  database: 'daily_chronicle',
  user: 'postgres',
  password: process.env.OLD_DB_PASSWORD
});

const target = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const idMap = {
  users: new Map(),
  categories: new Map(),
  posts: new Map(),
  comments: new Map()
};

function mapped(map, id, label) {
  if (id === null || id === undefined) return null;
  const value = map.get(String(id));
  if (value === undefined) {
    throw new Error(`Missing ID mapping for ${label}: ${id}`);
  }
  return value;
}

async function migrate() {
  if (!process.env.DATABASE_URL || !process.env.OLD_DB_PASSWORD) {
    throw new Error('Database connection details are missing.');
  }

  await source.connect();
  await target.connect();

  console.log('Connected to both databases.');

  const oldUsers = (await source.query(`
    SELECT id, name, email, password_hash, role, created_at,
           profile_image, bio, is_blocked
    FROM users ORDER BY id
  `)).rows;

  const oldCategories = (await source.query(`
    SELECT id, name, slug FROM categories ORDER BY id
  `)).rows;

  const oldPosts = (await source.query(`
    SELECT id, user_id, category_id, title, slug, excerpt,
           content, status, published_at, created_at, updated_at
    FROM posts ORDER BY id
  `)).rows;

  const oldComments = (await source.query(`
    SELECT id, post_id, user_id, content, created_at
    FROM comments ORDER BY id
  `)).rows;

  const oldLikes = (await source.query(`
    SELECT user_id, post_id, created_at FROM likes
  `)).rows;

  const oldBookmarks = (await source.query(`
    SELECT user_id, post_id, created_at FROM bookmarks
  `)).rows;

  const oldFollows = (await source.query(`
    SELECT follower_id, following_id, created_at FROM follows
  `)).rows;

  const oldImages = (await source.query(`
    SELECT post_id, image_path, created_at
    FROM post_images ORDER BY id
  `)).rows;

  const oldNotifications = (await source.query(`
    SELECT user_id, type, message, post_id,
           related_user_id, is_read, created_at
    FROM notifications ORDER BY id
  `)).rows;

  const oldReports = (await source.query(`
    SELECT reporter_id, post_id, comment_id, reason,
           details, status, created_at, resolved_at
    FROM reports ORDER BY id
  `)).rows;

  // Do not overwrite any existing Supabase content.
  const protectedTables = [
    'categories', 'posts', 'comments', 'likes', 'bookmarks',
    'notifications', 'post_images', 'follows', 'reports'
  ];

  for (const table of protectedTables) {
    const result = await target.query(
      `SELECT COUNT(*)::int AS count FROM ${table}`
    );
    if (result.rows[0].count !== 0) {
      throw new Error(
        `Supabase table "${table}" is not empty. Migration stopped safely.`
      );
    }
  }

  const existingUsers = (await target.query(
    'SELECT email FROM users'
  )).rows;

  const existingEmails = new Set(
    existingUsers.map(user => user.email.toLowerCase())
  );

  for (const user of oldUsers) {
    if (existingEmails.has(user.email.toLowerCase())) {
      throw new Error(
        `Email already exists in Supabase: ${user.email}. Migration stopped safely.`
      );
    }
  }

  console.log('Pre-check passed. Starting migration...');

  await target.query('BEGIN');

  try {
    // 1. Users: generate new IDs, preserve password hashes.
    for (const user of oldUsers) {
      const result = await target.query(`
        INSERT INTO users
          (name, email, password_hash, role, created_at,
           profile_image, bio, is_blocked)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id
      `, [
        user.name, user.email, user.password_hash, user.role,
        user.created_at, user.profile_image, user.bio, user.is_blocked
      ]);

      idMap.users.set(String(user.id), result.rows[0].id);
    }

    // 2. Categories.
    for (const category of oldCategories) {
      const result = await target.query(`
        INSERT INTO categories (name, slug)
        VALUES ($1,$2) RETURNING id
      `, [category.name, category.slug]);

      idMap.categories.set(String(category.id), result.rows[0].id);
    }

    // 3. Posts.
    for (const post of oldPosts) {
      const result = await target.query(`
        INSERT INTO posts
          (user_id, category_id, title, slug, excerpt, content,
           status, published_at, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id
      `, [
        mapped(idMap.users, post.user_id, 'post user'),
        mapped(idMap.categories, post.category_id, 'post category'),
        post.title, post.slug, post.excerpt, post.content,
        post.status, post.published_at, post.created_at, post.updated_at
      ]);

      idMap.posts.set(String(post.id), result.rows[0].id);
    }

    // 4. Comments.
    for (const comment of oldComments) {
      const result = await target.query(`
        INSERT INTO comments (post_id, user_id, content, created_at)
        VALUES ($1,$2,$3,$4) RETURNING id
      `, [
        mapped(idMap.posts, comment.post_id, 'comment post'),
        mapped(idMap.users, comment.user_id, 'comment user'),
        comment.content, comment.created_at
      ]);

      idMap.comments.set(String(comment.id), result.rows[0].id);
    }

    // 5. Likes.
    for (const like of oldLikes) {
      await target.query(`
        INSERT INTO likes (user_id, post_id, created_at)
        VALUES ($1,$2,$3)
      `, [
        mapped(idMap.users, like.user_id, 'like user'),
        mapped(idMap.posts, like.post_id, 'like post'),
        like.created_at
      ]);
    }

    // 6. Bookmarks.
    for (const bookmark of oldBookmarks) {
      await target.query(`
        INSERT INTO bookmarks (user_id, post_id, created_at)
        VALUES ($1,$2,$3)
      `, [
        mapped(idMap.users, bookmark.user_id, 'bookmark user'),
        mapped(idMap.posts, bookmark.post_id, 'bookmark post'),
        bookmark.created_at
      ]);
    }

    // 7. Follows.
    for (const follow of oldFollows) {
      await target.query(`
        INSERT INTO follows (follower_id, following_id, created_at)
        VALUES ($1,$2,$3)
      `, [
        mapped(idMap.users, follow.follower_id, 'follower'),
        mapped(idMap.users, follow.following_id, 'following'),
        follow.created_at
      ]);
    }

    // 8. Post images.
    for (const image of oldImages) {
      await target.query(`
        INSERT INTO post_images (post_id, image_path, created_at)
        VALUES ($1,$2,$3)
      `, [
        mapped(idMap.posts, image.post_id, 'image post'),
        image.image_path, image.created_at
      ]);
    }

    // 9. Notifications.
    for (const notification of oldNotifications) {
      await target.query(`
        INSERT INTO notifications
          (user_id, type, message, post_id, related_user_id,
           is_read, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [
        mapped(idMap.users, notification.user_id, 'notification user'),
        notification.type,
        notification.message,
        mapped(idMap.posts, notification.post_id, 'notification post'),
        mapped(idMap.users, notification.related_user_id, 'notification related user'),
        notification.is_read,
        notification.created_at
      ]);
    }

    // 10. Reports.
    for (const report of oldReports) {
      await target.query(`
        INSERT INTO reports
          (reporter_id, post_id, comment_id, reason,
           details, status, created_at, resolved_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [
        mapped(idMap.users, report.reporter_id, 'reporter'),
        mapped(idMap.posts, report.post_id, 'report post'),
        mapped(idMap.comments, report.comment_id, 'report comment'),
        report.reason, report.details, report.status,
        report.created_at, report.resolved_at
      ]);
    }

    await target.query('COMMIT');

    console.log('\nMIGRATION SUCCESSFUL');
    console.table([
      { table: 'users', migrated: oldUsers.length },
      { table: 'categories', migrated: oldCategories.length },
      { table: 'posts', migrated: oldPosts.length },
      { table: 'comments', migrated: oldComments.length },
      { table: 'likes', migrated: oldLikes.length },
      { table: 'bookmarks', migrated: oldBookmarks.length },
      { table: 'follows', migrated: oldFollows.length },
      { table: 'post_images', migrated: oldImages.length },
      { table: 'notifications', migrated: oldNotifications.length },
      { table: 'reports', migrated: oldReports.length }
    ]);

  } catch (error) {
    await target.query('ROLLBACK');
    throw error;
  }
}

migrate()
  .catch(error => {
    console.error('\nMIGRATION FAILED:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await source.end().catch(() => {});
    await target.end().catch(() => {});
  });
