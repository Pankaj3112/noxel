# Noxel

Deploy open-source apps in minutes. One command, full server with SSL.

## Quick Start

```bash
npm i -g noxel
noxel login
noxel deploy
```

## What is this?

A CLI-first deployment platform for open-source tools. Connect your DigitalOcean account, pick a template, and get a live app with HTTPS in ~2 minutes.

**Target users:** Developers, solopreneurs, and AI enthusiasts who want to self-host tools without the DevOps hassle.

## Architecture

```
┌──────────────────┐       ┌──────────────────┐
│     CLI (npm)     │──────▶│   API Server     │
│  noxel deploy     │       │  Hono + SQLite   │
│  noxel destroy    │       │                  │
│  noxel list       │       │  - OAuth exchange│
│  noxel domain     │       │  - DNS management│
└──────┬───────────┘       │  - Templates     │
       │                    └──────────────────┘
       │                           │
       ▼                           ▼
┌──────────────┐          ┌──────────────┐
│ DigitalOcean │          │  Cloudflare  │
│  (droplets)  │          │   (DNS)      │
└──────────────┘          └──────────────┘
```

- **`cli/`** — Commander + Clack CLI, published to npm as `noxel`
- **`api/`** — Hono + SQLite server that holds secrets (Cloudflare token, DO client secret)
- **`prototype/`** — Original proof-of-concept (archived)

## CLI Commands

| Command | Description |
|---------|-------------|
| `noxel login` | Connect your DigitalOcean account via OAuth |
| `noxel deploy [app]` | Deploy an app (interactive template + region picker) |
| `noxel destroy [name]` | Tear down a deployment |
| `noxel list` | Show active deployments |
| `noxel status` | Show connection status |
| `noxel templates` | List available app templates |
| `noxel domain add` | Add a custom domain |
| `noxel domain verify` | Verify CNAME and provision SSL |
| `noxel logout` | Remove stored credentials |

## Development

```bash
# Install all dependencies (monorepo workspaces)
npm install

# Run API in dev mode
cd api && npm run dev

# Run CLI in dev mode
cd cli && npx tsx src/cli.ts --help

# Run tests
cd api && npm test
```

**API setup:** Copy `api/.env.example` to `api/.env` and fill in your Cloudflare + DigitalOcean credentials. See `docs/setup-env.md` for details.

## Template System

Adding a new app = 2 files:

```
cli/src/templates/
└── app-name/
    ├── template.yaml
    └── docker-compose.yml
```

**template.yaml:**
```yaml
name: App Name
description: What it does
source: https://github.com/org/repo
port: 3000

env_vars:
  - key: API_KEY
    label: Your API Key
    required: true
    secret: true

resources:
  min_ram: 512MB
  min_cpu: 0.5
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| CLI | Commander + @clack/prompts + ssh2 |
| API | Hono + better-sqlite3 + nanoid |
| VM provisioning | DigitalOcean API |
| DNS | Cloudflare API |
| Reverse proxy | Caddy (on each user VM) |
| SSL | Caddy (automatic Let's Encrypt) |

## Design Docs

- [MVP Design](docs/plans/2026-02-09-noxel-mvp-design.md)
- [MVP Implementation Plan](docs/plans/2026-02-09-noxel-mvp-impl.md)

## Competition

| Product | Why we're different |
|---------|---------------------|
| PikaPods | Only 60 apps, slow to add, no AI focus |
| Coolify | Requires own VPS + install, developer-focused |
| Railway | Developer UX, confusing for non-tech |

**Our edge:** Speed. When a tool trends, we have a template same-day.
