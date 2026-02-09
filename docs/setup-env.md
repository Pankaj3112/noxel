# Environment Variables Setup

This guide explains how to get each required environment variable.

---

## Quick Setup: DigitalOcean (Recommended)

Connect your DigitalOcean account interactively:

```bash
npm run noxel -- connect digitalocean
```

This opens your browser, you authorize Noxel, and you're done. No need to copy API tokens.

Check your connection status:

```bash
npm run noxel -- status
```

---

## Manual Setup: DIGITALOCEAN_API_TOKEN (Alternative)

1. Go to [cloud.digitalocean.com](https://cloud.digitalocean.com)
2. Sign up or log in
3. Click **API** in the left sidebar (or go to https://cloud.digitalocean.com/account/api/tokens)
4. Click **Generate New Token**
5. Name it something like `noxel`
6. Set expiration (or "No expiry" for development)
7. Select **Full Access** (read + write)
8. Click **Generate Token**
9. Copy the token immediately — it's only shown once

```
DIGITALOCEAN_API_TOKEN=dop_v1_xxxxxxxxxxxxxxxxxxxxxxxx
```

### Add SSH Key to DigitalOcean

You also need an SSH key registered:

1. Go to **Settings** → **Security** → **SSH Keys**
2. Click **Add SSH Key**
3. Paste your public key (usually `~/.ssh/id_ed25519.pub` or `~/.ssh/id_rsa.pub`)
4. Name it (e.g., "My Mac")

To view your public key:
```bash
cat ~/.ssh/id_ed25519.pub
# or
cat ~/.ssh/id_rsa.pub
```

If you don't have one:
```bash
ssh-keygen -t ed25519 -C "your@email.com"
```

---

## CLOUDFLARE_API_TOKEN

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Sign up or log in
3. Click your profile icon (top right) → **My Profile**
4. Click **API Tokens** in the left sidebar
5. Click **Create Token**
6. Use template: **Edit zone DNS**
7. Configure permissions:
   - **Permissions:** Zone → DNS → Edit ✓
   - **Zone Resources:** Include → Specific zone → Select your domain
8. Click **Continue to summary** → **Create Token**
9. Copy the token immediately

```
CLOUDFLARE_API_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## CLOUDFLARE_ZONE_ID

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Click on your domain
3. On the **Overview** page, scroll down on the right sidebar
4. Find **Zone ID** under "API"
5. Click to copy

```
CLOUDFLARE_ZONE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## DOMAIN

Your domain name managed by Cloudflare.

```
DOMAIN=yourdomain.com
```

### Moving DNS to Cloudflare (if needed)

If your domain is registered elsewhere (GoDaddy, Namecheap, Vercel, etc.):

1. Add your domain in Cloudflare dashboard
2. Cloudflare will give you nameservers like:
   - `aria.ns.cloudflare.com`
   - `bob.ns.cloudflare.com`
3. Go to your registrar's DNS settings
4. Replace the nameservers with Cloudflare's
5. Wait for propagation (5 min to 24 hours)

---

## Final .env File

If using OAuth for DigitalOcean (recommended), you only need:

```bash
CLOUDFLARE_API_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
CLOUDFLARE_ZONE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
DOMAIN=yourdomain.com
```

If using manual API token instead:

```bash
DIGITALOCEAN_API_TOKEN=dop_v1_xxxxxxxxxxxxxxxxxxxx
CLOUDFLARE_API_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
CLOUDFLARE_ZONE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
DOMAIN=yourdomain.com
```

Save this as `.env` in the project root.

---

## Verify Setup

```bash
# Check all connections
npm run noxel -- status

# Should list available templates
npm run deploy
```

If you see the template list, you're ready to deploy.
