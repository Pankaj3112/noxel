import { Hono } from "hono";
import { getSubdomain, deleteSubdomain, updateSubdomainIp } from "../db.js";
import { generateSubdomain, isValidSubdomain } from "../subdomain.js";
import { createDNSRecord, deleteDNSRecord, type CloudflareConfig } from "../cloudflare.js";
import type { Bindings } from "../worker.js";

const MAX_RETRIES = 5;

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isValidPublicIp(ip: string): boolean {
  const match = ip.match(IPV4_REGEX);
  if (!match) return false;

  const octets = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3]), parseInt(match[4])];
  if (octets.some((o) => o > 255)) return false;

  // Block private and reserved ranges
  if (octets[0] === 10) return false;                                          // 10.0.0.0/8
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return false;  // 172.16.0.0/12
  if (octets[0] === 192 && octets[1] === 168) return false;                   // 192.168.0.0/16
  if (octets[0] === 127) return false;                                         // 127.0.0.0/8
  if (octets[0] === 0) return false;                                           // 0.0.0.0/8
  if (octets[0] === 169 && octets[1] === 254) return false;                   // 169.254.0.0/16

  return true;
}

function getCfConfig(env: Bindings): CloudflareConfig {
  return {
    apiToken: env.CLOUDFLARE_API_TOKEN,
    zoneId: env.CLOUDFLARE_ZONE_ID,
    domain: env.DOMAIN,
  };
}

export const dnsRoutes = new Hono<{ Bindings: Bindings }>();

// POST /dns — allocate subdomain and create DNS record
dnsRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const domain = c.env.DOMAIN;
  const cfConfig = getCfConfig(c.env);
  const body = await c.req.json<{ app: string; ip: string }>();

  if (!body.app || !body.ip) {
    return c.json({ error: "Missing app or ip" }, 400);
  }

  if (!isValidPublicIp(body.ip)) {
    return c.json({ error: "Invalid IP address" }, 400);
  }

  // Generate unique subdomain with atomic insert to prevent TOCTOU races.
  // Insert into DB first, then create DNS. If DNS fails, roll back DB.
  let subdomain: string = "";
  let inserted = false;
  const now = new Date().toISOString();

  for (let i = 0; i < MAX_RETRIES; i++) {
    subdomain = generateSubdomain(body.app);
    const result = await db
      .prepare(
        `INSERT INTO subdomains (subdomain, user_id, app, ip, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(subdomain) DO NOTHING`
      )
      .bind(subdomain, userId, body.app, body.ip, now)
      .run();

    if ((result.meta.changes ?? 0) > 0) {
      inserted = true;
      break;
    }
  }

  if (!inserted) {
    return c.json({ error: "Failed to generate unique subdomain" }, 500);
  }

  // Create Cloudflare DNS record; roll back DB on failure
  try {
    await createDNSRecord(cfConfig, subdomain, body.ip);
  } catch (err) {
    await deleteSubdomain(db, subdomain, userId);
    throw err;
  }

  return c.json({
    subdomain,
    domain: `${subdomain}.${domain}`,
  });
});

// PUT /dns/:subdomain — update IP
dnsRoutes.put("/:subdomain", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const domain = c.env.DOMAIN;
  const cfConfig = getCfConfig(c.env);
  const subdomain = c.req.param("subdomain");
  const body = await c.req.json<{ ip: string }>();

  if (!body.ip) {
    return c.json({ error: "Missing ip" }, 400);
  }

  if (!isValidPublicIp(body.ip)) {
    return c.json({ error: "Invalid IP address" }, 400);
  }

  if (!isValidSubdomain(subdomain)) {
    return c.json({ error: "Invalid subdomain" }, 400);
  }

  const existing = await getSubdomain(db, subdomain);
  if (!existing) {
    return c.json({ error: "Subdomain not found" }, 404);
  }

  if (existing.user_id !== userId) {
    return c.json({ error: "Not authorized" }, 403);
  }

  await createDNSRecord(cfConfig, subdomain, body.ip);
  await updateSubdomainIp(db, subdomain, userId, body.ip);

  return c.json({ subdomain, domain: `${subdomain}.${domain}`, ip: body.ip });
});

// DELETE /dns/:subdomain — remove DNS record
dnsRoutes.delete("/:subdomain", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const cfConfig = getCfConfig(c.env);
  const subdomain = c.req.param("subdomain");

  if (!isValidSubdomain(subdomain)) {
    return c.json({ error: "Invalid subdomain" }, 400);
  }

  const existing = await getSubdomain(db, subdomain);
  if (!existing) {
    return c.json({ error: "Subdomain not found" }, 404);
  }

  if (existing.user_id !== userId) {
    return c.json({ error: "Not authorized" }, 403);
  }

  await deleteDNSRecord(cfConfig, subdomain);
  await deleteSubdomain(db, subdomain, userId);

  return c.json({ deleted: subdomain });
});
