# Noxel MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship Noxel as a distributable CLI (`npm i -g noxel`) backed by a thin API server that keeps secrets (Cloudflare token, DO client secret) server-side.

**Architecture:** Two packages in a monorepo — `api/` (Hono + SQLite, deployed on our server) and `cli/` (Commander + Clack, published to npm). The CLI handles DigitalOcean provisioning and SSH locally; it calls the API only for OAuth exchange, DNS management, and template listing. Prototype code migrates nearly 1:1.

**Tech Stack:** TypeScript, Hono, better-sqlite3, nanoid, Commander, @clack/prompts, ssh2, open

**Design doc:** `docs/plans/2026-02-09-noxel-mvp-design.md`

---

## Task 1: Monorepo Scaffolding

**Files:**
- Create: `api/package.json`
- Create: `api/tsconfig.json`
- Create: `api/src/.gitkeep`
- Create: `api/.env.example`
- Create: `cli/package.json`
- Create: `cli/tsconfig.json`
- Create: `cli/src/.gitkeep`
- Modify: root `package.json`
- Modify: root `tsconfig.json`
- Modify: `.gitignore`

**Step 1: Update root package.json for workspaces**

Replace root `package.json` with:

```json
{
  "private": true,
  "workspaces": ["api", "cli"]
}
```

The old root package.json was for the prototype. The prototype still lives in `prototype/` and can be run with `npx tsx prototype/deploy.ts` if needed, but it's no longer the main entry point.

**Step 2: Update root tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

Remove the `outDir` and `include` — each package has its own tsconfig.

**Step 3: Create api/package.json**

```json
{
  "name": "@noxel/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.0",
    "hono": "^4.6.0",
    "better-sqlite3": "^11.0.0",
    "nanoid": "^5.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^20.11.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vitest": "^2.0.0"
  }
}
```

**Step 4: Create api/tsconfig.json**

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

**Step 5: Create api/.env.example**

```
# Cloudflare — controls our domain's DNS
CLOUDFLARE_API_TOKEN=your_cloudflare_token
CLOUDFLARE_ZONE_ID=your_zone_id
DOMAIN=noxel.sh

# DigitalOcean OAuth App — for token exchange
DO_CLIENT_ID=your_do_client_id
DO_CLIENT_SECRET=your_do_client_secret

# Server
PORT=3000
```

**Step 6: Create cli/package.json**

```json
{
  "name": "noxel",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "noxel": "./dist/cli.js"
  },
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@clack/prompts": "^0.9.0",
    "commander": "^13.0.0",
    "js-yaml": "^4.1.0",
    "open": "^11.0.0",
    "picocolors": "^1.1.0",
    "ssh2": "^1.15.0"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^20.11.0",
    "@types/ssh2": "^1.15.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vitest": "^2.0.0"
  }
}
```

**Step 7: Create cli/tsconfig.json**

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

**Step 8: Update .gitignore**

Append to existing `.gitignore`:

```
# API
api/noxel.db
api/.env
api/dist/

# CLI
cli/dist/

# Dependencies
node_modules/
```

**Step 9: Create placeholder files**

Create `api/src/.gitkeep` and `cli/src/.gitkeep` (empty files).

**Step 10: Install dependencies**

Run: `npm install`

Expected: Both api/ and cli/ dependencies install. `node_modules/` created at root with hoisted deps.

**Step 11: Verify TypeScript compiles**

Run: `cd api && npx tsc --noEmit && cd ../cli && npx tsc --noEmit`

Expected: No errors (no source files yet, just config validation).

**Step 12: Commit**

```bash
git add -A
git commit -m "scaffold monorepo with api/ and cli/ workspaces"
```

---

## Task 2: API — Database Module

**Files:**
- Create: `api/src/db.ts`
- Create: `api/src/db.test.ts`

**Step 1: Write the test**

```typescript
// api/src/db.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { createDb, createUser, getUserByApiKey, getUserByEmail, createSubdomain, getSubdomain, getSubdomainsByUser, deleteSubdomain, updateSubdomainIp } from "./db.js";

describe("database", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDb(":memory:");
  });

  describe("users", () => {
    it("creates and retrieves a user by api key", () => {
      const user = createUser(db, { email: "test@example.com", doAccountId: "do-123" });
      expect(user.email).toBe("test@example.com");
      expect(user.api_key).toMatch(/^nxl_/);

      const found = getUserByApiKey(db, user.api_key);
      expect(found).not.toBeNull();
      expect(found!.email).toBe("test@example.com");
    });

    it("retrieves a user by email", () => {
      createUser(db, { email: "test@example.com", doAccountId: "do-123" });
      const found = getUserByEmail(db, "test@example.com");
      expect(found).not.toBeNull();
      expect(found!.do_account_id).toBe("do-123");
    });

    it("returns null for unknown api key", () => {
      expect(getUserByApiKey(db, "nxl_nonexistent")).toBeNull();
    });
  });

  describe("subdomains", () => {
    it("creates and retrieves a subdomain", () => {
      const user = createUser(db, { email: "test@example.com", doAccountId: "do-123" });
      const sub = createSubdomain(db, { subdomain: "uptime-kuma-a7x", userId: user.id, app: "uptime-kuma", ip: "1.2.3.4" });
      expect(sub.subdomain).toBe("uptime-kuma-a7x");

      const found = getSubdomain(db, "uptime-kuma-a7x");
      expect(found).not.toBeNull();
      expect(found!.ip).toBe("1.2.3.4");
    });

    it("lists subdomains by user", () => {
      const user = createUser(db, { email: "test@example.com", doAccountId: "do-123" });
      createSubdomain(db, { subdomain: "app-a1b", userId: user.id, app: "app", ip: "1.1.1.1" });
      createSubdomain(db, { subdomain: "app-c2d", userId: user.id, app: "app", ip: "2.2.2.2" });

      const subs = getSubdomainsByUser(db, user.id);
      expect(subs).toHaveLength(2);
    });

    it("deletes a subdomain", () => {
      const user = createUser(db, { email: "test@example.com", doAccountId: "do-123" });
      createSubdomain(db, { subdomain: "app-x1y", userId: user.id, app: "app", ip: "1.1.1.1" });

      const deleted = deleteSubdomain(db, "app-x1y", user.id);
      expect(deleted).toBe(true);
      expect(getSubdomain(db, "app-x1y")).toBeNull();
    });

    it("prevents deleting another user's subdomain", () => {
      const user1 = createUser(db, { email: "a@test.com", doAccountId: "do-1" });
      const user2 = createUser(db, { email: "b@test.com", doAccountId: "do-2" });
      createSubdomain(db, { subdomain: "app-x1y", userId: user1.id, app: "app", ip: "1.1.1.1" });

      const deleted = deleteSubdomain(db, "app-x1y", user2.id);
      expect(deleted).toBe(false);
    });

    it("updates subdomain IP", () => {
      const user = createUser(db, { email: "test@example.com", doAccountId: "do-123" });
      createSubdomain(db, { subdomain: "app-a1b", userId: user.id, app: "app", ip: "1.1.1.1" });

      updateSubdomainIp(db, "app-a1b", user.id, "9.9.9.9");
      const found = getSubdomain(db, "app-a1b");
      expect(found!.ip).toBe("9.9.9.9");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run src/db.test.ts`

Expected: FAIL — `db.ts` doesn't exist.

**Step 3: Write the implementation**

```typescript
// api/src/db.ts
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
  return db.prepare("SELECT * FROM users WHERE api_key = ?").get(apiKey) as User | null;
}

export function getUserByEmail(db: Database.Database, email: string): User | null {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email) as User | null;
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
  return db.prepare("SELECT * FROM subdomains WHERE subdomain = ?").get(subdomain) as Subdomain | null;
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
```

**Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run src/db.test.ts`

Expected: All 7 tests PASS.

**Step 5: Commit**

```bash
git add api/src/db.ts api/src/db.test.ts
git commit -m "feat(api): add database module with users and subdomains tables"
```

---

## Task 3: API — Cloudflare + Subdomain Generation

**Files:**
- Create: `api/src/cloudflare.ts`
- Create: `api/src/subdomain.ts`
- Create: `api/src/subdomain.test.ts`

**Step 1: Write subdomain generation test**

```typescript
// api/src/subdomain.test.ts
import { describe, it, expect } from "vitest";
import { generateSubdomain, isValidSubdomain } from "./subdomain.js";

