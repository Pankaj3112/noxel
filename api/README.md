# @noxel/api

Noxel API server — handles OAuth exchange, DNS management, and template listing.

## Setup

```bash
# From the repo root
npm install

# Configure environment
cp .env.example .env
# Fill in your Cloudflare and DigitalOcean credentials

# Start dev server
npm run dev
```

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| POST | `/auth/digitalocean` | No | Exchange OAuth code for tokens |
| POST | `/auth/digitalocean/refresh` | No | Refresh expired DO token |
| GET | `/templates` | No | List available templates |
| POST | `/dns` | API key | Allocate subdomain + create DNS record |
| PUT | `/dns/:subdomain` | API key | Update subdomain IP |
| DELETE | `/dns/:subdomain` | API key | Delete subdomain + DNS record |

## Testing

```bash
npm test           # Run tests once
npm run test:watch # Watch mode
```
