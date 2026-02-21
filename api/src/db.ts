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

function generateApiKey(): string {
  return `nxl_${nanoid(32)}`;
}

export async function createUser(
  db: D1Database,
  params: { email: string; doAccountId: string | null }
): Promise<User> {
  const now = new Date().toISOString();
  const user: User = {
    id: nanoid(),
    email: params.email,
    api_key: generateApiKey(),
    do_account_id: params.doAccountId,
    created_at: now,
    last_login_at: now,
  };

  await db.prepare(`
    INSERT INTO users (id, email, api_key, do_account_id, created_at, last_login_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(user.id, user.email, user.api_key, user.do_account_id, user.created_at, user.last_login_at).run();

  return user;
}

export async function getUserByApiKey(db: D1Database, apiKey: string): Promise<User | null> {
  return await db.prepare("SELECT * FROM users WHERE api_key = ?").bind(apiKey).first<User>() ?? null;
}

export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
  return await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<User>() ?? null;
}

export async function updateUserLogin(db: D1Database, userId: string): Promise<void> {
  await db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(new Date().toISOString(), userId).run();
}

export async function createSubdomain(
  db: D1Database,
  params: { subdomain: string; userId: string; app: string; ip: string }
): Promise<Subdomain> {
  const now = new Date().toISOString();
  const sub: Subdomain = {
    subdomain: params.subdomain,
    user_id: params.userId,
    app: params.app,
    ip: params.ip,
    created_at: now,
  };

  await db.prepare(`
    INSERT INTO subdomains (subdomain, user_id, app, ip, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(sub.subdomain, sub.user_id, sub.app, sub.ip, sub.created_at).run();

  return sub;
}

export async function getSubdomain(db: D1Database, subdomain: string): Promise<Subdomain | null> {
  return await db.prepare("SELECT * FROM subdomains WHERE subdomain = ?").bind(subdomain).first<Subdomain>() ?? null;
}

export async function getSubdomainsByUser(db: D1Database, userId: string): Promise<Subdomain[]> {
  const result = await db.prepare("SELECT * FROM subdomains WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all<Subdomain>();
  return result.results;
}

export async function deleteSubdomain(db: D1Database, subdomain: string, userId: string): Promise<boolean> {
  const result = await db.prepare("DELETE FROM subdomains WHERE subdomain = ? AND user_id = ?").bind(subdomain, userId).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function updateSubdomainIp(db: D1Database, subdomain: string, userId: string, ip: string): Promise<boolean> {
  const result = await db.prepare("UPDATE subdomains SET ip = ? WHERE subdomain = ? AND user_id = ?").bind(ip, subdomain, userId).run();
  return (result.meta.changes ?? 0) > 0;
}
