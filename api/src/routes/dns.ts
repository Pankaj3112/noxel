import { Hono } from "hono";
import { createSubdomain, getSubdomain, deleteSubdomain, updateSubdomainIp } from "../db.js";
import { generateSubdomain } from "../subdomain.js";
import { createDNSRecord, deleteDNSRecord } from "../cloudflare.js";
import type { Bindings } from "../worker.js";

const MAX_RETRIES = 5;

export const dnsRoutes = new Hono<{ Bindings: Bindings }>();

// POST /dns — allocate subdomain and create DNS record
dnsRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const domain = c.env.DOMAIN;
  const body = await c.req.json<{ app: string; ip: string }>();

  if (!body.app || !body.ip) {
    return c.json({ error: "Missing app or ip" }, 400);
  }

  // Generate unique subdomain with retry on collision
  let subdomain: string = "";
  for (let i = 0; i < MAX_RETRIES; i++) {
    subdomain = generateSubdomain(body.app);
    if (!(await getSubdomain(db, subdomain))) break;
    if (i === MAX_RETRIES - 1) {
      return c.json({ error: "Failed to generate unique subdomain" }, 500);
    }
  }

  // Create Cloudflare DNS record
  await createDNSRecord(subdomain, body.ip);

  // Store in database
  await createSubdomain(db, {
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
dnsRoutes.put("/:subdomain", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const domain = c.env.DOMAIN;
  const subdomain = c.req.param("subdomain");
  const body = await c.req.json<{ ip: string }>();

  if (!body.ip) {
    return c.json({ error: "Missing ip" }, 400);
  }

  const existing = await getSubdomain(db, subdomain);
  if (!existing) {
    return c.json({ error: "Subdomain not found" }, 404);
  }

  if (existing.user_id !== userId) {
    return c.json({ error: "Not authorized" }, 403);
  }

  await createDNSRecord(subdomain, body.ip);
  await updateSubdomainIp(db, subdomain, userId, body.ip);

  return c.json({ subdomain, domain: `${subdomain}.${domain}`, ip: body.ip });
});

// DELETE /dns/:subdomain — remove DNS record
dnsRoutes.delete("/:subdomain", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const subdomain = c.req.param("subdomain");

  const existing = await getSubdomain(db, subdomain);
  if (!existing) {
    return c.json({ error: "Subdomain not found" }, 404);
  }

  if (existing.user_id !== userId) {
    return c.json({ error: "Not authorized" }, 403);
  }

  await deleteDNSRecord(subdomain);
  await deleteSubdomain(db, subdomain, userId);

  return c.json({ deleted: subdomain });
});