describe("subdomain", () => {
  it("generates subdomain in format app-xxx", () => {
    const sub = generateSubdomain("uptime-kuma");
    expect(sub).toMatch(/^uptime-kuma-[a-z0-9]{3}$/);
  });

  it("sanitizes app name", () => {
    const sub = generateSubdomain("My App 2.0");
    expect(sub).toMatch(/^my-app-20-[a-z0-9]{3}$/);
  });

  it("generates different subdomains each time", () => {
    const subs = new Set(Array.from({ length: 20 }, () => generateSubdomain("app")));
    expect(subs.size).toBeGreaterThan(1);
  });

  it("validates subdomain format", () => {
    expect(isValidSubdomain("uptime-kuma-a7x")).toBe(true);
    expect(isValidSubdomain("n8n-b2k")).toBe(true);
    expect(isValidSubdomain("")).toBe(false);
    expect(isValidSubdomain("UPPERCASE")).toBe(false);
    expect(isValidSubdomain("has spaces")).toBe(false);
    expect(isValidSubdomain("-leading-dash")).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run src/subdomain.test.ts`

Expected: FAIL.

**Step 3: Implement subdomain generation**

```typescript
// api/src/subdomain.ts
const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomSuffix(length = 3): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return result;
}

function sanitizeAppName(app: string): string {
  return app
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")  // Replace non-alphanumeric with dash
    .replace(/-+/g, "-")           // Collapse multiple dashes
    .replace(/^-|-$/g, "");        // Trim leading/trailing dashes
}

export function generateSubdomain(app: string): string {
  const sanitized = sanitizeAppName(app);
  return `${sanitized}-${randomSuffix()}`;
}

export function isValidSubdomain(subdomain: string): boolean {
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(subdomain) && subdomain.length >= 3;
}
```

**Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run src/subdomain.test.ts`

Expected: All tests PASS.

**Step 5: Migrate Cloudflare module**

```typescript
// api/src/cloudflare.ts
// Migrated from prototype/cloudflare.ts — adapted to use explicit config instead of env vars

const API_BASE = "https://api.cloudflare.com/client/v4";

export interface CloudflareConfig {
  apiToken: string;
  zoneId: string;
  domain: string;
}

let config: CloudflareConfig;

export function initCloudflare(cfg: CloudflareConfig): void {
  config = cfg;
}

function getConfig(): CloudflareConfig {
  if (!config) {
    throw new Error("Cloudflare not initialized. Call initCloudflare() first.");
  }
  return config;
}

async function cfFetch(path: string, options: RequestInit = {}) {
  const cfg = getConfig();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${cfg.apiToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await res.json();

  if (!data.success) {
    throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
  }

  return data;
}

export async function createDNSRecord(subdomain: string, ip: string): Promise<void> {
  const cfg = getConfig();
  const fullDomain = `${subdomain}.${cfg.domain}`;

  // Check if record already exists
  const existing = await cfFetch(
    `/zones/${cfg.zoneId}/dns_records?type=A&name=${fullDomain}`
  );

  if (existing.result.length > 0) {
    // Update existing record
    const recordId = existing.result[0].id;
    await cfFetch(`/zones/${cfg.zoneId}/dns_records/${recordId}`, {
      method: "PUT",
      body: JSON.stringify({
        type: "A",
        name: subdomain,
        content: ip,
        ttl: 60,
        proxied: false,
      }),
    });
  } else {
    // Create new record
    await cfFetch(`/zones/${cfg.zoneId}/dns_records`, {
      method: "POST",
      body: JSON.stringify({
        type: "A",
        name: subdomain,
        content: ip,
        ttl: 60,
        proxied: false,
      }),
    });
  }
}

export async function deleteDNSRecord(subdomain: string): Promise<void> {
  const cfg = getConfig();
  const fullDomain = `${subdomain}.${cfg.domain}`;

  const existing = await cfFetch(
    `/zones/${cfg.zoneId}/dns_records?type=A&name=${fullDomain}`
  );

  for (const record of existing.result) {
    await cfFetch(`/zones/${cfg.zoneId}/dns_records/${record.id}`, {
      method: "DELETE",
    });
  }
}
```

**Step 6: Commit**

```bash
git add api/src/subdomain.ts api/src/subdomain.test.ts api/src/cloudflare.ts
git commit -m "feat(api): add Cloudflare DNS module and subdomain generation"
```

---

## Task 4: API — Auth Middleware

**Files:**
- Create: `api/src/middleware.ts`
- Create: `api/src/middleware.test.ts`

**Step 1: Write the test**

```typescript
// api/src/middleware.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import Database from "better-sqlite3";
import { createDb, createUser } from "./db.js";
import { authMiddleware } from "./middleware.js";

describe("auth middleware", () => {
  let db: Database.Database;
  let app: Hono;

  beforeEach(() => {
    db = createDb(":memory:");
    app = new Hono();
    app.use("/*", authMiddleware(db));
    app.get("/test", (c) => c.json({ userId: c.get("userId") }));
  });

  it("rejects request without Authorization header", async () => {
    const res = await app.request("/test");
    expect(res.status).toBe(401);
  });

  it("rejects request with invalid api key", async () => {
    const res = await app.request("/test", {
      headers: { Authorization: "Bearer nxl_invalid" },
    });
    expect(res.status).toBe(401);
  });

  it("allows request with valid api key and sets userId", async () => {
    const user = createUser(db, { email: "test@example.com", doAccountId: "do-123" });
    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${user.api_key}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe(user.id);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run src/middleware.test.ts`

Expected: FAIL.

**Step 3: Implement middleware**

```typescript
// api/src/middleware.ts
import type { MiddlewareHandler } from "hono";
import type Database from "better-sqlite3";
import { getUserByApiKey } from "./db.js";

// Extend Hono context to carry userId
declare module "hono" {
  interface ContextVariableMap {
    userId: string;
  }
}

export function authMiddleware(db: Database.Database): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }

    const apiKey = authHeader.slice(7); // Remove "Bearer "
    const user = getUserByApiKey(db, apiKey);

    if (!user) {
      return c.json({ error: "Invalid API key" }, 401);
    }

    c.set("userId", user.id);
    await next();
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run src/middleware.test.ts`

Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add api/src/middleware.ts api/src/middleware.test.ts
git commit -m "feat(api): add API key auth middleware"
```

---

## Task 5: API — Auth Routes

**Files:**
- Create: `api/src/routes/auth.ts`

The auth route handles OAuth token exchange with DigitalOcean. It keeps the DO client secret server-side. Since this route calls external APIs (DigitalOcean), we skip unit tests and verify manually.

**Step 1: Implement auth routes**

```typescript
// api/src/routes/auth.ts
import { Hono } from "hono";
import type Database from "better-sqlite3";
import { createUser, getUserByEmail, updateUserLogin } from "../db.js";

const DO_TOKEN_URL = "https://cloud.digitalocean.com/v1/oauth/token";
const DO_ACCOUNT_URL = "https://api.digitalocean.com/v2/account";

interface AuthConfig {
  doClientId: string;
  doClientSecret: string;
}

export function createAuthRoutes(db: Database.Database, config: AuthConfig): Hono {
  const app = new Hono();

  // POST /auth/digitalocean — exchange auth code for tokens
  app.post("/digitalocean", async (c) => {
    const body = await c.req.json<{ code: string; redirect_uri: string }>();

    if (!body.code || !body.redirect_uri) {
      return c.json({ error: "Missing code or redirect_uri" }, 400);
    }

    // Exchange code for tokens using our client secret
    const tokenRes = await fetch(DO_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: body.code,
        client_id: config.doClientId,
        client_secret: config.doClientSecret,
        redirect_uri: body.redirect_uri,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return c.json({ error: `DigitalOcean token exchange failed: ${text}` }, 502);
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    // Fetch account info
    let email = "unknown";
    let doAccountId: string | null = null;
    try {
      const accountRes = await fetch(DO_ACCOUNT_URL, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (accountRes.ok) {
        const accountData = (await accountRes.json()) as {
          account: { email: string; uuid: string };
        };
        email = accountData.account.email;
        doAccountId = accountData.account.uuid;
      }
    } catch {
      // Non-critical — continue with "unknown"
    }

    // Create or find user
    let user = getUserByEmail(db, email);
    if (user) {
      updateUserLogin(db, user.id);
    } else {
      user = createUser(db, { email, doAccountId });
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    return c.json({
      do_access_token: tokenData.access_token,
      do_refresh_token: tokenData.refresh_token,
      do_expires_at: expiresAt,
      email,
      noxel_api_key: user.api_key,
    });
  });

  // POST /auth/digitalocean/refresh — refresh expired DO token
  app.post("/digitalocean/refresh", async (c) => {
    const body = await c.req.json<{ refresh_token: string }>();

    if (!body.refresh_token) {
      return c.json({ error: "Missing refresh_token" }, 400);
    }

    const tokenRes = await fetch(DO_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: body.refresh_token,
        client_id: config.doClientId,
        client_secret: config.doClientSecret,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return c.json({ error: `Token refresh failed: ${text}` }, 502);
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    return c.json({
      do_access_token: tokenData.access_token,
      do_refresh_token: tokenData.refresh_token,
      do_expires_at: expiresAt,
    });
  });

  return app;
}
```

**Step 2: Commit**

```bash
git add api/src/routes/auth.ts
git commit -m "feat(api): add auth routes for DO OAuth exchange and token refresh"
```

---

## Task 6: API — DNS Routes

**Files:**
- Create: `api/src/routes/dns.ts`
- Create: `api/src/routes/dns.test.ts`

**Step 1: Write test for DNS route logic**

We can test the route handler with a mock Cloudflare module. But for simplicity, we test the subdomain allocation logic through the DB and validate the route structure.

```typescript
// api/src/routes/dns.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import Database from "better-sqlite3";
import { createDb, createUser, createSubdomain, getSubdomain } from "../db.js";
import { createDnsRoutes } from "./dns.js";
import { authMiddleware } from "../middleware.js";

// Mock cloudflare module
vi.mock("../cloudflare.js", () => ({
  createDNSRecord: vi.fn().mockResolvedValue(undefined),
  deleteDNSRecord: vi.fn().mockResolvedValue(undefined),
}));

describe("DNS routes", () => {
  let db: Database.Database;
  let app: Hono;
  let apiKey: string;

  beforeEach(() => {
    db = createDb(":memory:");
    const user = createUser(db, { email: "test@example.com", doAccountId: "do-123" });
    apiKey = user.api_key;

    app = new Hono();
    app.use("/dns/*", authMiddleware(db));
    app.route("/dns", createDnsRoutes(db, "noxel.sh"));
  });

  it("POST /dns allocates a subdomain", async () => {
    const res = await app.request("/dns", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ app: "uptime-kuma", ip: "1.2.3.4" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subdomain).toMatch(/^uptime-kuma-[a-z0-9]{3}$/);
    expect(body.domain).toMatch(/^uptime-kuma-[a-z0-9]{3}\.noxel\.sh$/);
  });

  it("POST /dns rejects missing fields", async () => {
    const res = await app.request("/dns", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ app: "test" }), // missing ip
    });

    expect(res.status).toBe(400);
  });

  it("DELETE /dns/:subdomain removes a subdomain", async () => {
    // First create one
    const postRes = await app.request("/dns", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ app: "test-app", ip: "1.2.3.4" }),
    });
    const { subdomain } = await postRes.json();

    // Then delete it
    const delRes = await app.request(`/dns/${subdomain}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(delRes.status).toBe(200);
    expect(getSubdomain(db, subdomain)).toBeNull();
  });

  it("DELETE /dns/:subdomain returns 404 for unknown subdomain", async () => {
    const res = await app.request("/dns/nonexistent-xyz", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(res.status).toBe(404);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run src/routes/dns.test.ts`

Expected: FAIL.

**Step 3: Implement DNS routes**

```typescript
// api/src/routes/dns.ts
import { Hono } from "hono";
import type Database from "better-sqlite3";
import { createSubdomain, getSubdomain, deleteSubdomain, updateSubdomainIp, getSubdomainsByUser } from "../db.js";
import { generateSubdomain } from "../subdomain.js";
import { createDNSRecord, deleteDNSRecord } from "../cloudflare.js";

const MAX_RETRIES = 5;

export function createDnsRoutes(db: Database.Database, domain: string): Hono {
  const app = new Hono();

  // POST /dns — allocate subdomain and create DNS record
  app.post("/", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json<{ app: string; ip: string }>();

    if (!body.app || !body.ip) {
      return c.json({ error: "Missing app or ip" }, 400);
    }

    // Generate unique subdomain with retry on collision
    let subdomain: string = "";
    for (let i = 0; i < MAX_RETRIES; i++) {
      subdomain = generateSubdomain(body.app);
      if (!getSubdomain(db, subdomain)) break;
      if (i === MAX_RETRIES - 1) {
        return c.json({ error: "Failed to generate unique subdomain" }, 500);
      }
    }

    // Create Cloudflare DNS record
    await createDNSRecord(subdomain, body.ip);

    // Store in database
    createSubdomain(db, {
      subdomain,
      userId,
      app: body.app,
      ip: body.ip,
    });

    return c.json({
      subdomain,
      domain: `${subdomain}.${domain}`,
    });
  });

  // PUT /dns/:subdomain — update IP
  app.put("/:subdomain", async (c) => {
    const userId = c.get("userId");
    const subdomain = c.req.param("subdomain");
    const body = await c.req.json<{ ip: string }>();

    if (!body.ip) {
      return c.json({ error: "Missing ip" }, 400);
    }

    const existing = getSubdomain(db, subdomain);
    if (!existing) {
      return c.json({ error: "Subdomain not found" }, 404);
    }

    if (existing.user_id !== userId) {
      return c.json({ error: "Not authorized" }, 403);
    }

    await createDNSRecord(subdomain, body.ip);
    updateSubdomainIp(db, subdomain, userId, body.ip);

    return c.json({ subdomain, domain: `${subdomain}.${domain}`, ip: body.ip });
  });

  // DELETE /dns/:subdomain — remove DNS record
  app.delete("/:subdomain", async (c) => {
    const userId = c.get("userId");
    const subdomain = c.req.param("subdomain");

    const existing = getSubdomain(db, subdomain);
    if (!existing) {
      return c.json({ error: "Subdomain not found" }, 404);
    }

    if (existing.user_id !== userId) {
      return c.json({ error: "Not authorized" }, 403);
    }

    await deleteDNSRecord(subdomain);
    deleteSubdomain(db, subdomain, userId);

    return c.json({ deleted: subdomain });
  });

  return app;
}
```

**Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run src/routes/dns.test.ts`

Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add api/src/routes/dns.ts api/src/routes/dns.test.ts
git commit -m "feat(api): add DNS routes for subdomain allocation and management"
```

---

## Task 7: API — Templates Route + Server Entry Point

**Files:**
- Create: `api/src/routes/templates.ts`
- Create: `api/src/index.ts`

**Step 1: Implement templates route**

```typescript
// api/src/routes/templates.ts
import { Hono } from "hono";

// Hardcoded for MVP. Later this comes from a database or template registry.
const TEMPLATES = [
  {
    slug: "uptime-kuma",
    name: "Uptime Kuma",
    description: "Self-hosted monitoring tool",
    source: "https://github.com/louislam/uptime-kuma",
    port: 3001,
    min_ram: "512MB",
    env_vars: [],
  },
  {
    slug: "n8n",
    name: "n8n",
    description: "Workflow automation tool",
    source: "https://github.com/n8n-io/n8n",
    port: 5678,
    min_ram: "1GB",
    env_vars: [
      { key: "N8N_BASIC_AUTH_USER", label: "Admin username", required: true, secret: false },
      { key: "N8N_BASIC_AUTH_PASSWORD", label: "Admin password", required: true, secret: true },
    ],
  },
];

export function createTemplateRoutes(): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    return c.json({ templates: TEMPLATES });
  });

  return app;
}
```

**Step 2: Implement server entry point**

```typescript
// api/src/index.ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDb } from "./db.js";
import { initCloudflare } from "./cloudflare.js";
import { authMiddleware } from "./middleware.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createDnsRoutes } from "./routes/dns.js";
import { createTemplateRoutes } from "./routes/templates.js";

// Load env vars
const PORT = parseInt(process.env.PORT || "3000", 10);
const DOMAIN = process.env.DOMAIN;
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const DO_CLIENT_ID = process.env.DO_CLIENT_ID;
const DO_CLIENT_SECRET = process.env.DO_CLIENT_SECRET;

// Validate required env vars
const missing = [
  !DOMAIN && "DOMAIN",
  !CF_TOKEN && "CLOUDFLARE_API_TOKEN",
  !CF_ZONE_ID && "CLOUDFLARE_ZONE_ID",
  !DO_CLIENT_ID && "DO_CLIENT_ID",
  !DO_CLIENT_SECRET && "DO_CLIENT_SECRET",
].filter(Boolean);

if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  console.error("See api/.env.example for reference.");
  process.exit(1);
}

// Initialize
const db = createDb("./noxel.db");
initCloudflare({
  apiToken: CF_TOKEN!,
  zoneId: CF_ZONE_ID!,
  domain: DOMAIN!,
});

// Build app
const app = new Hono();

app.use("/*", cors());

// Health check (no auth)
app.get("/health", (c) => c.json({ status: "ok" }));

// Auth routes (no auth required — this IS the auth endpoint)
app.route("/auth", createAuthRoutes(db, {
  doClientId: DO_CLIENT_ID!,
  doClientSecret: DO_CLIENT_SECRET!,
}));

// Templates route (no auth required — public catalog)
app.route("/templates", createTemplateRoutes());

// DNS routes (auth required)
app.use("/dns/*", authMiddleware(db));
app.route("/dns", createDnsRoutes(db, DOMAIN!));

// Start server
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Noxel API running on http://localhost:${PORT}`);
  console.log(`Domain: ${DOMAIN}`);
});
```

**Step 3: Verify TypeScript compiles**

Run: `cd api && npx tsc --noEmit`

Expected: No errors.

**Step 4: Commit**

```bash
git add api/src/routes/templates.ts api/src/index.ts
git commit -m "feat(api): add templates route and server entry point"
```

---

## Task 8: CLI — Credential + API Client Libraries

**Files:**
- Create: `cli/src/lib/credentials.ts`
- Create: `cli/src/lib/api.ts`
- Create: `cli/src/lib/config.ts`

**Step 1: Implement config**

```typescript
// cli/src/lib/config.ts
export const NOXEL_API_URL = process.env.NOXEL_API_URL || "https://api.noxel.sh";
export const OAUTH_PORT = 19847;
export const DO_CLIENT_ID = "REPLACE_WITH_CLIENT_ID"; // Only the client_id — secret stays on API
export const DO_AUTH_URL = "https://cloud.digitalocean.com/v1/oauth/authorize";
```

Note: `DO_CLIENT_ID` is public and safe to embed. The `DO_CLIENT_SECRET` is on the API server only.

**Step 2: Implement credentials library**

Migrated from `prototype/auth/credentials.ts`. Adds `noxel_api_key` and `deployments.json` support.

```typescript
// cli/src/lib/credentials.ts
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const NOXEL_DIR = path.join(os.homedir(), ".noxel");
const CREDENTIALS_FILE = path.join(NOXEL_DIR, "credentials.json");
const DEPLOYMENTS_FILE = path.join(NOXEL_DIR, "deployments.json");

export interface Credentials {
  noxel_api_key: string;
  digitalocean: {
    access_token: string;
    refresh_token: string;
    expires_at: string;
    email: string;
  };
}

export interface Deployment {
  app: string;
  subdomain: string;
  domain: string;
  droplet_id: number;
  ip: string;
  region: string;
  created_at: string;
  custom_domain: string | null;
}

export type DeploymentStore = Record<string, Deployment>;

function ensureDir(): void {
  if (!fs.existsSync(NOXEL_DIR)) {
    fs.mkdirSync(NOXEL_DIR, { mode: 0o700 });
  }
}

// --- Credentials ---

export function getCredentials(): Credentials | null {
  if (!fs.existsSync(CREDENTIALS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf-8"));
  } catch {
    fs.unlinkSync(CREDENTIALS_FILE);
    return null;
  }
}

export function saveCredentials(creds: Credentials): void {
  ensureDir();
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function deleteCredentials(): boolean {
  if (!fs.existsSync(CREDENTIALS_FILE)) return false;
  fs.unlinkSync(CREDENTIALS_FILE);
  return true;
}

export function isTokenExpired(creds: Credentials): boolean {
  return new Date(creds.digitalocean.expires_at) <= new Date();
}

export function getDoToken(creds: Credentials): string {
  return creds.digitalocean.access_token;
}

export function getApiKey(creds: Credentials): string {
  return creds.noxel_api_key;
}

// --- Deployments ---

export function getDeployments(): DeploymentStore {
  if (!fs.existsSync(DEPLOYMENTS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function saveDeployment(deployment: Deployment): void {
  ensureDir();
  const store = getDeployments();
  store[deployment.subdomain] = deployment;
  fs.writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(store, null, 2));
}

export function removeDeployment(subdomain: string): void {
  const store = getDeployments();
  delete store[subdomain];
  ensureDir();
  fs.writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(store, null, 2));
}
```

**Step 3: Implement API client**

```typescript
// cli/src/lib/api.ts
import { NOXEL_API_URL } from "./config.js";

async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${NOXEL_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `API error: ${res.status}`);
  }

  return res.json();
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` };
}

// --- Auth ---

export async function exchangeAuthCode(
  code: string,
  redirectUri: string
): Promise<{
  do_access_token: string;
  do_refresh_token: string;
  do_expires_at: string;
  email: string;
  noxel_api_key: string;
}> {
  return apiFetch("/auth/digitalocean", {
    method: "POST",
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });
}

export async function refreshDoToken(
  refreshToken: string
): Promise<{
  do_access_token: string;
  do_refresh_token: string;
  do_expires_at: string;
}> {
  return apiFetch("/auth/digitalocean/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

// --- DNS ---

export async function allocateDns(
  apiKey: string,
  app: string,
  ip: string
): Promise<{ subdomain: string; domain: string }> {
  return apiFetch("/dns", {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({ app, ip }),
  });
}

export async function deleteDns(apiKey: string, subdomain: string): Promise<void> {
  await apiFetch(`/dns/${subdomain}`, {
    method: "DELETE",
    headers: authHeaders(apiKey),
  });
}

// --- Templates ---

export interface RemoteTemplate {
  slug: string;
  name: string;
  description: string;
  source: string;
  port: number;
  min_ram: string;
  env_vars: Array<{ key: string; label: string; required: boolean; secret: boolean }>;
}

export async function getTemplates(): Promise<RemoteTemplate[]> {
  const data = await apiFetch("/templates");
  return data.templates;
}
```

**Step 4: Commit**

```bash
git add cli/src/lib/config.ts cli/src/lib/credentials.ts cli/src/lib/api.ts
git commit -m "feat(cli): add credentials store, API client, and config"
```

---

## Task 9: CLI — DigitalOcean, SSH, and Template Libraries

**Files:**
- Create: `cli/src/lib/digitalocean.ts`
- Create: `cli/src/lib/ssh.ts`
- Create: `cli/src/lib/template.ts`
- Copy: `cli/src/templates/uptime-kuma/` (template.yaml + docker-compose.yml)
- Copy: `cli/src/templates/n8n/` (template.yaml + docker-compose.yml)

**Step 1: Migrate DigitalOcean module**

Adapted from `prototype/digitalocean.ts` — takes token as explicit parameter instead of reading from env.

```typescript
// cli/src/lib/digitalocean.ts
const API_BASE = "https://api.digitalocean.com/v2";

async function doFetch(token: string, path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DigitalOcean API error: ${res.status} ${text}`);
  }

  return res.json();
}

export async function createDroplet(
  token: string,
  name: string,
  sshKeyFingerprint: string,
  region: string
) {
  const data = await doFetch(token, "/droplets", {
    method: "POST",
    body: JSON.stringify({
      name,
      region,
      size: "s-1vcpu-1gb",
      image: "ubuntu-24-04-x64",
      ssh_keys: [sshKeyFingerprint],
      tags: ["noxel"],
    }),
  });

  return data.droplet as { id: number; name: string; status: string };
}

export async function getDroplet(token: string, id: number) {
  const data = await doFetch(token, `/droplets/${id}`);
  return data.droplet as {
    id: number;
    name: string;
    status: string;
    networks: { v4: Array<{ ip_address: string; type: string }> };
  };
}

export async function waitForDroplet(token: string, id: number): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const droplet = await getDroplet(token, id);
    if (droplet.status === "active") {
      const pub = droplet.networks.v4.find((n) => n.type === "public");
      if (pub) return pub.ip_address;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Timeout waiting for droplet to become active");
}

export async function deleteDroplet(token: string, id: number): Promise<void> {
  await fetch(`${API_BASE}/droplets/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function listSSHKeys(token: string) {
  const data = await doFetch(token, "/account/keys");
  return data.ssh_keys as Array<{
    id: number;
    fingerprint: string;
    name: string;
    public_key: string;
  }>;
}

export async function addSSHKey(token: string, name: string, publicKey: string) {
  const data = await doFetch(token, "/account/keys", {
    method: "POST",
    body: JSON.stringify({ name, public_key: publicKey }),
  });
  return data.ssh_key as { id: number; fingerprint: string; name: string };
}

// Available DigitalOcean regions for the CLI region picker
export const REGIONS = [
  { value: "blr1", label: "Bangalore" },
  { value: "sfo3", label: "San Francisco" },
  { value: "ams3", label: "Amsterdam" },
  { value: "fra1", label: "Frankfurt" },
  { value: "lon1", label: "London" },
  { value: "nyc3", label: "New York" },
  { value: "sgp1", label: "Singapore" },
  { value: "syd1", label: "Sydney" },
  { value: "tor1", label: "Toronto" },
];
```

**Step 2: Migrate SSH module**

Copy `prototype/ssh.ts` as-is — no changes needed.

```typescript
// cli/src/lib/ssh.ts
// Identical to prototype/ssh.ts — see prototype/ssh.ts for full source.
// Copy the entire file contents from prototype/ssh.ts to this location.
```

Copy the file: `cp prototype/ssh.ts cli/src/lib/ssh.ts`

**Step 3: Migrate template module**

Adapted from `prototype/template.ts` — uses `import.meta.url` relative to the new location.

```typescript
// cli/src/lib/template.ts
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

export interface EnvVar {
  key: string;
  label: string;
  required: boolean;
  secret: boolean;
  default?: string;
}

export interface Template {
  name: string;
  description: string;
  source: string;
  port: number;
  env_vars: EnvVar[];
  resources: { min_ram: string; min_cpu: number };
  composeFile: string;
}

export function listTemplates(): string[] {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];
  return fs.readdirSync(TEMPLATES_DIR).filter((name) => {
    return fs.existsSync(path.join(TEMPLATES_DIR, name, "template.yaml"));
  });
}

export function loadTemplate(appName: string): Template {
  const templateDir = path.join(TEMPLATES_DIR, appName);

  if (!fs.existsSync(templateDir)) {
    const available = listTemplates();
    throw new Error(`Template "${appName}" not found. Available: ${available.join(", ")}`);
  }

  const templateYaml = fs.readFileSync(path.join(templateDir, "template.yaml"), "utf-8");
  const config = yaml.load(templateYaml) as Record<string, unknown>;
  const composeFile = fs.readFileSync(path.join(templateDir, "docker-compose.yml"), "utf-8");

  return {
    name: config.name as string,
    description: config.description as string,
    source: config.source as string,
    port: config.port as number,
    env_vars: (config.env_vars as EnvVar[]) || [],
    resources: config.resources as { min_ram: string; min_cpu: number },
    composeFile,
  };
}
```

**Step 4: Copy templates**

```bash
mkdir -p cli/src/templates
cp -r prototype/templates/uptime-kuma cli/src/templates/
cp -r prototype/templates/n8n cli/src/templates/
```

**Step 5: Verify TypeScript compiles**

Run: `cd cli && npx tsc --noEmit`

Expected: No errors.

**Step 6: Commit**

```bash
git add cli/src/lib/digitalocean.ts cli/src/lib/ssh.ts cli/src/lib/template.ts cli/src/templates/
git commit -m "feat(cli): add DigitalOcean, SSH, and template libraries"
```

---

## Task 10: CLI — Entry Point + Login Command

**Files:**
- Create: `cli/src/cli.ts`
- Create: `cli/src/commands/login.ts`

**Step 1: Implement login command**

```typescript
// cli/src/commands/login.ts
import * as http from "node:http";
import * as crypto from "node:crypto";
import open from "open";
import * as p from "@clack/prompts";
import { saveCredentials, getCredentials } from "../lib/credentials.js";
import { exchangeAuthCode } from "../lib/api.js";
import { DO_CLIENT_ID, DO_AUTH_URL, OAUTH_PORT } from "../lib/config.js";

export async function loginCommand(): Promise<void> {
  p.intro("noxel login");

  // Check if already logged in
  const existing = getCredentials();
  if (existing) {
    const shouldContinue = await p.confirm({
      message: `Already connected as ${existing.digitalocean.email}. Reconnect?`,
    });
    if (p.isCancel(shouldContinue) || !shouldContinue) {
      p.outro("Cancelled.");
      return;
    }
  }

  const redirectUri = `http://localhost:${OAUTH_PORT}/callback`;
  const state = crypto.randomBytes(16).toString("hex");

  // Build auth URL
  const params = new URLSearchParams({
    client_id: DO_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "read write",
    state,
  });
  const authUrl = `${DO_AUTH_URL}?${params}`;

  // Start local server to receive callback
  const { server, codePromise } = await startCallbackServer(state);

  const spinner = p.spinner();

  // Open browser
  p.log.info("Opening browser to connect DigitalOcean...");
  try {
    await open(authUrl);
  } catch {
    p.log.warn(`Browser didn't open. Visit:\n${authUrl}`);
  }

  spinner.start("Waiting for authorization...");

  // Wait for callback with timeout
  let code: string;
  try {
    code = await Promise.race([
      codePromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timed out waiting for authorization (2 min)")), 120_000)
      ),
    ]);
  } catch (err) {
    spinner.stop("Authorization failed");
    server.close();
    p.log.error((err as Error).message);
    return;
  } finally {
    server.close();
  }

  spinner.message("Exchanging tokens...");

  // Exchange code via Noxel API (keeps client secret server-side)
  try {
    const result = await exchangeAuthCode(code, redirectUri);

    saveCredentials({
      noxel_api_key: result.noxel_api_key,
      digitalocean: {
        access_token: result.do_access_token,
        refresh_token: result.do_refresh_token,
        expires_at: result.do_expires_at,
        email: result.email,
      },
    });

    spinner.stop(`Connected as ${result.email}`);
    p.outro("Ready! Run noxel deploy to get started.");
  } catch (err) {
    spinner.stop("Login failed");
    p.log.error((err as Error).message);
  }
}

function startCallbackServer(
  expectedState: string
): Promise<{ server: http.Server; codePromise: Promise<string> }> {
  return new Promise((resolve, reject) => {
    let resolveCode: (code: string) => void;
    let rejectCode: (err: Error) => void;

    const codePromise = new Promise<string>((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });

    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${OAUTH_PORT}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const error = url.searchParams.get("error");
      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>Authorization denied</h1><p>You can close this window.</p>");
        rejectCode(new Error(`Authorization denied: ${error}`));
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (!code) {
        res.writeHead(400);
        res.end("Missing code");
        rejectCode(new Error("Missing code parameter"));
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400);
        res.end("Invalid state");
        rejectCode(new Error("Invalid state parameter — possible CSRF attack"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h1>Connected to DigitalOcean!</h1><p>You can close this window and return to the terminal.</p>");
      resolveCode(code);
    });

    server.on("error", reject);
    server.listen(OAUTH_PORT, "127.0.0.1", () => resolve({ server, codePromise }));
  });
}
```

**Step 2: Implement CLI entry point**

```typescript
// cli/src/cli.ts
#!/usr/bin/env node
import { Command } from "commander";
import { loginCommand } from "./commands/login.js";

const program = new Command();

program
  .name("noxel")
  .description("Deploy open-source apps in minutes")
  .version("0.1.0");

program
  .command("login")
  .description("Connect your DigitalOcean account")
  .action(loginCommand);

// Remaining commands will be added in subsequent tasks:
// deploy, destroy, list, status, templates, domain, logout

program.parse();
```

**Step 3: Verify TypeScript compiles**

Run: `cd cli && npx tsc --noEmit`

Expected: No errors.

**Step 4: Test manually**

Run: `cd cli && npx tsx src/cli.ts --help`

Expected: Shows help with `login` command listed.

**Step 5: Commit**

```bash
git add cli/src/cli.ts cli/src/commands/login.ts
git commit -m "feat(cli): add CLI entry point with commander and login command"
```

---

## Task 11: CLI — Deploy Command

This is the largest command. It implements the full interactive deployment flow with clack prompts.

**Files:**
- Create: `cli/src/commands/deploy.ts`

**Step 1: Implement deploy command**

```typescript
// cli/src/commands/deploy.ts
import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  getCredentials,
  isTokenExpired,
  saveCredentials,
  saveDeployment,
} from "../lib/credentials.js";
import { refreshDoToken, allocateDns } from "../lib/api.js";
import {
  createDroplet,
  waitForDroplet,
  listSSHKeys,
  addSSHKey,
  REGIONS,
} from "../lib/digitalocean.js";
import { getSSHPublicKey, waitForSSH, runCommands } from "../lib/ssh.js";
import { loadTemplate, listTemplates, type Template, type EnvVar } from "../lib/template.js";

export async function deployCommand(appName?: string): Promise<void> {
  p.intro("noxel deploy");

  // 1. Check auth
  const creds = getCredentials();
  if (!creds) {
    p.log.error("Not logged in. Run: noxel login");
    return;
  }

  // Refresh token if expired
  let doToken = creds.digitalocean.access_token;
  if (isTokenExpired(creds)) {
    try {
      const refreshed = await refreshDoToken(creds.digitalocean.refresh_token);
      doToken = refreshed.do_access_token;
      saveCredentials({
        ...creds,
        digitalocean: {
          ...creds.digitalocean,
          access_token: refreshed.do_access_token,
          refresh_token: refreshed.do_refresh_token,
          expires_at: refreshed.do_expires_at,
        },
      });
    } catch {
      p.log.error("Session expired. Run: noxel login");
      return;
    }
  }

  // 2. Select template
  let template: Template;
  if (appName) {
    try {
      template = loadTemplate(appName);
    } catch (err) {
      p.log.error((err as Error).message);
      return;
    }
  } else {
    const available = listTemplates();
    if (available.length === 0) {
      p.log.error("No templates available.");
      return;
    }

    const templates = available.map((slug) => {
      const t = loadTemplate(slug);
      return {
        value: slug,
        label: `${t.name} — ${t.description} (${t.resources.min_ram})`,
      };
    });

    const selected = await p.select({
      message: "Select an app to deploy",
      options: templates,
    });

    if (p.isCancel(selected)) {
      p.outro("Cancelled.");
      return;
    }

    template = loadTemplate(selected as string);
  }

  // 3. Select region
  const region = await p.select({
    message: "Server region?",
    options: REGIONS.map((r) => ({ value: r.value, label: `${r.label} (${r.value})` })),
  });

  if (p.isCancel(region)) {
    p.outro("Cancelled.");
    return;
  }

  // 4. Collect env vars
  let envVars: Record<string, string> = {};
  if (template.env_vars.length > 0) {
    p.log.info(`${template.name} requires some configuration:`);

    for (const envVar of template.env_vars) {
      const value = await p.text({
        message: envVar.label,
        placeholder: envVar.default || "",
        validate: (val) => {
          if (envVar.required && !val) return `${envVar.label} is required`;
        },
      });

      if (p.isCancel(value)) {
        p.outro("Cancelled.");
        return;
      }

      envVars[envVar.key] = value as string;
    }
  }

  // 5. Deploy!
  const startTime = Date.now();
  const spinner = p.spinner();

  try {
    // Ensure SSH key
    spinner.start("Checking SSH key...");
    const publicKey = getSSHPublicKey();
    const keys = await listSSHKeys(doToken);
    let sshFingerprint: string;

    const existing = keys.find((k) => k.public_key.trim() === publicKey);
    if (existing) {
      sshFingerprint = existing.fingerprint;
    } else {
      const newKey = await addSSHKey(doToken, "noxel-deploy", publicKey);
      sshFingerprint = newKey.fingerprint;
    }

    // Create droplet
    spinner.message("Creating server on DigitalOcean...");
    const dropletName = `noxel-${template.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
    const droplet = await createDroplet(doToken, dropletName, sshFingerprint, region as string);

    // Wait for droplet
    spinner.message("Waiting for server to be ready...");
    const ip = await waitForDroplet(doToken, droplet.id);

    // Allocate DNS via Noxel API
    spinner.message("Setting up DNS...");
    const slugName = template.name.toLowerCase().replace(/\s+/g, "-");
    const dns = await allocateDns(creds.noxel_api_key, slugName, ip);

    // Wait for SSH
    spinner.message("Connecting to server...");
    await waitForSSH(ip);

    // Install Docker
    spinner.message("Installing Docker + Caddy...");
    await installDocker(ip);
    await installCaddy(ip);

    // Deploy app
    spinner.message(`Deploying ${template.name}...`);
    await deployApp(ip, template, dns.subdomain, dns.domain, envVars);

    // Provisioning SSL
    spinner.message("Provisioning SSL certificate...");
    // Caddy handles this automatically — just wait a moment for it to kick in
    await new Promise((r) => setTimeout(r, 3000));

    spinner.stop("Deployed!");

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

    // Save deployment locally
    saveDeployment({
      app: template.name,
      subdomain: dns.subdomain,
      domain: dns.domain,
      droplet_id: droplet.id,
      ip,
      region: region as string,
      created_at: new Date().toISOString(),
      custom_domain: null,
    });

    p.log.info(`App:  ${pc.bold(template.name)}`);
    p.log.info(`URL:  ${pc.cyan(`https://${dns.domain}`)}`);
    p.log.info(`SSH:  ${pc.dim(`ssh root@${ip}`)}`);

    p.outro(`Deployed in ${elapsed}s`);
  } catch (err) {
    spinner.stop("Deployment failed");
    p.log.error((err as Error).message);
  }
}

// --- Helpers (migrated from prototype/deploy.ts) ---

async function installDocker(ip: string): Promise<void> {
  await runCommands(ip, [
    "apt-get update -qq",
    "apt-get install -y -qq ca-certificates curl gnupg",
    "install -m 0755 -d /etc/apt/keyrings",
    "curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes",
    "chmod a+r /etc/apt/keyrings/docker.gpg",
    `echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list`,
    "apt-get update -qq",
    "apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin",
  ]);
}

async function installCaddy(ip: string): Promise<void> {
  await runCommands(ip, [
    "apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https",
    "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg --yes",
    `curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list`,
    "apt-get update -qq",
    "apt-get install -y -qq caddy",
  ]);
}

async function deployApp(
  ip: string,
  template: Template,
  subdomain: string,
  fullDomain: string,
  envVars: Record<string, string>
): Promise<void> {
  const appDir = `/opt/${subdomain}`;

  let envFileCommands: string[] = [];
  if (Object.keys(envVars).length > 0) {
    const envContent = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    envFileCommands = [
      `cat > ${appDir}/.env << 'EOF'\n${envContent}\nEOF`,
    ];
  }

  await runCommands(ip, [
    `mkdir -p ${appDir}`,
    `cat > ${appDir}/docker-compose.yml << 'EOF'\n${template.composeFile}\nEOF`,
    ...envFileCommands,
    `cd ${appDir} && docker compose up -d`,
  ]);

  // Configure Caddy
  const caddyfile = `${fullDomain} {\n    reverse_proxy localhost:${template.port}\n}`;

  await runCommands(ip, [
    `cat > /etc/caddy/Caddyfile << 'EOF'\n${caddyfile}\nEOF`,
    "systemctl restart caddy",
  ]);
}
```

**Step 2: Register deploy command in CLI**

Add to `cli/src/cli.ts`:

```typescript
import { deployCommand } from "./commands/deploy.js";

program
  .command("deploy [app]")
  .description("Deploy an application")
  .action((app?: string) => deployCommand(app));
```

**Step 3: Verify TypeScript compiles**

Run: `cd cli && npx tsc --noEmit`

Expected: No errors.

**Step 4: Commit**

```bash
git add cli/src/commands/deploy.ts cli/src/cli.ts
git commit -m "feat(cli): add interactive deploy command with clack prompts"
```

---

## Task 12: CLI — Destroy, List, Status, Templates Commands

**Files:**
- Create: `cli/src/commands/destroy.ts`
- Create: `cli/src/commands/list.ts`
- Create: `cli/src/commands/status.ts`
- Create: `cli/src/commands/templates.ts`

**Step 1: Implement destroy command**

```typescript
// cli/src/commands/destroy.ts
import * as p from "@clack/prompts";
import {
  getCredentials,
  getDeployments,
  removeDeployment,
  type Deployment,
} from "../lib/credentials.js";
import { deleteDns } from "../lib/api.js";
import { deleteDroplet } from "../lib/digitalocean.js";

export async function destroyCommand(name?: string): Promise<void> {
  p.intro("noxel destroy");

  const creds = getCredentials();
  if (!creds) {
    p.log.error("Not logged in. Run: noxel login");
    return;
  }

  const deployments = getDeployments();
  const entries = Object.entries(deployments);

  if (entries.length === 0) {
    p.log.info("No active deployments.");
    p.outro("");
    return;
  }

  let target: [string, Deployment];

  if (name) {
    const found = entries.find(([key]) => key === name);
    if (!found) {
      p.log.error(`Deployment "${name}" not found. Run noxel list to see deployments.`);
      return;
    }
    target = found;
  } else {
    const selected = await p.select({
      message: "Which deployment do you want to destroy?",
      options: entries.map(([key, dep]) => ({
        value: key,
        label: `${key} (${dep.app} — https://${dep.domain})`,
      })),
    });

    if (p.isCancel(selected)) {
      p.outro("Cancelled.");
      return;
    }

    target = [selected as string, deployments[selected as string]];
  }

  const [subdomain, deployment] = target;

  const confirmed = await p.confirm({
    message: `Are you sure? This will permanently delete the server and all data.`,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.outro("Cancelled.");
    return;
  }

  const spinner = p.spinner();

  try {
    spinner.start("Removing DNS record...");
    await deleteDns(creds.noxel_api_key, subdomain);

    spinner.message("Destroying server...");
    await deleteDroplet(creds.digitalocean.access_token, deployment.droplet_id);

    removeDeployment(subdomain);
    spinner.stop(`Destroyed ${deployment.domain}`);

    p.outro("");
  } catch (err) {
    spinner.stop("Destroy failed");
    p.log.error((err as Error).message);
  }
}
```

**Step 2: Implement list command**

```typescript
// cli/src/commands/list.ts
import * as p from "@clack/prompts";
import pc from "picocolors";
import { getDeployments } from "../lib/credentials.js";

