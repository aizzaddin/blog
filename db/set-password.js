// Sets the sign-in email and password for a writer. On an empty database it creates the writer first.
// Usage: npm run set-password -- [username]
const readline = require('readline');
const { pool } = require('../src/db');
const { hashPassword } = require('../src/auth');

// One reader for the whole run. Lines are queued, so answers typed or piped in
// (e.g. through docker exec -i) each reach their question in order.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
rl._writeToOutput = (text) => { if (!rl.muted) rl.output.write(text); };
const lines = [];
let waiting = null;
let ended = false;
rl.on('line', (line) => (waiting ? (waiting(line), waiting = null) : lines.push(line)));
rl.on('close', () => { ended = true; if (waiting) waiting(null); });

function ask(question, { hidden = false } = {}) {
  process.stdout.write(question);
  rl.muted = hidden;
  return new Promise((resolve, reject) => {
    const done = (line) => {
      rl.muted = false;
      if (hidden) process.stdout.write('\n');
      if (line === null) reject(new Error('Input ended before all questions were answered.'));
      else resolve(line.trim());
    };
    if (lines.length) done(lines.shift());
    else if (ended) done(null);
    else waiting = done;
  });
}

(async () => {
  const username = process.argv[2];
  let { rows: [author] } = username
    ? await pool.query(`SELECT id, username, email FROM authors WHERE username = $1`, [username])
    : await pool.query(`SELECT id, username, email FROM authors ORDER BY id LIMIT 1`);
  if (!author && username) throw new Error(`No writer with the username "${username}".`);

  if (!author) {
    console.log('No writer account yet. Let’s create yours.');
    const name = await ask('Your name (shown on stories): ');
    if (!name) throw new Error('Enter your name.');
    const handle = (await ask('Username for your profile URL, e.g. "wildan" for /@wildan: ')).toLowerCase();
    if (!/^[a-z0-9_]{2,30}$/.test(handle)) throw new Error('Use 2–30 lowercase letters, numbers or underscores.');
    ({ rows: [author] } = await pool.query(
      `INSERT INTO authors (username, name) VALUES ($1, $2) RETURNING id, username, email`,
      [handle, name],
    ));
  }

  console.log(`Setting sign-in details for @${author.username}.`);
  const email = (await ask(`Email${author.email ? ` (${author.email})` : ''}: `)) || author.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) throw new Error('Enter a valid email address.');

  const password = await ask('New password (at least 10 characters): ', { hidden: true });
  if (password.length < 10) throw new Error('Use at least 10 characters.');
  if (await ask('Repeat the password: ', { hidden: true }) !== password) throw new Error('The passwords don’t match.');

  await pool.query(`UPDATE authors SET email = $2, password_hash = $3 WHERE id = $1`, [author.id, email, await hashPassword(password)]);
  await pool.query(`DELETE FROM sessions WHERE author_id = $1`, [author.id]);
  console.log(`Saved. Sign in at /login with ${email}. Any existing sessions were signed out.`);
  rl.close();
  await pool.end();
})().catch(async (err) => {
  rl.close();
  console.error(err.message);
  await pool.end();
  process.exit(1);
});
