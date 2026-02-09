# Noxel MVP: CLI + API

## Problem

The prototype validates the deployment pipeline but can't ship as a product because:

1. **Cloudflare token is on the user's machine** — users shouldn't control our domain's DNS
2. **DO client secret is in source code** — extractable from any distributed binary
3. **No subdomain allocation** — who decides what `myapp-xyz.noxel.sh` looks like?
4. **No user identity** — can't track deployments, enforce limits, or bill later

## Solution

Ship two things:

1. **Noxel CLI** — installed via `npm i -g noxel`, runs on user's machine, handles DigitalOcean provisioning and app deployment via SSH
2. **Noxel API** — lightweight server on our infra, handles DNS, OAuth exchange, subdomain allocation, and user identity

All secrets (Cloudflare token, DO client secret, domain config) stay on the API server. The user's DO token stays on their machine. The CLI only calls the API for things that require our secrets.

## Architecture

```
User's machine (CLI)                 Noxel server (API)
┌─────────────────────┐             ┌─────────────────────┐
│ noxel login          │────────────▶│ OAuth token exchange │
│                      │◀────────────│ (DO client secret)   │
│ DO token stored      │             │                      │
│ Noxel API key stored │             │ User record created  │
├─────────────────────┤             ├─────────────────────┤
│ noxel deploy <app>   │            │                      │
│  1. Create droplet   │ (DO API)   │                      │
│  2. Wait for VM      │            │                      │
│  3. Request subdomain│────────────▶│ Allocate subdomain   │
│                      │◀────────────│ Create Cloudflare A  │
│  4. SSH into VM      │            │ (Cloudflare token)   │
│  5. Install Docker   │            │                      │
│  6. Install Caddy    │            │                      │
│  7. Deploy app       │            │                      │
│  8. Print URL        │            │                      │
└─────────────────────┘             └─────────────────────┘
```

## What stays where

| Secret | Location | Why |
|--------|----------|-----|
| DO access token | User's machine (`~/.noxel/credentials.json`) | It's their account, their token |
| DO client secret | Noxel API server | Required for OAuth exchange, must not be in distributed code |
| Cloudflare API token | Noxel API server | Controls our domain, must not leave our infra |
| Cloudflare zone ID | Noxel API server | Same — our domain config |
| Domain name (e.g. noxel.sh) | Noxel API server config | We control the domain |
| Noxel API key | User's machine (`~/.noxel/credentials.json`) | Authenticates CLI requests to our API |

## CLI Experience

### Libraries

| Library | Purpose |
|---------|---------|
| **@clack/prompts** | Interactive UI — spinners, selects, search, grouped prompts, progress |
| **commander** | Command routing (`noxel deploy`, `noxel login`, etc.) |

### noxel login

```
$ noxel login

  ┌  noxel
  │
  ◇  Opening browser to connect DigitalOcean...
  │
  ◆  Waiting for authorization...
  │
  ◇  Connected as user@example.com
  │
  └  Ready! Run noxel deploy to get started.
```

### noxel deploy (interactive — no app specified)

```
$ noxel deploy

  ┌  noxel deploy
  │
  ◆  Select an app to deploy
  │  Search: _
  │
  │  ● Uptime Kuma — Self-hosted monitoring (512 MB RAM)
  │  ○ n8n — Workflow automation (1 GB RAM)
  │  ○ Ollama WebUI — Chat with local LLMs (2 GB RAM)
  │  ○ Plausible — Privacy-friendly analytics (1 GB RAM)
  │  ○ Hoppscotch — Open-source API client (512 MB RAM)
  │
  │  ↑/↓ navigate · type to filter · enter to select
  │
  ◆  Server region?
  │  ● Bangalore (blr1)
  │  ○ San Francisco (sfo3)
  │  ○ Amsterdam (ams3)
  │  ○ Frankfurt (fra1)
  │
  ◇  Creating server on DigitalOcean...
  ◇  Setting up DNS (uptime-kuma-a7x.noxel.sh)...
  ◇  Installing Docker + Caddy...
  ◇  Deploying Uptime Kuma...
  ◇  Provisioning SSL certificate...
  │
  │  App:  Uptime Kuma
  │  URL:  https://uptime-kuma-a7x.noxel.sh
  │  SSH:  ssh root@203.0.113.42
  │
  └  Deployed in 1m 47s
```

