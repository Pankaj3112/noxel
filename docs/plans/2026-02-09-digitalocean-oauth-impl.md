# DigitalOcean OAuth CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace manual API token setup with interactive `noxel connect digitalocean` OAuth flow and restructure the CLI with subcommands.

**Architecture:** New `src/` directory with auth modules (credentials storage, OAuth flow) and a CLI entry point that routes subcommands (`connect`, `disconnect`, `status`, `deploy`, `destroy`). The existing `prototype/digitalocean.ts` gets updated to resolve tokens from stored credentials first, env var second.

**Tech Stack:** Node.js + TypeScript (existing), `node:http` (local OAuth server), `open` npm package (browser launch), no other new dependencies.

---

### Task 1: Credentials Storage Module

**Files:**
- Create: `src/auth/credentials.ts`

**Step 1: Write the credentials module**

This module reads/writes/deletes credentials from `~/.noxel/credentials.json` with `0600` permissions.

```typescript
// src/auth/credentials.ts
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const NOXEL_DIR = path.join(os.homedir(), ".noxel");
const CREDENTIALS_FILE = path.join(NOXEL_DIR, "credentials.json");

export interface ProviderCredentials {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  account_email: string;
}

interface CredentialsStore {
  [provider: string]: ProviderCredentials;
}

function ensureDir(): void {
  if (!fs.existsSync(NOXEL_DIR)) {
    fs.mkdirSync(NOXEL_DIR, { mode: 0o700 });
  }
}

function readStore(): CredentialsStore {
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf-8"));
  } catch {
    // Corrupted file — delete and start fresh
    fs.unlinkSync(CREDENTIALS_FILE);
    return {};
  }
}

function writeStore(store: CredentialsStore): void {
  ensureDir();
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(store, null, 2), {
    mode: 0o600,
  });
}

export function getCredentials(provider: string): ProviderCredentials | null {
  const store = readStore();
  return store[provider] ?? null;
}

export function saveCredentials(
  provider: string,
  creds: ProviderCredentials
): void {
  const store = readStore();
  store[provider] = creds;
  writeStore(store);
}

export function deleteCredentials(provider: string): boolean {
  const store = readStore();
  if (!(provider in store)) {
    return false;
  }
  delete store[provider];
  writeStore(store);
  return true;
}

export function isExpired(creds: ProviderCredentials): boolean {
  return new Date(creds.expires_at) <= new Date();
}
```

**Step 2: Commit**

```bash
git add src/auth/credentials.ts
git commit -m "feat: add credentials storage module for ~/.noxel/credentials.json"
```

---

### Task 2: OAuth Flow Module

**Files:**
- Create: `src/auth/oauth.ts`

**Step 1: Install the `open` package**

```bash
npm install open
```

Note: `open` is an ESM-only package. Our project is already `"type": "module"` so this works.

**Step 2: Write the OAuth module**

This module handles the full Authorization Code Flow: starts local HTTP server, opens browser, catches the callback, exchanges the code for tokens, and stores them.