export async function listCommand(): Promise<void> {
  p.intro("noxel");

  const deployments = getDeployments();
  const entries = Object.values(deployments);

  if (entries.length === 0) {
    p.log.info("No active deployments. Run noxel deploy to get started.");
    p.outro("");
    return;
  }

  // Table header
  const header = `${"APP".padEnd(20)} ${"URL".padEnd(40)} STATUS`;
  p.log.info(pc.dim(header));

  for (const dep of entries) {
    const app = dep.app.padEnd(20);
    const url = `https://${dep.domain}`.padEnd(40);
    const status = `${pc.green("●")} running`;
    p.log.info(`${app} ${url} ${status}`);
  }

  p.outro(`${entries.length} deployment${entries.length !== 1 ? "s" : ""}`);
}
```

**Step 3: Implement status command**

```typescript
// cli/src/commands/status.ts
import * as p from "@clack/prompts";
import { getCredentials, getDeployments } from "../lib/credentials.js";

export async function statusCommand(): Promise<void> {
  p.intro("noxel");

  const creds = getCredentials();
  const deployments = getDeployments();
  const count = Object.keys(deployments).length;

  if (creds) {
    p.log.info(`DigitalOcean   connected (${creds.digitalocean.email})`);
  } else {
    p.log.info("DigitalOcean   not connected");
  }

  p.log.info(`Deployments    ${count} active`);

  p.outro(creds ? "All systems operational" : "Run noxel login to connect");
}
```

**Step 4: Implement templates command**

```typescript
// cli/src/commands/templates.ts
import * as p from "@clack/prompts";
import pc from "picocolors";
import { listTemplates, loadTemplate } from "../lib/template.js";

