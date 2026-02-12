# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Noxel is a CLI-first deployment platform for open-source tools. Users run `noxel deploy`, pick a template, and get a live app with HTTPS on DigitalOcean in ~2 minutes. The API handles OAuth token exchange, DNS management (Cloudflare), and template metadata while the CLI handles provisioning, SSH setup, and Docker orchestration.

## Monorepo Structure

npm workspaces with two packages:
- **`api/`** — Hono web framework deployed on Cloudflare Workers with D1 (SQLite)
- **`cli/`** — Commander.js CLI published to npm as `noxel`

Root `package.json` is private with `"workspaces": ["api", "cli"]`.

## Common Commands

```bash
# Install all workspace dependencies
npm install

# API
cd api
npm run dev          # wrangler dev (Cloudflare local dev server)
npm run build        # tsc
npm test             # vitest run
npm run test:watch   # vitest (watch mode)

# CLI
cd cli
npm run dev -- deploy    # tsx src/cli.ts (run without building)
npm run build            # tsc && cp -r src/templates dist/
npm test                 # vitest run
npm run test:watch       # vitest (watch mode)
```

## Architecture

```
CLI (npm) ──► API (Hono + D1) ──► Cloudflare DNS
   │
   ▼
DigitalOcean (droplets via API, SSH for Docker setup + Caddy reverse proxy)
```

### API (`api/`)

Hono app exported from `src/worker.ts` for Cloudflare Workers. Env bindings typed as `Bindings` in that file (DB, DOMAIN, CLOUDFLARE_*, DO_*).

**Routes:**
- `GET /health` — no auth
- `GET /templates` — no auth, hardcoded template catalog
- `POST /auth/digitalocean`, `POST /auth/digitalocean/refresh` — no auth, OAuth exchange
- `POST|PUT|DELETE /dns/*` — requires Bearer token (`authMiddleware`)

**Database:** D1 with two tables (`users`, `subdomains`). Schema in `migrations/0001_init.sql`. DB functions in `src/db.ts`.

**Testing:** Vitest with `src/test-utils.ts` providing a D1-compatible wrapper around in-memory better-sqlite3. Test files are colocated as `*.test.ts`.

### CLI (`cli/`)

Entry point: `src/cli.ts`. Commands in `src/commands/`, shared libraries in `src/lib/`.

**Key flow (deploy):**
1. OAuth login → API exchanges code for DO tokens → stores in `~/.noxel/credentials.json`
2. Create DigitalOcean droplet via DO API
3. SSH into droplet: install Docker, write docker-compose.yml + .env, configure Caddy
4. API allocates subdomain (`POST /dns`) → Cloudflare A record

**Templates** live in `cli/src/templates/{app}/` with `template.yaml` + `docker-compose.yml`. The CLI build copies these to `dist/`.

**Credentials** stored at `~/.noxel/credentials.json` (mode 0o600) and `~/.noxel/deployments.json`.

## Configuration

- **TypeScript:** Root `tsconfig.json` with `strict: true`, `ES2022`, `ESNext` modules, `bundler` resolution. Each workspace extends it.
- **Cloudflare Worker:** `api/wrangler.toml` — D1 binding named `DB`, `nodejs_compat` flag.
- **API env vars:** See `api/.env.example` and `docs/setup-env.md` for Cloudflare/DO credentials.
- **CLI constants:** Hardcoded in `cli/src/lib/config.ts` (API URL, OAuth port 19847, DO client ID).

## Adding a New Template

1. Create `cli/src/templates/{app}/template.yaml` and `docker-compose.yml`
2. Add the template to the hardcoded list in `api/src/routes/templates.ts`
3. Rebuild CLI with `npm run build` (copies templates to `dist/`)
