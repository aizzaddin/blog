const db = require('./db');
const { postSlug, readingMinutes, sanitizeBody } = require('./content');

const POST_FIELDS = `
  p.id, p.author_id, p.title, p.subtitle, p.slug, p.body_html, p.cover_url, p.status,
  p.reading_min, p.claps, p.published_at, p.updated_at,
  a.username, a.name AS author_name, a.bio AS author_bio, a.avatar_url,
  COALESCE(
    (SELECT json_agg(json_build_object('name', t.name, 'slug', t.slug) ORDER BY t.name)
       FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id),
    '[]'
  ) AS tags
`;

async function feed({ tag, username, limit = 20 } = {}) {
  const params = [];
  const where = [`p.status = 'published'`];
  if (tag) {
    params.push(tag);
    where.push(`EXISTS (SELECT 1 FROM post_tags pt JOIN tags t ON t.id = pt.tag_id
                        WHERE pt.post_id = p.id AND t.slug = $${params.length})`);
  }
  if (username) {
    params.push(username);
    where.push(`a.username = $${params.length}`);
  }
  params.push(limit);
  const { rows } = await db.query(
    `SELECT ${POST_FIELDS} FROM posts p JOIN authors a ON a.id = p.author_id
     WHERE ${where.join(' AND ')}
     ORDER BY p.published_at DESC LIMIT $${params.length}`,
    params,
  );
  return rows;
}

async function bySlug(slug) {
  const { rows } = await db.query(
    `SELECT ${POST_FIELDS} FROM posts p JOIN authors a ON a.id = p.author_id WHERE p.slug = $1`,
    [slug],
  );
  return rows[0];
}

async function byId(id) {
  const { rows } = await db.query(
    `SELECT ${POST_FIELDS} FROM posts p JOIN authors a ON a.id = p.author_id WHERE p.id = $1`,
    [id],
  );
  return rows[0];
}

async function drafts(authorId) {
  const { rows } = await db.query(
    `SELECT ${POST_FIELDS} FROM posts p JOIN authors a ON a.id = p.author_id
     WHERE p.status = 'draft' AND p.author_id = $1 ORDER BY p.updated_at DESC`,
    [authorId],
  );
  return rows;
}

async function popularTags(limit = 12) {
  const { rows } = await db.query(
    `SELECT t.name, t.slug, count(*)::int AS total
       FROM tags t
       JOIN post_tags pt ON pt.tag_id = t.id
       JOIN posts p ON p.id = pt.post_id AND p.status = 'published'
      GROUP BY t.id ORDER BY total DESC, t.name LIMIT $1`,
    [limit],
  );
  return rows;
}

// Every topic with its story count and latest few titles, for the topics page.
async function topics() {
  const { rows } = await db.query(
    `SELECT t.name, t.slug, count(p.id)::int AS total,
            (array_agg(json_build_object('title', p.title, 'slug', p.slug) ORDER BY p.published_at DESC))[1:3] AS latest
       FROM tags t
       JOIN post_tags pt ON pt.tag_id = t.id
       JOIN posts p ON p.id = pt.post_id AND p.status = 'published'
      GROUP BY t.id ORDER BY total DESC, t.name`,
  );
  return rows;
}

async function updateAbout(authorId, { name, bio, avatarUrl, aboutHtml }) {
  await db.query(
    `UPDATE authors SET name = $2, bio = $3, avatar_url = $4, about_html = $5 WHERE id = $1`,
    [authorId, name, bio, avatarUrl, sanitizeBody(aboutHtml)],
  );
}

async function author(username) {
  const { rows } = await db.query(`SELECT * FROM authors WHERE username = $1`, [username]);
  return rows[0];
}

async function defaultAuthor() {
  const { rows } = await db.query(`SELECT * FROM authors ORDER BY id LIMIT 1`);
  return rows[0];
}

async function setTags(client, postId, tags) {
  await client.query(`DELETE FROM post_tags WHERE post_id = $1`, [postId]);
  for (const tag of tags) {
    const { rows } = await client.query(
      `INSERT INTO tags (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id`,
      [tag.name, tag.slug],
    );
    await client.query(`INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [postId, rows[0].id]);
  }
}

// Creates or updates a story. `publish` decides its resulting status.
async function save({ id, authorId, title, subtitle, body, coverUrl = null, tags, publish }) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const html = sanitizeBody(body);
    const minutes = readingMinutes(html);
    const status = publish ? 'published' : 'draft';
    let row;
    if (id) {
      ({ rows: [row] } = await client.query(
        `UPDATE posts SET title = $2, subtitle = $3, body_html = $4, reading_min = $5, status = $6::post_status, cover_url = $7,
                published_at = CASE WHEN $6::text = 'published' THEN COALESCE(published_at, now()) ELSE NULL END,
                updated_at = now()
          WHERE id = $1 RETURNING id, slug, status`,
        [id, title, subtitle, html, minutes, status, coverUrl],
      ));
      if (!row) throw new Error('Story not found.');
    } else {
      ({ rows: [row] } = await client.query(
        `INSERT INTO posts (author_id, title, subtitle, slug, body_html, reading_min, status, cover_url, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::post_status, $8, CASE WHEN $7::text = 'published' THEN now() END)
         RETURNING id, slug, status`,
        [authorId, title, subtitle, postSlug(title), html, minutes, status, coverUrl],
      ));
    }
    await setTags(client, row.id, tags);
    await client.query('COMMIT');
    return row;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function clap(slug, count) {
  const { rows } = await db.query(
    `UPDATE posts SET claps = claps + $2 WHERE slug = $1 AND status = 'published' RETURNING claps`,
    [slug, count],
  );
  return rows[0];
}

async function responses(postId) {
  const { rows } = await db.query(
    `SELECT id, name, body, created_at FROM responses WHERE post_id = $1 ORDER BY created_at`,
    [postId],
  );
  return rows;
}

async function addResponse(postId, name, body) {
  await db.query(`INSERT INTO responses (post_id, name, body) VALUES ($1, $2, $3)`, [postId, name, body]);
}

module.exports = {
  feed, bySlug, byId, drafts, popularTags, topics, updateAbout, author, defaultAuthor, save, clap, responses, addResponse,
};