export async function templatesCommand(): Promise<void> {
  p.intro("noxel templates");

  const slugs = listTemplates();

  if (slugs.length === 0) {
    p.log.info("No templates available.");
    p.outro("");
    return;
  }

  for (const slug of slugs) {
    const t = loadTemplate(slug);
    const name = pc.bold(t.name.padEnd(20));
    const desc = t.description.padEnd(40);
    const ram = pc.dim(t.resources.min_ram);
    p.log.info(`${name} ${desc} ${ram}`);
  }

  p.outro(`${slugs.length} templates available`);
}
```

**Step 5: Register all commands in cli.ts**

Update `cli/src/cli.ts` to include all commands:

```typescript
#!/usr/bin/env node
import { Command } from "commander";
import { loginCommand } from "./commands/login.js";
import { deployCommand } from "./commands/deploy.js";
import { destroyCommand } from "./commands/destroy.js";
import { listCommand } from "./commands/list.js";
import { statusCommand } from "./commands/status.js";
import { templatesCommand } from "./commands/templates.js";

const program = new Command();

program
  .name("noxel")
  .description("Deploy open-source apps in minutes")
  .version("0.1.0");

program
  .command("login")
  .description("Connect your DigitalOcean account")
  .action(loginCommand);

program
  .command("deploy [app]")
  .description("Deploy an application")
  .action((app?: string) => deployCommand(app));

