// Shrinks images uploaded before uploads were resized, in place: same file name and address,
// so stories and pages that use them keep working. Profile photos get the avatar size.
//
//   npm run images:shrink            lists what would change, touches nothing
//   npm run images:shrink -- --apply  rewrites those files
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');
const images = require('../src/images');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
const EXTENSIONS = new Set(['.jpg', '.png', '.webp', '.gif', '.avif']);
const apply = process.argv.includes('--apply');

const kb = (bytes) => `${Math.round(bytes / 1024).toLocaleString('en-US')} KB`;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (EXTENSIONS.has(path.extname(entry.name).toLowerCase())) yield full;
  }
}

(async () => {
  if (!fs.existsSync(UPLOAD_DIR)) {
    console.log('No uploads folder, nothing to do.');
    return;
  }
  const { rows } = await pool.query(`SELECT avatar_url FROM authors WHERE avatar_url IS NOT NULL`);
  const avatars = new Set(rows.map((r) => path.join(PUBLIC_DIR, r.avatar_url)));

  let before = 0;
  let after = 0;
  let changed = 0;
  for (const file of walk(UPLOAD_DIR)) {
    const name = path.relative(PUBLIC_DIR, file);
    const original = fs.readFileSync(file);
    const purpose = avatars.has(file) ? 'avatar' : 'story';
    let result;
    try {
      result = await images.shrink(original, purpose);
    } catch (err) {
      console.log(`skip   ${name}: can't be read (${err.message})`);
      continue;
    }
    // Keep the file when its format would change (the address must stay the same) or it saves under 10%.
    if (result.ext !== path.extname(file).toLowerCase() || result.buffer.length > original.length * 0.9) continue;

    console.log(`${apply ? 'shrunk' : 'would '} ${name}${purpose === 'avatar' ? ' (profile photo)' : ''}: ${kb(original.length)} → ${kb(result.buffer.length)}`);
    if (apply) {
      const temp = `${file}.tmp`;
      fs.writeFileSync(temp, result.buffer);
      fs.renameSync(temp, file);
    }
    before += original.length;
    after += result.buffer.length;
    changed += 1;
  }

  if (!changed) console.log('Every image is already small enough.');
  else if (apply) console.log(`\nShrunk ${changed} image${changed === 1 ? '' : 's'}: ${kb(before)} → ${kb(after)}.`);
  else console.log(`\n${changed} image${changed === 1 ? '' : 's'} would go from ${kb(before)} to ${kb(after)}. Run again with --apply to shrink them.`);
})()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => pool.end());
