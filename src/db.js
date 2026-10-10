const path = require('path');
require('dotenv').config({ path: [path.join(__dirname, '..', '.env.local'), path.join(__dirname, '..', '.env')], quiet: true });
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add it to .env.local.');
}

// .env.local uses a JDBC URL (jdbc:postgresql://...); pg expects postgresql://...
const connectionString = process.env.DATABASE_URL.replace(/^jdbc:/, '');

const pool = new Pool({ connectionString });

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