program
  .command("destroy [name]")
  .description("Destroy a deployment")
  .action((name?: string) => destroyCommand(name));

program
  .command("list")
  .description("Show active deployments")
  .action(listCommand);

program
  .command("status")
  .description("Show connection status")
  .action(statusCommand);

program
  .command("templates")
  .description("List available app templates")
  .action(templatesCommand);

// domain and logout will be added in next task

program.parse();
```

**Step 6: Verify TypeScript compiles**

Run: `cd cli && npx tsc --noEmit`

Expected: No errors.

**Step 7: Test CLI help**

Run: `cd cli && npx tsx src/cli.ts --help`

Expected: Shows all registered commands.

**Step 8: Commit**

```bash
git add cli/src/commands/destroy.ts cli/src/commands/list.ts cli/src/commands/status.ts cli/src/commands/templates.ts cli/src/cli.ts
git commit -m "feat(cli): add destroy, list, status, and templates commands"
```

---

## Task 13: CLI — Domain + Logout Commands

**Files:**
- Create: `cli/src/commands/domain.ts`
- Create: `cli/src/commands/logout.ts`
- Modify: `cli/src/cli.ts`

**Step 1: Implement domain command**

```typescript
// cli/src/commands/domain.ts
import * as dns from "node:dns/promises";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { getCredentials, getDeployments, saveDeployment } from "../lib/credentials.js";
import { runCommands } from "../lib/ssh.js";