### noxel deploy (direct — app specified)

```
$ noxel deploy uptime-kuma

  ┌  noxel deploy
  │
  ◆  Server region?
  │  ● Bangalore (blr1)
  │  ○ San Francisco (sfo3)
  │  ○ Amsterdam (ams3)
  │
  ◇  Creating server on DigitalOcean...
  ...
```

Skips the template picker when the app is passed as an argument.

### noxel deploy (app with env vars — e.g. n8n)

```
$ noxel deploy n8n

  ┌  noxel deploy
  │
  ◆  Server region?
  │  ● Bangalore (blr1)
  │
  ◆  n8n requires some configuration:
  │
  │  ◆  Basic auth username:
  │  │  admin_
  │
  │  ◆  Basic auth password:
  │  │  ●●●●●●●●_
  │
  ◇  Creating server on DigitalOcean...
  ...
```

Env vars from `template.yaml` are prompted interactively. Secret fields are masked.

### noxel templates

```
$ noxel templates

  ┌  noxel templates
  │
  │  Uptime Kuma        Self-hosted monitoring tool              512 MB
  │  n8n                Workflow automation                      1 GB
  │  Ollama WebUI       Chat with local LLMs                    2 GB
  │  Plausible          Privacy-friendly analytics               1 GB
  │  Hoppscotch         Open-source API client                  512 MB
  │
  └  5 templates available
```

### noxel list

```
$ noxel list

  ┌  noxel
  │
  │  APP              URL                                STATUS
  │  Uptime Kuma      https://uptime-kuma-a7x.noxel.sh   ● running
  │  n8n              https://n8n-b2k.noxel.sh            ● running
  │
  └  2 deployments
```

### noxel destroy (interactive)

```
$ noxel destroy

  ┌  noxel destroy
  │
  ◆  Which deployment do you want to destroy?
  │  ● uptime-kuma-a7x (Uptime Kuma — https://uptime-kuma-a7x.noxel.sh)
  │  ○ n8n-b2k (n8n — https://n8n-b2k.noxel.sh)
  │
  ◆  Are you sure? This will permanently delete the server and all data.
  │  ● Yes, destroy uptime-kuma-a7x
  │  ○ No, cancel
  │
  ◇  Removing DNS record...
  ◇  Destroying server...
  │
  └  Destroyed uptime-kuma-a7x.noxel.sh
```

### noxel status

```
$ noxel status

  ┌  noxel
  │
  │  DigitalOcean   connected (user@example.com)
  │  Deployments    2 active
  │
  └  All systems operational
```

### noxel domain

```
$ noxel domain add blog.example.com --app uptime-kuma-a7x

  ┌  noxel domain
  │
  │  Add this DNS record at your domain provider:
  │
  │  Type:   CNAME
  │  Name:   blog.example.com
  │  Value:  uptime-kuma-a7x.noxel.sh
  │
  │  After adding the record, run:
  │  noxel domain verify blog.example.com
  │
  └  Waiting for DNS configuration

$ noxel domain verify blog.example.com

  ┌  noxel domain
  │
  ◇  Checking DNS records...
  ◇  CNAME record found!
  ◇  Configuring SSL certificate...
  │
  └  blog.example.com is live!
```

### noxel logout

```
$ noxel logout

  ┌  noxel
  │
  ◆  You have 2 active deployments. What would you like to do?
  │  ● Keep deployments running (just remove credentials)
  │  ○ Destroy all deployments, then logout
  │
  ◇  Credentials removed.
  │
  └  Your deployments are still running. You can manage them from DigitalOcean.
```

### Error states

```
$ noxel deploy

  ┌  noxel deploy
  │
  ✖  Not logged in. Run: noxel login
```

```
$ noxel deploy uptime-kuma

  ┌  noxel deploy
  │
  ◇  Creating server on DigitalOcean...
  ✖  DigitalOcean API error: droplet limit reached.
  │  Increase your limit at: https://cloud.digitalocean.com/account/team/droplet_limit_increase
```

## User Flows (Behind the Scenes)

