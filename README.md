# Noxel

One-click deployment platform for open-source AI tools. Deploy trending tools without touching a terminal.

## What is this?

A managed platform that lets non-technical users deploy open-source AI tools safely. We handle security, SSL, auth, updates, and backups.

**Target users:** Marketers, solopreneurs, AI enthusiasts who want to self-host tools but don't understand Docker/DevOps.

**Revenue model:** SaaS platform fee ($10-15/mo), not compute. Users either get a server from us or bring their own cloud.

## Prototype (Working)

The `prototype/` folder contains a validated proof-of-concept:

```bash
# Deploy an app
npm run deploy -- uptime-kuma
npm run deploy -- n8n

# Destroy all deployments
npm run destroy
```

**What it does:**
- Provisions a DigitalOcean VM via API
- Creates DNS record via Cloudflare API
- SSHs in, installs Docker + Caddy
- Deploys the app with auto-SSL
- ~2 minutes from command to live app

**Validated:**
- [x] VM provisioning via API
- [x] Automated DNS
- [x] Auto SSL via Caddy
- [x] Template-based deployments
- [x] Environment variable collection

---

## Roadmap

### Phase 1: Core Platform
- [ ] **API server** (Hono + TypeScript)
  - [ ] User authentication (Better Auth or Clerk)
  - [ ] CRUD for deployments
  - [ ] WebSocket for deploy logs streaming
  - [ ] Encrypted secrets storage (AES-256)
- [ ] **Database schema** (PostgreSQL via Neon)
  - [ ] Users, deployments, templates, servers
- [ ] **Job queue** (BullMQ + Redis)
  - [ ] Deploy jobs
  - [ ] Destroy jobs
  - [ ] Health check jobs

### Phase 2: Dashboard
- [ ] **Web UI** (Next.js + Tailwind)
  - [ ] Template catalog with categories
  - [ ] One-click deploy flow
  - [ ] Deployment status + logs
  - [ ] Environment variable editor
  - [ ] Server management

### Phase 3: Billing & Auth
- [ ] **Stripe integration**
  - [ ] Subscription plans
  - [ ] Usage tracking
  - [ ] Payment failure handling → suspend VMs
- [ ] **Auth layer for deployed apps**
  - [ ] Caddy basic auth injection
  - [ ] Optional: OAuth proxy

### Phase 4: BYOC (Bring Your Own Cloud)
- [ ] **DigitalOcean OAuth**
  - [ ] User connects their DO account
  - [ ] Deploy to their account, they pay compute
- [ ] **Hetzner OAuth**
- [ ] **Provider abstraction layer**

### Phase 5: Production Hardening
- [ ] **Wildcard SSL certificate** (avoid Let's Encrypt rate limits)
- [ ] **Firewall rules** (lock down to 80, 443, 22)
- [ ] **Automated backups** (tar volumes → Backblaze B2)
- [ ] **Health monitoring** (detect down apps)
- [ ] **Container resource limits** (prevent runaway containers)

### Phase 6: Custom Domains
- [ ] User adds CNAME pointing to our subdomain
- [ ] Caddy auto-detects and provisions SSL
- [ ] Dashboard shows DNS instructions

### Phase 7: Growth Features
- [ ] **Version updates** (Renovate for detection, user-triggered updates)
- [ ] **Rollback** (keep previous image, one-click restore)
- [ ] **Community templates** (user submissions with review)
- [ ] **Team accounts**

---

## Template System

Adding a new app = 2 files:

```
templates/
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

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js + Tailwind (Vercel) |
| API | Hono + TypeScript (Hetzner) |
| Database | PostgreSQL (Neon → self-hosted) |
| Cache/Queue | Redis + BullMQ (Upstash → self-hosted) |
| VM provisioning | DigitalOcean, Hetzner APIs |
| Reverse proxy | Caddy (on each user VM) |
| DNS | Cloudflare API |
| Backups | Backblaze B2 |
| Billing | Stripe |

---

## Local Development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Add your tokens to .env (see docs/setup-env.md for how to get them)

# Run prototype
npm run deploy -- uptime-kuma
```

**Required env vars:**
```
DIGITALOCEAN_API_TOKEN=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ZONE_ID=
DOMAIN=
```

---

## Competition

| Product | Why we're different |
|---------|---------------------|
| PikaPods | Only 60 apps, slow to add, no AI focus |
| Coolify | Requires own VPS + install, developer-focused |
| Railway | Developer UX, confusing for non-tech |

**Our edge:** Speed. When a tool trends, we have a template same-day.