export async function domainAddCommand(
  customDomain: string,
  options: { app: string }
): Promise<void> {
  p.intro("noxel domain");

  const deployments = getDeployments();
  const deployment = deployments[options.app];

  if (!deployment) {
    p.log.error(`Deployment "${options.app}" not found. Run noxel list to see deployments.`);
    return;
  }

  p.log.info("Add this DNS record at your domain provider:");
  p.log.info("");
  p.log.info(`  Type:   ${pc.bold("CNAME")}`);
  p.log.info(`  Name:   ${pc.bold(customDomain)}`);
  p.log.info(`  Value:  ${pc.bold(deployment.domain)}`);
  p.log.info("");
  p.log.info(`After adding the record, run:`);
  p.log.info(`  ${pc.cyan(`noxel domain verify ${customDomain}`)}`);

  p.outro("Waiting for DNS configuration");
}

export async function domainVerifyCommand(customDomain: string): Promise<void> {
  p.intro("noxel domain");

  const spinner = p.spinner();
  spinner.start("Checking DNS records...");

  try {
    const records = await dns.resolveCname(customDomain);

    if (records.length === 0) {
      spinner.stop("No CNAME record found");
      p.log.error(`CNAME record for ${customDomain} not found. Please add it and try again.`);
      return;
    }

    spinner.message("CNAME record found!");

    // Find which deployment this CNAME points to
    const deployments = getDeployments();
    const target = records[0]; // e.g., "uptime-kuma-a7x.noxel.sh"
    const subdomain = target.split(".")[0];
    const deployment = deployments[subdomain];

    if (!deployment) {
      spinner.stop("CNAME found but no matching deployment");
      p.log.error(`CNAME points to ${target} but no matching deployment found.`);
      return;
    }

    spinner.message("Configuring SSL certificate...");

    // Update Caddyfile to include custom domain
    const caddyfile = `${deployment.domain}, ${customDomain} {\n    reverse_proxy localhost:${getPortForApp(deployment.app)}\n}`;

    await runCommands(deployment.ip, [
      `cat > /etc/caddy/Caddyfile << 'EOF'\n${caddyfile}\nEOF`,
      "systemctl reload caddy",
    ]);

    // Save custom domain to local deployments
    deployment.custom_domain = customDomain;
    saveDeployment(deployment);

    spinner.stop(`${pc.green(customDomain)} is live!`);
    p.outro("");
  } catch (err) {
    spinner.stop("Verification failed");
    if ((err as NodeJS.ErrnoException).code === "ENOTFOUND" || (err as NodeJS.ErrnoException).code === "ENODATA") {
      p.log.error(`No CNAME record found for ${customDomain}. Please add it and try again.`);
    } else {
      p.log.error((err as Error).message);
    }
  }
}