### Login flow (behind the scenes)
1. CLI generates random `state` parameter
2. CLI opens browser to `https://cloud.digitalocean.com/v1/oauth/authorize?client_id=NOXEL_CLIENT_ID&redirect_uri=http://localhost:19847/callback&response_type=code&scope=read+write&state=STATE`
3. User authorizes on DigitalOcean
4. DO redirects to `http://localhost:19847/callback?code=AUTH_CODE&state=STATE`
5. CLI sends auth code to Noxel API: `POST https://api.noxel.sh/auth/digitalocean`
6. API exchanges code for tokens using client secret (tokens are transient, not stored on API)
7. API calls DO `/v2/account` to get user email
8. API creates or updates user record, generates Noxel API key
9. API returns: `{ do_access_token, do_refresh_token, expires_at, email, noxel_api_key }`
10. CLI stores everything in `~/.noxel/credentials.json`

### Deploy flow (behind the scenes)
1. CLI loads template from bundled templates
2. CLI calls DO API to create droplet (using local DO token)
3. CLI waits for droplet to be active, gets IP
4. CLI calls Noxel API: `POST https://api.noxel.sh/dns` with `{ app: "uptime-kuma", ip: "203.0.113.42" }`
5. API allocates subdomain (e.g. `uptime-kuma-a7x`), creates Cloudflare A record
6. API returns: `{ subdomain: "uptime-kuma-a7x", domain: "uptime-kuma-a7x.noxel.sh" }`
7. CLI SSHes into VM, installs Docker + Caddy, deploys app
8. CLI saves deployment info to `~/.noxel/deployments.json`

### Destroy flow (behind the scenes)
1. CLI looks up deployment in `~/.noxel/deployments.json`
2. CLI calls Noxel API: `DELETE https://api.noxel.sh/dns/uptime-kuma-a7x`
3. API removes Cloudflare A record
4. CLI calls DO API to delete droplet
5. CLI removes entry from local deployments file

### Custom domain flow (behind the scenes)
1. CLI prints CNAME instructions (no API call needed)
2. On `verify`, CLI does a DNS lookup to confirm the CNAME exists
3. CLI SSHes into the VM and updates the Caddyfile to include the custom domain
4. Caddy auto-provisions an SSL certificate for the custom domain

## API Design

Base URL: `https://api.noxel.sh`

All endpoints (except auth) require header: `Authorization: Bearer <noxel_api_key>`

### POST /auth/digitalocean

Exchange DO auth code for tokens. This is the only endpoint that touches the DO client secret.

**Request:**
```json
{
  "code": "do_auth_code_here",
  "redirect_uri": "http://localhost:19847/callback"
}
```

**Response:**
```json
{
  "do_access_token": "dop_v1_abc...",
  "do_refresh_token": "dop_v1_def...",
  "do_expires_at": "2026-03-11T10:00:00Z",
  "email": "user@example.com",
  "noxel_api_key": "nxl_abc123..."
}
```

**What the API does:**
1. Exchanges code for DO tokens using client secret
2. Calls DO `/v2/account` to get email
3. Creates/updates user record in database
4. Generates Noxel API key (or returns existing one)
5. Returns tokens + API key (does NOT persist DO tokens)

### POST /auth/digitalocean/refresh

Refresh an expired DO token.

**Request:**
```json
{
  "refresh_token": "dop_v1_def..."
}
```

**Response:**
```json
{
  "do_access_token": "dop_v1_new...",
  "do_refresh_token": "dop_v1_newref...",
  "do_expires_at": "2026-04-11T10:00:00Z"
}
```

### POST /dns

Allocate a subdomain and create DNS record.

**Request:**
```json
{
  "app": "uptime-kuma",
  "ip": "203.0.113.42"
}
```

**Response:**
```json
{
  "subdomain": "uptime-kuma-a7x",
  "domain": "uptime-kuma-a7x.noxel.sh"
}
```

**What the API does:**
1. Generate unique subdomain: `{app}-{random3chars}`
2. Check it doesn't already exist
3. Create Cloudflare A record pointing to the IP
4. Store subdomain → user mapping in database
5. Return the full domain

### PUT /dns/:subdomain

Update IP for existing subdomain (e.g., after VM recreation).

**Request:**
```json
{
  "ip": "203.0.113.99"
}
```

### DELETE /dns/:subdomain

Remove DNS record and free the subdomain.

### GET /templates

Return available app templates. For MVP this mirrors what's bundled in the CLI, but later this becomes the source of truth for both CLI and webapp.

