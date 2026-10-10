const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const { pool } = require('../src/db');
const { sanitizeBody } = require('../src/content');

(async () => {
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  // One-time conversion: Markdown bodies → HTML for the rich text editor.
  const { rows: [legacy] } = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'body_md'`,
  );
  if (legacy) {
    const { rows } = await pool.query(`SELECT id, body_md FROM posts`);
    for (const row of rows) {
      await pool.query(`UPDATE posts SET body_html = $2 WHERE id = $1`, [row.id, sanitizeBody(marked.parse(row.body_md))]);
    }
    await pool.query(`ALTER TABLE posts DROP COLUMN body_md`);
    console.log(`Converted ${rows.length} stories from Markdown to HTML.`);
  }

  console.log('Database schema ready.');
  await pool.end();
})().catch((err) => { console.error(err.message); process.exit(1); });
