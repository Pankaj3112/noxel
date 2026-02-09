CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  do_account_id TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subdomains (
  subdomain TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  app TEXT NOT NULL,
  ip TEXT NOT NULL,
  created_at TEXT NOT NULL
);
