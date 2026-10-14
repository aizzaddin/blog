const db = require('./db');
const { sanitizeBody, slugify } = require('./content');

// Addresses already used by the blog itself, so a page can't hide them.
const RESERVED = new Set([
  'about', 'topics', 'tag', 'p', 'write', 'drafts', 'pages', 'login', 'logout', 'uploads', 'samples', 'healthz',
]);

// The page's address from what the writer typed, or from the title when left empty.
function pageSlug(input, title) {
  return slugify(String(input || '').trim() || String(title || ''));
}

const isReserved = (slug) => RESERVED.has(slug);

// The writer's order; pages that were never moved fall back to when they were made.
const ORDER = 'ORDER BY position, created_at, id';

async function all() {
  const { rows } = await db.query(`SELECT id, slug, title, in_menu, builtin, updated_at FROM pages ${ORDER}`);
  return rows;
}

// Links in the header, Topics and About included, in the writer's order.
async function menu() {
  const { rows } = await db.query(`SELECT slug, title FROM pages WHERE in_menu ${ORDER}`);
  return rows;
}

// Topics and About have their own routes, so only the writer's pages are found here.
async function bySlug(slug) {
  const { rows } = await db.query(`SELECT * FROM pages WHERE slug = $1 AND NOT builtin`, [slug]);
  return rows[0];
}

async function byId(id) {
  const { rows } = await db.query(`SELECT * FROM pages WHERE id = $1`, [id]);
  return rows[0];
}

// Creates or updates a page. Returns null when another page already has that address.
async function save({ id, title, slug, body, inMenu }) {
  const params = [title, slug, sanitizeBody(body), inMenu];
  try {
    const { rows } = id
      ? await db.query(
        `UPDATE pages SET title = $1, slug = $2, body_html = $3, in_menu = $4, updated_at = now()
          WHERE id = $5 RETURNING id, slug`,
        [...params, id],
      )
      : await db.query(
        `INSERT INTO pages (title, slug, body_html, in_menu, position)
         VALUES ($1, $2, $3, $4, (SELECT COALESCE(max(position), 0) + 1 FROM pages)) RETURNING id, slug`,
        params,
      );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') return null;
    throw err;
  }
}

// Swaps a page with its neighbour above (-1) or below (+1), then numbers every page 1, 2, 3…
async function move(id, step) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT id FROM pages ${ORDER} FOR UPDATE`);
    const ids = rows.map((r) => r.id);
    const from = ids.indexOf(id);
    const to = from + step;
    if (from !== -1 && to >= 0 && to < ids.length) {
      [ids[from], ids[to]] = [ids[to], ids[from]];
      await client.query(
        `UPDATE pages SET position = v.position
           FROM unnest($1::int[]) WITH ORDINALITY AS v(id, position) WHERE pages.id = v.id`,
        [ids],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function remove(id) {
  await db.query(`DELETE FROM pages WHERE id = $1`, [id]);
}

module.exports = { pageSlug, isReserved, all, menu, bySlug, byId, save, move, remove };
