# DigitalOcean OAuth CLI Authentication

## Problem

Users must manually create a DigitalOcean API token, copy it, and paste it into a `.env` file. This is friction-heavy and error-prone for non-technical users (Noxel's target audience).

## Solution

Replace manual API token setup with an interactive OAuth flow: `noxel connect digitalocean`. The CLI opens the user's browser, they authorize Noxel, and the token is stored automatically.

## OAuth Flow

DigitalOcean supports the **Authorization Code Flow** (not device code). The CLI uses a **local redirect** approach:

1. User runs `noxel connect digitalocean`
2. CLI starts a temporary HTTP server on `localhost:19847`
3. CLI opens browser to DO's OAuth authorization URL with `client_id`, `redirect_uri=http://localhost:19847/callback`, `response_type=code`, `scope=read write`
4. User authorizes Noxel on DigitalOcean's page
5. DO redirects to `http://localhost:19847/callback?code=AUTH_CODE`
6. CLI exchanges the auth code for an access token + refresh token via `POST /v1/oauth/token`
7. CLI stores tokens in `~/.noxel/credentials.json`
8. CLI shuts down the local server and confirms connection

**Prerequisite**: Register Noxel as an OAuth application in the DigitalOcean dashboard to get `client_id` and `client_secret`.

## Token Storage

**Location**: `~/.noxel/credentials.json` with `0600` permissions (owner read/write only).

```json
{
  "digitalocean": {
    "access_token": "dop_v1_abc123...",
    "refresh_token": "dop_v1_def456...",
    "expires_at": "2026-03-11T10:00:00Z",
    "account_email": "user@example.com"
  }
}
```

- Tokens auto-refresh before API calls when expired
- Falls back to `DIGITALOCEAN_API_TOKEN` env var for backwards compatibility
- Cloudflare stays as env var for now

## CLI Commands

| Command | Description |
|---------|-------------|
| `noxel connect digitalocean` | Run OAuth flow, store token |
| `noxel disconnect digitalocean` | Remove stored credentials |
| `noxel status` | Show connected accounts |
| `noxel deploy <app>` | Deploy an app (existing functionality) |
| `noxel destroy` | Destroy deployed resources (existing functionality) |

## New Files

| File | Purpose |
|------|---------|
| `src/auth/oauth.ts` | OAuth flow: local HTTP server, browser open, token exchange |
| `src/auth/credentials.ts` | Read/write/refresh credentials from `~/.noxel/credentials.json` |
| `src/cli.ts` | CLI entry point with subcommand routing |

## Changes to Existing Code

`digitalocean.ts` `getToken()` becomes async and checks three sources in order:

1. Stored OAuth token from `~/.noxel/credentials.json` (auto-refresh if expired)
2. `DIGITALOCEAN_API_TOKEN` environment variable (backwards compatibility)
3. Throws error: "Not connected. Run: noxel connect digitalocean"

## Error Handling

| Scenario | Handling |
|----------|----------|
| User denies authorization | Show message, shut down server |
| Port 19847 in use | Show error suggesting to free the port |
| Browser doesn't open | Print URL to terminal as fallback |
| User never authorizes | 2-minute timeout |
| Token refresh fails | Clear credentials, prompt re-connect |
| Credentials file corrupted | Delete file, prompt re-connect |

## Client Secret

DO's Authorization Code flow requires `client_secret` on the token exchange. Since this is a CLI (public client), the secret is embedded in source code. This is standard practice (`doctl`, `gh` CLI do the same). The flow remains secure because tokens are scoped to the authorizing user.

## Out of Scope

- Cloudflare OAuth (stays as API token in `.env` for now)
- System keychain integration
- Multi-account support