// Quick helper — in a real version, look this up from the template
function getPortForApp(appName: string): number {
  const ports: Record<string, number> = {
    "Uptime Kuma": 3001,
    "n8n": 5678,
  };
  return ports[appName] || 3000;
}
```

**Step 2: Implement logout command**

```typescript
// cli/src/commands/logout.ts
import * as p from "@clack/prompts";
import { getCredentials, deleteCredentials, getDeployments } from "../lib/credentials.js";
import { destroyCommand } from "./destroy.js";

export async function logoutCommand(): Promise<void> {
  p.intro("noxel");

  const creds = getCredentials();
  if (!creds) {
    p.log.info("Not logged in.");
    p.outro("");
    return;
  }

  const deployments = getDeployments();
  const count = Object.keys(deployments).length;

  if (count > 0) {
    const choice = await p.select({
      message: `You have ${count} active deployment${count !== 1 ? "s" : ""}. What would you like to do?`,
      options: [
        { value: "keep", label: "Keep deployments running (just remove credentials)" },
        { value: "destroy", label: "Destroy all deployments, then logout" },
      ],
    });

    if (p.isCancel(choice)) {
      p.outro("Cancelled.");
      return;
    }

    if (choice === "destroy") {
      for (const name of Object.keys(deployments)) {
        await destroyCommand(name);
      }
    }
  }

  deleteCredentials();

  p.log.success("Credentials removed.");

  if (count > 0) {
    p.outro("Your deployments are still running. You can manage them from DigitalOcean.");
  } else {
    p.outro("");
  }
}
```

**Step 3: Register domain and logout commands in cli.ts**

Add to `cli/src/cli.ts`:

```typescript
import { domainAddCommand, domainVerifyCommand } from "./commands/domain.js";
import { logoutCommand } from "./commands/logout.js";