```typescript
// src/auth/oauth.ts
import * as http from "node:http";
import open from "open";
import {
  saveCredentials,
  type ProviderCredentials,
} from "./credentials.js";

// These will be set after registering Noxel as a DO OAuth app.
// Embedded client_secret is standard for CLI apps (doctl, gh do the same).
const CLIENT_ID = process.env.NOXEL_DO_CLIENT_ID || "REPLACE_WITH_CLIENT_ID";
const CLIENT_SECRET =
  process.env.NOXEL_DO_CLIENT_SECRET || "REPLACE_WITH_CLIENT_SECRET";

const DO_AUTH_URL = "https://cloud.digitalocean.com/v1/oauth/authorize";
const DO_TOKEN_URL = "https://cloud.digitalocean.com/v1/oauth/token";

const PORTS = [9876, 9877, 9878];
const TIMEOUT_MS = 120_000; // 2 minutes

function buildAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "read write",
  });
  return `${DO_AUTH_URL}?${params}`;
}

async function exchangeCode(
  code: string,
  redirectUri: string
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  info: { name: string; email: string };
}> {
  const res = await fetch(DO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  return res.json();
}

function startServer(
  port: number
): Promise<{ server: http.Server; codePromise: Promise<string> }> {
  return new Promise((resolve, reject) => {
    let resolveCode: (code: string) => void;
    let rejectCode: (err: Error) => void;

    const codePromise = new Promise<string>((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });

    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${port}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const error = url.searchParams.get("error");
      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<h1>Authorization denied</h1><p>You can close this window.</p>"
        );
        rejectCode(new Error(`Authorization denied: ${error}`));
        return;
      }

      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(400);
        res.end("Missing code parameter");
        rejectCode(new Error("Missing code parameter in callback"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<h1>Connected to DigitalOcean!</h1><p>You can close this window and return to the terminal.</p>"
      );
      resolveCode(code);
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(err);
      } else {
        reject(err);
      }
    });

    server.listen(port, "127.0.0.1", () => {
      resolve({ server, codePromise });
    });
  });
}

export async function runOAuthFlow(): Promise<void> {
  // Try ports until one works
  let server: http.Server | null = null;
  let codePromise: Promise<string> | null = null;
  let port: number | null = null;

  for (const p of PORTS) {
    try {
      const result = await startServer(p);
      server = result.server;
      codePromise = result.codePromise;
      port = p;
      break;
    } catch {
      continue;
    }
  }

  if (!server || !codePromise || !port) {
    throw new Error(
      `Could not start local server. Ports ${PORTS.join(", ")} are all in use.`
    );
  }

  const redirectUri = `http://localhost:${port}/callback`;
  const authUrl = buildAuthUrl(redirectUri);

  console.log("\nOpening browser to connect your DigitalOcean account...");
  console.log(`\nIf your browser didn't open, visit:\n${authUrl}\n`);

  try {
    await open(authUrl);
  } catch {
    // Browser open failed — URL is already printed above
  }

  // Wait for callback with timeout
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Timed out waiting for authorization (2 min).")),
      TIMEOUT_MS
    )
  );

  let code: string;
  try {
    code = await Promise.race([codePromise, timeoutPromise]);
  } finally {
    server.close();
  }

  // Exchange code for token
  console.log("Exchanging authorization code for token...");
  const tokenData = await exchangeCode(code, redirectUri);

  // Calculate expiry
  const expiresAt = new Date(
    Date.now() + tokenData.expires_in * 1000
  ).toISOString();

  // Save credentials
  const creds: ProviderCredentials = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: expiresAt,
    account_email: tokenData.info.email,
  };

  saveCredentials("digitalocean", creds);

  console.log(
    `\nConnected to DigitalOcean as ${tokenData.info.email}`
  );
}
```

**Step 3: Commit**

```bash
git add src/auth/oauth.ts
git commit -m "feat: add OAuth flow module with local redirect for DigitalOcean"
```

---

### Task 3: Token Refresh Module

**Files:**
- Create: `src/auth/refresh.ts`

**Step 1: Write the refresh module**

```typescript
// src/auth/refresh.ts
import {
  getCredentials,
  saveCredentials,
  deleteCredentials,
  isExpired,
} from "./credentials.js";

const DO_TOKEN_URL = "https://cloud.digitalocean.com/v1/oauth/token";

export async function getDigitalOceanToken(): Promise<string> {
  // 1. Try stored OAuth credentials
  const creds = getCredentials("digitalocean");
  if (creds) {
    if (!isExpired(creds)) {
      return creds.access_token;
    }
    // Attempt refresh
    try {
      return await refreshDigitalOceanToken(creds.refresh_token);
    } catch {
      deleteCredentials("digitalocean");
      throw new Error(
        "DigitalOcean token expired and refresh failed. Run: noxel connect digitalocean"
      );
    }
  }

  // 2. Fall back to env var
  const envToken = process.env.DIGITALOCEAN_API_TOKEN;
  if (envToken && envToken !== "your_token_here") {
    return envToken;
  }

  // 3. Not connected
  throw new Error(
    "Not connected to DigitalOcean. Run: noxel connect digitalocean"
  );
}

async function refreshDigitalOceanToken(
  refreshToken: string
): Promise<string> {
  const res = await fetch(DO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    info: { email: string };
  };

  const expiresAt = new Date(
    Date.now() + data.expires_in * 1000
  ).toISOString();

  saveCredentials("digitalocean", {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
    account_email: data.info.email,
  });

  return data.access_token;
}
```

**Step 2: Commit**

```bash
git add src/auth/refresh.ts
git commit -m "feat: add token refresh with fallback to env var"
```

---

### Task 4: Update digitalocean.ts to Use Stored Credentials

**Files:**
- Modify: `prototype/digitalocean.ts`

**Step 1: Update `getToken()` to be async and use the refresh module**

Change the imports and `getToken()` function. Then update all callers (`doFetch`, `deleteDroplet`) since `getToken()` is now async.

Replace the entire `prototype/digitalocean.ts` with:

```typescript
import { getDigitalOceanToken } from "../src/auth/refresh.js";

