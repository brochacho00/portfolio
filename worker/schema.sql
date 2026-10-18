-- Reviews database (Cloudflare D1). Apply with:
--   npx wrangler@4 d1 execute fatih-reviews --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash  TEXT NOT NULL UNIQUE,   -- HMAC-SHA256(CODE_PEPPER, code); the code itself is never stored
  client     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  used_at    TEXT,
  review_id  INTEGER
);

CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id    INTEGER NOT NULL,
  name       TEXT NOT NULL,
  stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  hidden     INTEGER NOT NULL DEFAULT 0
);

-- One row per attempt; ip_hash is a salted hash, never the raw IP.
CREATE TABLE IF NOT EXISTS attempts (
  kind       TEXT NOT NULL,          -- 'review' or 'admin'
  ip_hash    TEXT NOT NULL,
  created_at INTEGER NOT NULL        -- unix seconds
);

CREATE INDEX IF NOT EXISTS attempts_lookup ON attempts (kind, ip_hash, created_at);
CREATE INDEX IF NOT EXISTS reviews_visible ON reviews (hidden, id);