**Response:**
```json
{
  "templates": [
    {
      "slug": "uptime-kuma",
      "name": "Uptime Kuma",
      "description": "Self-hosted monitoring tool",
      "source": "https://github.com/louislam/uptime-kuma",
      "min_ram": "512MB"
    }
  ]
}
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `noxel login` | OAuth flow via browser, stores DO token + Noxel API key |
| `noxel logout` | Remove stored credentials |
| `noxel status` | Show connected account and deployment count |
| `noxel deploy <app>` | Provision VM, set up DNS, deploy app |
| `noxel destroy <name>` | Tear down a deployment |
| `noxel destroy --all` | Tear down all deployments |
| `noxel list` | Show all active deployments |
| `noxel templates` | List available app templates |
| `noxel domain add <domain> --app <name>` | Show CNAME instructions for custom domain |
| `noxel domain verify <domain>` | Check CNAME and configure SSL |

## Local Storage

### ~/.noxel/credentials.json (0600)

```json
{
  "noxel_api_key": "nxl_abc123...",
  "digitalocean": {
    "access_token": "dop_v1_abc...",
    "refresh_token": "dop_v1_def...",
    "expires_at": "2026-03-11T10:00:00Z",
    "email": "user@example.com"
  }
}
```

### ~/.noxel/deployments.json

```json
{
  "uptime-kuma-a7x": {
    "app": "uptime-kuma",
    "subdomain": "uptime-kuma-a7x",
    "domain": "uptime-kuma-a7x.noxel.sh",
    "droplet_id": 12345678,
    "ip": "203.0.113.42",
    "region": "blr1",
    "created_at": "2026-02-09T12:00:00Z",
    "custom_domain": null
  }
}
```

## API Server

### Tech stack

| Component | Choice | Why |
|-----------|--------|-----|
| Runtime | Node.js + TypeScript | Same as CLI, shared knowledge |
| Framework | Hono | Lightweight, fast, you already planned for it in the roadmap |
| Database | SQLite (via better-sqlite3) | Zero ops, single file, enough for MVP |
| Hosting | Single DigitalOcean droplet | Simple, cheap ($6/mo), can move later |

### Database schema (SQLite)

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,           -- nanoid
  email TEXT UNIQUE NOT NULL,
  api_key TEXT UNIQUE NOT NULL,  -- nxl_xxxxx
  do_account_id TEXT,            -- DigitalOcean account UUID
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

CREATE TABLE subdomains (
  subdomain TEXT PRIMARY KEY,     -- e.g. "uptime-kuma-a7x"
  user_id TEXT NOT NULL REFERENCES users(id),
  app TEXT NOT NULL,              -- e.g. "uptime-kuma"
  ip TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

That's it. Two tables for MVP.

## Project Structure

```
noxel/
├── api/                        ← Noxel API server (deployed)
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts            ← Hono server entry
│   │   ├── routes/
│   │   │   ├── auth.ts         ← POST /auth/digitalocean, /auth/digitalocean/refresh
│   │   │   ├── dns.ts          ← POST/PUT/DELETE /dns
│   │   │   └── templates.ts    ← GET /templates
│   │   ├── db.ts               ← SQLite setup + queries
│   │   ├── cloudflare.ts       ← Cloudflare DNS operations (moved from prototype)
│   │   └── middleware.ts       ← API key auth middleware
│   └── noxel.db                ← SQLite database file (gitignored)
│
├── cli/                        ← Noxel CLI (published to npm)
│   ├── package.json            ← name: "noxel", bin: { "noxel": "./dist/cli.js" }
│   ├── tsconfig.json
│   └── src/
│       ├── cli.ts              ← Entry point, command routing
│       ├── commands/
│       │   ├── login.ts        ← OAuth flow + API key retrieval
│       │   ├── logout.ts
│       │   ├── deploy.ts       ← VM provisioning + SSH setup
│       │   ├── destroy.ts
│       │   ├── list.ts
│       │   ├── status.ts
│       │   ├── templates.ts
│       │   └── domain.ts       ← Custom domain CNAME flow
│       ├── lib/
│       │   ├── api.ts          ← Noxel API client (dns, auth, templates)
│       │   ├── credentials.ts  ← Read/write ~/.noxel/
│       │   ├── digitalocean.ts ← DO API wrapper (from prototype)
│       │   ├── ssh.ts          ← SSH operations (from prototype)
│       │   └── template.ts     ← Template loading (from prototype)
│       └── templates/          ← Bundled app templates
│           ├── uptime-kuma/
│           └── n8n/
│
├── docs/
│   └── plans/
│
├── prototype/                  ← Original prototype (kept for reference)
│
└── README.md
```

## Subdomain Allocation

Format: `{app}-{random}` where random is 3 lowercase alphanumeric characters.

Examples:
- `uptime-kuma-a7x.noxel.sh`
- `n8n-b2k.noxel.sh`
- `uptime-kuma-m3p.noxel.sh` (same app, different deployment)

The API checks for collisions and regenerates if needed. 3 chars = 46,656 combinations per app name, plenty for MVP.

## Security Model

1. **Noxel API key** — generated server-side, stored locally, used to authenticate all API requests. If compromised, an attacker can only allocate subdomains under the user's account (low impact). Can be revoked by re-running `noxel login`.

2. **DO token** — never sent to Noxel API after initial OAuth exchange. The API sees it transiently during exchange but does not persist it. All DO API calls happen from the user's machine.

3. **Cloudflare token** — never leaves the API server. Only the API creates/modifies DNS records.

4. **DO client secret** — only on the API server. The CLI never sees it.

5. **SSH keys** — user's existing SSH key is used. Noxel never sees private keys.

## Custom Domains

Custom domains work without any API involvement:

1. User runs `noxel domain add blog.example.com --app uptime-kuma-a7x`
2. CLI prints: "Add CNAME record: `blog.example.com` → `uptime-kuma-a7x.noxel.sh`"
3. User adds the record at their DNS provider
4. User runs `noxel domain verify blog.example.com`
5. CLI does DNS lookup to confirm CNAME resolves
6. CLI SSHes into VM, updates Caddyfile to serve the custom domain
7. Caddy automatically provisions SSL for the custom domain via Let's Encrypt
8. CLI updates `~/.noxel/deployments.json` with the custom domain

No Noxel API changes needed. Caddy handles the hard part.

## Distribution

The CLI is published to npm:

```json
{
  "name": "noxel",
  "bin": {
    "noxel": "./dist/cli.js"
  }
}
```

Users install globally: `npm i -g noxel`

For non-Node users (future): distribute standalone binaries via GitHub releases using `pkg` or `bun build --compile`.

## Migration from Prototype

| Prototype file | Moves to | Changes |
|----------------|----------|---------|
| `prototype/digitalocean.ts` | `cli/src/lib/digitalocean.ts` | Token from credentials, not env var |
| `prototype/ssh.ts` | `cli/src/lib/ssh.ts` | No changes |
| `prototype/template.ts` | `cli/src/lib/template.ts` | No changes |
| `prototype/cloudflare.ts` | `api/src/cloudflare.ts` | Called by API routes, not CLI |
| `prototype/deploy.ts` | `cli/src/commands/deploy.ts` | Uses API for DNS instead of direct Cloudflare |
| `prototype/destroy.ts` | `cli/src/commands/destroy.ts` | Uses API for DNS cleanup |
| `prototype/auth/oauth.ts` | `cli/src/commands/login.ts` | Sends code to API instead of exchanging locally |
| `prototype/auth/credentials.ts` | `cli/src/lib/credentials.ts` | Adds noxel_api_key field |
| `prototype/auth/refresh.ts` | `cli/src/lib/credentials.ts` | Refresh goes through API |
| `prototype/templates/*` | `cli/src/templates/*` | No changes |

## Future: Webapp

When it's time to add the webapp for non-technical users, the API grows:

1. **Add orchestration endpoints**: `POST /deploy` triggers server-side deployment (SSH from API server to user's VM)
2. **Add job queue**: BullMQ for background deployment jobs
3. **Add WebSocket**: Stream deployment progress to the browser
4. **Add frontend**: Next.js dashboard on top of the same API

The API, database, DNS, auth — all reused. The webapp is an additive layer, not a rewrite.

## Out of Scope (MVP)

- Webapp / browser UI
- Server-side deployment orchestration
- Billing / Stripe
- Multi-cloud (Hetzner, AWS)
- Team accounts
- App updates / rollback
- Health monitoring
- Automated backups
- System keychain integration