const API_BASE = "https://api.digitalocean.com/v2";

async function doFetch(path: string, options: RequestInit = {}) {
  const token = await getDigitalOceanToken();
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

export async function createDroplet(name: string, sshKeyFingerprint: string) {
  const data = await doFetch("/droplets", {
    method: "POST",
    body: JSON.stringify({
      name,
      region: "blr1",
      size: "s-1vcpu-1gb",
      image: "ubuntu-24-04-x64",
      ssh_keys: [sshKeyFingerprint],
      tags: ["noxel-prototype"],
    }),
  });

  return data.droplet as {
    id: number;
    name: string;
    status: string;
  };
}

export async function getDroplet(id: number) {
  const data = await doFetch(`/droplets/${id}`);
  return data.droplet as {
    id: number;
    name: string;
    status: string;
    networks: {
      v4: Array<{ ip_address: string; type: string }>;
    };
  };
}

export async function waitForDroplet(id: number): Promise<string> {
  console.log("Waiting for droplet to be ready...");

  for (let i = 0; i < 60; i++) {
    const droplet = await getDroplet(id);

    if (droplet.status === "active") {
      const publicNetwork = droplet.networks.v4.find((n) => n.type === "public");
      if (publicNetwork) {
        return publicNetwork.ip_address;
      }
    }

    await new Promise((r) => setTimeout(r, 5000));
    process.stdout.write(".");
  }

  throw new Error("Timeout waiting for droplet");
}

export async function listSSHKeys() {
  const data = await doFetch("/account/keys");
  return data.ssh_keys as Array<{
    id: number;
    fingerprint: string;
    name: string;
    public_key: string;
  }>;
}

export async function addSSHKey(name: string, publicKey: string) {
  const data = await doFetch("/account/keys", {
    method: "POST",
    body: JSON.stringify({ name, public_key: publicKey }),
  });
  return data.ssh_key as {
    id: number;
    fingerprint: string;
    name: string;
  };
}

export async function deleteDroplet(id: number) {
  const token = await getDigitalOceanToken();
  await fetch(`${API_BASE}/droplets/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
```

**Step 2: Update `prototype/destroy.ts` to use the shared token resolver**

Replace the local `getToken()` in `destroy.ts` with the shared module. Replace the top of the file:

```typescript
import "dotenv/config";
import { getDigitalOceanToken } from "../src/auth/refresh.js";
import { deleteDNSRecord } from "./cloudflare.js";

const API_BASE = "https://api.digitalocean.com/v2";

async function listDroplets() {
  const token = await getDigitalOceanToken();
  const res = await fetch(`${API_BASE}/droplets?tag_name=noxel-prototype`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.droplets as Array<{
    id: number;
    name: string;
    networks: { v4: Array<{ ip_address: string; type: string }> };
  }>;
}

async function deleteDroplet(id: number, name: string) {
  const token = await getDigitalOceanToken();
  const res = await fetch(`${API_BASE}/droplets/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.ok || res.status === 204) {
    console.log(`  Deleted droplet: ${name} (${id})`);
  } else {
    console.log(`  Failed to delete: ${name} - ${res.status}`);
  }
}
```

The rest of `destroy.ts` (`main()` function) stays unchanged.

**Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: No errors. The `prototype/deploy.ts` imports from `./digitalocean.js` which is unchanged in its export signatures (just `getToken` became async internally).

**Step 4: Commit**

```bash
git add prototype/digitalocean.ts prototype/destroy.ts
git commit -m "feat: update DO modules to resolve token from stored credentials or env var"
```

---

### Task 5: CLI Entry Point with Subcommands

**Files:**
- Create: `src/cli.ts`
- Modify: `package.json` (add `noxel` script)

**Step 1: Write the CLI entry point**

This routes subcommands without a framework — simple `process.argv` parsing. Keeps it lightweight.

```typescript
// src/cli.ts
import "dotenv/config";
import { runOAuthFlow } from "./auth/oauth.js";
import { deleteCredentials, getCredentials } from "./auth/credentials.js";

const [command, subcommand] = process.argv.slice(2);

async function main() {
  switch (command) {
    case "connect":
      await handleConnect(subcommand);
      break;

    case "disconnect":
      await handleDisconnect(subcommand);
      break;

    case "status":
      await handleStatus();
      break;

    case "deploy": {
      // Delegate to existing deploy script
      const { default: deploy } = await import(
        "../prototype/deploy.js"
      );
      break;
    }

    case "destroy": {
      // Delegate to existing destroy script
      const { default: destroy } = await import(
        "../prototype/destroy.js"
      );
      break;
    }

    default:
      printUsage();
      break;
  }
}

async function handleConnect(provider?: string) {
  if (provider !== "digitalocean") {
    console.log("Usage: noxel connect digitalocean");
    console.log("\nSupported providers: digitalocean");
    process.exit(1);
  }

  const existing = getCredentials("digitalocean");
  if (existing) {
    console.log(
      `Already connected to DigitalOcean as ${existing.account_email}.`
    );
    console.log("Run 'noxel disconnect digitalocean' first to reconnect.");
    return;
  }

  await runOAuthFlow();
}

async function handleDisconnect(provider?: string) {
  if (provider !== "digitalocean") {
    console.log("Usage: noxel disconnect digitalocean");
    process.exit(1);
  }

  const deleted = deleteCredentials("digitalocean");
  if (deleted) {
    console.log("Disconnected from DigitalOcean.");
  } else {
    console.log("Not connected to DigitalOcean.");
  }
}

async function handleStatus() {
  console.log("Noxel Status\n");

  // DigitalOcean
  const doCreds = getCredentials("digitalocean");
  if (doCreds) {
    console.log(`  DigitalOcean: connected as ${doCreds.account_email}`);
  } else if (process.env.DIGITALOCEAN_API_TOKEN) {
    console.log("  DigitalOcean: connected via env var (API token)");
  } else {
    console.log("  DigitalOcean: not connected");
  }

  // Cloudflare
  if (process.env.CLOUDFLARE_API_TOKEN) {
    console.log("  Cloudflare:   connected via env var (API token)");
  } else {
    console.log("  Cloudflare:   not connected");
  }

  // Domain
  if (process.env.DOMAIN) {
    console.log(`  Domain:       ${process.env.DOMAIN}`);
  } else {
    console.log("  Domain:       not set");
  }
}

function printUsage() {
  console.log("Noxel - Deploy open-source AI tools\n");
  console.log("Usage: noxel <command>\n");
  console.log("Commands:");
  console.log("  connect digitalocean    Connect your DigitalOcean account");
  console.log("  disconnect digitalocean Remove DigitalOcean connection");
  console.log("  status                  Show connection status");
  console.log("  deploy <app>            Deploy an application");
  console.log("  destroy                 Destroy deployed resources");
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
```

**Step 2: Update package.json scripts**

Add the `noxel` script entry. The existing `deploy` and `destroy` scripts stay for backwards compatibility.

In `package.json`, update the `"scripts"` section to:

```json
{
  "scripts": {
    "noxel": "tsx src/cli.ts",
    "deploy": "tsx prototype/deploy.ts",
    "destroy": "tsx prototype/destroy.ts"
  }
}
```

**Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

**Step 4: Test the CLI help output**

```bash
npm run noxel
```

Expected output:
```
Noxel - Deploy open-source AI tools

Usage: noxel <command>

Commands:
  connect digitalocean    Connect your DigitalOcean account
  disconnect digitalocean Remove DigitalOcean connection
  status                  Show connection status
  deploy <app>            Deploy an application
  destroy                 Destroy deployed resources
```

**Step 5: Test the status command**

```bash
npm run noxel -- status
```

Expected: Shows current connection status based on env vars / credentials.

**Step 6: Commit**

```bash
git add src/cli.ts package.json
git commit -m "feat: add CLI entry point with connect/disconnect/status/deploy/destroy commands"
```

---

### Task 6: Make deploy.ts and destroy.ts Work as Importable Modules

**Files:**
- Modify: `prototype/deploy.ts`
- Modify: `prototype/destroy.ts`

The CLI's `deploy` and `destroy` commands use dynamic `import()` to delegate to the existing scripts. Currently, those scripts call `main()` at module level. We need to wrap the auto-execution so it only runs when invoked directly (not imported).

**Step 1: Update deploy.ts**

At the bottom of `prototype/deploy.ts`, replace the current `main().catch(...)` block (lines 201-204) with:

```typescript
// Only auto-run when executed directly, not when imported
const isDirectRun =
  process.argv[1]?.includes("deploy.ts") ||
  process.argv[1]?.includes("deploy.js");
if (isDirectRun) {
  main().catch((err) => {
    console.error("\nDeployment failed:", err.message);
    process.exit(1);
  });
}

export default main;
```

**Step 2: Update destroy.ts**

At the bottom of `prototype/destroy.ts`, replace the current `main().catch(...)` block (lines 74-77) with:

```typescript
const isDirectRun =
  process.argv[1]?.includes("destroy.ts") ||
  process.argv[1]?.includes("destroy.js");
if (isDirectRun) {
  main().catch((err) => {
    console.error("Cleanup failed:", err.message);
    process.exit(1);
  });
}

export default main;
```

**Step 3: Update cli.ts deploy/destroy handlers to actually call the imported function**

In `src/cli.ts`, update the `deploy` and `destroy` cases:

```typescript
    case "deploy": {
      // Pass the app name through argv so deploy.ts picks it up
      process.argv[2] = subcommand || "";
      const { default: deploy } = await import(
        "../prototype/deploy.js"
      );
      await deploy();
      break;
    }

    case "destroy": {
      const { default: destroy } = await import(
        "../prototype/destroy.js"
      );
      await destroy();
      break;
    }
```

**Step 4: Verify existing scripts still work directly**

```bash
npm run deploy
```

Expected: Shows template usage message (no app name provided).

**Step 5: Commit**

```bash
git add prototype/deploy.ts prototype/destroy.ts src/cli.ts
git commit -m "feat: make deploy/destroy importable modules for CLI routing"
```

---

### Task 7: Install `open` Package and Verify Full Build

**Files:**
- Modify: `package.json` (dependency added by npm install)

**Step 1: Install the `open` package**

```bash
cd /Users/pankajbeniwal/Code/noxel && npm install open
```

**Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Verify CLI works end-to-end**

```bash
npm run noxel
npm run noxel -- status
npm run noxel -- connect
npm run noxel -- connect digitalocean
```

The last command will try to start the OAuth flow — it will open a browser to DigitalOcean's OAuth page. Since the `CLIENT_ID` is a placeholder, DO will show an error. That's expected until you register the OAuth app.

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add open package for browser launch in OAuth flow"
```

---

### Task 8: Update .env.example and Documentation

**Files:**
- Modify: `.env.example`
- Modify: `docs/setup-env.md`

**Step 1: Update .env.example**

Make the DO token optional with a comment explaining the alternative:

```
# DigitalOcean - Option 1: Run 'npm run noxel -- connect digitalocean' (recommended)
# DigitalOcean - Option 2: Paste API token below
DIGITALOCEAN_API_TOKEN=
CLOUDFLARE_API_TOKEN=your_token_here
CLOUDFLARE_ZONE_ID=your_zone_id_here
DOMAIN=yourdomain.com
```

**Step 2: Add OAuth section to docs/setup-env.md**

Add this section at the top of the file, before the existing DigitalOcean token instructions:

```markdown
## Quick Setup (Recommended)

Connect your DigitalOcean account interactively:

\`\`\`bash
npm run noxel -- connect digitalocean
\`\`\`

This opens your browser, you authorize Noxel, and you're done. No need to copy API tokens.

Check your connection status:

\`\`\`bash
npm run noxel -- status
\`\`\`

---

## Manual Setup (Alternative)

If you prefer using API tokens directly, follow the steps below.
```

**Step 3: Commit**

```bash
git add .env.example docs/setup-env.md
git commit -m "docs: update setup guide with OAuth connect flow"
```

---

## Task Dependency Order

```
Task 1 (credentials) → Task 2 (oauth) → Task 3 (refresh)
                                              ↓
Task 4 (update digitalocean.ts) → Task 5 (CLI) → Task 6 (importable modules)
                                                        ↓
                                                  Task 7 (install & verify)
                                                        ↓
                                                  Task 8 (docs)
```

Tasks 1-3 build the auth layer. Task 4 integrates it into existing code. Tasks 5-6 build the CLI. Task 7 verifies everything. Task 8 updates docs.