const domain = program
  .command("domain")
  .description("Manage custom domains");

domain
  .command("add <domain>")
  .requiredOption("--app <name>", "Deployment name (from noxel list)")
  .description("Show CNAME instructions for a custom domain")
  .action(domainAddCommand);

domain
  .command("verify <domain>")
  .description("Verify CNAME and configure SSL")
  .action(domainVerifyCommand);

program
  .command("logout")
  .description("Remove stored credentials")
  .action(logoutCommand);
```

**Step 4: Verify TypeScript compiles**

Run: `cd cli && npx tsc --noEmit`

Expected: No errors.

**Step 5: Test full CLI help**

Run: `cd cli && npx tsx src/cli.ts --help`

Expected: All commands shown — login, deploy, destroy, list, status, templates, domain, logout.

**Step 6: Commit**

```bash
git add cli/src/commands/domain.ts cli/src/commands/logout.ts cli/src/cli.ts
git commit -m "feat(cli): add domain and logout commands"
```

---

## Task 14: Build, Link, and Verify

**Files:**
- Modify: `cli/package.json` (ensure bin entry has shebang)
- Verify: all TypeScript compiles

**Step 1: Build both packages**

```bash
cd api && npx tsc
cd ../cli && npx tsc
```

Expected: Both compile without errors. `api/dist/` and `cli/dist/` are populated.

**Step 2: Ensure CLI shebang**

The `cli/src/cli.ts` must start with `#!/usr/bin/env node` (already added in Task 10).

After `tsc` compiles to `cli/dist/cli.js`, the shebang should be preserved. Verify:

```bash
head -1 cli/dist/cli.js
```

Expected: `#!/usr/bin/env node`

If not present (TypeScript sometimes strips it), add a build script to `cli/package.json`:

```json
"scripts": {
  "build": "tsc && echo '#!/usr/bin/env node' | cat - dist/cli.js > temp && mv temp dist/cli.js"
}
```

**Step 3: Link CLI locally for testing**

```bash
cd cli && npm link
```

Now `noxel` command is available globally on your machine.

**Step 4: Verify CLI works**

```bash
noxel --help
noxel status
noxel templates
```

Expected: Each command runs and shows clack-styled output.

**Step 5: Run all tests**

```bash
cd api && npx vitest run
```

Expected: All API tests pass (db, subdomain, middleware, dns routes).

**Step 6: Commit**

```bash
git add -A
git commit -m "build: verify compilation and link CLI for local testing"
```

---

## Task 15: Documentation and Cleanup

**Files:**
- Modify: `README.md`
- Create: `api/README.md`
- Modify: `.gitignore`

**Step 1: Update root README**

Update `README.md` to reflect the new project structure. Replace the prototype-focused content with:

- Project overview (same)
- Quick start: `npm i -g noxel && noxel login && noxel deploy`
- Architecture diagram (CLI + API split)
- Development setup for both api/ and cli/
- Link to design doc

Keep the template system section and competition section as-is.

**Step 2: Create api/README.md**

Brief setup instructions:
- Copy `.env.example` to `.env`, fill in values
- `npm run dev` to start development server
- List of endpoints

**Step 3: Final .gitignore check**

Ensure these are ignored:
- `api/noxel.db`
- `api/.env`
- `cli/dist/`
- `api/dist/`
- `node_modules/`

**Step 4: Commit**

```bash
git add -A
git commit -m "docs: update README for monorepo structure"
```

---

## Summary: Build Order

```
Task 1:  Monorepo scaffolding (api/ + cli/ workspaces)
Task 2:  API database module (users, subdomains)
Task 3:  API Cloudflare + subdomain generation
Task 4:  API auth middleware
Task 5:  API auth routes (OAuth exchange, token refresh)
Task 6:  API DNS routes (allocate, update, delete)
Task 7:  API templates route + server entry point
Task 8:  CLI credentials + API client + config libraries
Task 9:  CLI DigitalOcean + SSH + template libraries
Task 10: CLI entry point + login command
Task 11: CLI deploy command (the big one)
Task 12: CLI destroy + list + status + templates commands
Task 13: CLI domain + logout commands
Task 14: Build, link, and verify
Task 15: Documentation and cleanup
```

API is built first (Tasks 2–7) because the CLI depends on it. CLI is built second (Tasks 8–13) migrating prototype code. Final tasks verify everything works together.
