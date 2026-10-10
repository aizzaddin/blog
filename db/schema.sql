-- Blog schema. Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS authors (
  id          SERIAL PRIMARY KEY,
  username    TEXT NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{2,30}$'),
  name        TEXT NOT NULL,
  bio         TEXT NOT NULL DEFAULT '',
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE post_status AS ENUM ('draft', 'published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS posts (
  id            SERIAL PRIMARY KEY,
  author_id     INT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  subtitle      TEXT NOT NULL DEFAULT '',
  slug          TEXT NOT NULL UNIQUE,
  body_html     TEXT NOT NULL DEFAULT '',
  cover_url     TEXT,
  status        post_status NOT NULL DEFAULT 'draft',
  reading_min   INT NOT NULL DEFAULT 1,
  claps         INT NOT NULL DEFAULT 0 CHECK (claps >= 0),
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status = 'draft' OR published_at IS NOT NULL)
);

-- Stories used to be stored as Markdown (body_md); db/migrate.js converts them.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS body_html TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS posts_feed_idx ON posts (published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS posts_author_idx ON posts (author_id);

CREATE TABLE IF NOT EXISTS tags (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL,
  slug  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id  INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id   INT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX IF NOT EXISTS post_tags_tag_idx ON post_tags (tag_id);

-- Reader responses (like Medium's responses)
CREATE TABLE IF NOT EXISTS responses (
  id          SERIAL PRIMARY KEY,
  post_id     INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  body        TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS responses_post_idx ON responses (post_id, created_at);

-- Sign-in and the about page
ALTER TABLE authors ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE authors ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE authors ADD COLUMN IF NOT EXISTS about_html TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS authors_email_idx ON authors (lower(email));

-- Signed-in sessions. Only a hash of the cookie token is stored.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  author_id   INT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_author_idx ON sessions (author_id);
