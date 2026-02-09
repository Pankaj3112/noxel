import Database from "better-sqlite3";
import { nanoid } from "nanoid";

export interface User {
  id: string;
  email: string;
  api_key: string;
  do_account_id: string | null;
  created_at: string;
  last_login_at: string;
}

export interface Subdomain {
  subdomain: string;
  user_id: string;
  app: string;
  ip: string;
  created_at: string;
}

export function createDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
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
  `);

  return db;
}

function generateApiKey(): string {
  return `nxl_${nanoid(32)}`;
}

export function createUser(
  db: Database.Database,
  params: { email: string; doAccountId: string | null }
): User {
  const now = new Date().toISOString();
  const user: User = {
    id: nanoid(),
    email: params.email,
    api_key: generateApiKey(),
    do_account_id: params.doAccountId,
    created_at: now,
    last_login_at: now,
  };

  db.prepare(`
    INSERT INTO users (id, email, api_key, do_account_id, created_at, last_login_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(user.id, user.email, user.api_key, user.do_account_id, user.created_at, user.last_login_at);

  return user;
}

export function getUserByApiKey(db: Database.Database, apiKey: string): User | null {
  return (db.prepare("SELECT * FROM users WHERE api_key = ?").get(apiKey) as User | undefined) ?? null;
}

export function getUserByEmail(db: Database.Database, email: string): User | null {
  return (db.prepare("SELECT * FROM users WHERE email = ?").get(email) as User | undefined) ?? null;
}

export function updateUserLogin(db: Database.Database, userId: string): void {
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(new Date().toISOString(), userId);
}

export function createSubdomain(
  db: Database.Database,
  params: { subdomain: string; userId: string; app: string; ip: string }
): Subdomain {
  const now = new Date().toISOString();
  const sub: Subdomain = {
    subdomain: params.subdomain,
    user_id: params.userId,
    app: params.app,
    ip: params.ip,
    created_at: now,
  };

  db.prepare(`
    INSERT INTO subdomains (subdomain, user_id, app, ip, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(sub.subdomain, sub.user_id, sub.app, sub.ip, sub.created_at);

  return sub;
}

export function getSubdomain(db: Database.Database, subdomain: string): Subdomain | null {
  return (db.prepare("SELECT * FROM subdomains WHERE subdomain = ?").get(subdomain) as Subdomain | undefined) ?? null;
}

export function getSubdomainsByUser(db: Database.Database, userId: string): Subdomain[] {
  return db.prepare("SELECT * FROM subdomains WHERE user_id = ? ORDER BY created_at DESC").all(userId) as Subdomain[];
}

export function deleteSubdomain(db: Database.Database, subdomain: string, userId: string): boolean {
  const result = db.prepare("DELETE FROM subdomains WHERE subdomain = ? AND user_id = ?").run(subdomain, userId);
  return result.changes > 0;
}

export function updateSubdomainIp(db: Database.Database, subdomain: string, userId: string, ip: string): boolean {
  const result = db.prepare("UPDATE subdomains SET ip = ? WHERE subdomain = ? AND user_id = ?").run(ip, subdomain, userId);
  return result.changes > 0;
}
