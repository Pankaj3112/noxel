import { Hono } from "hono";
import type Database from "better-sqlite3";
import { createSubdomain, getSubdomain, deleteSubdomain, updateSubdomainIp, getSubdomainsByUser } from "../db.js";
import { generateSubdomain } from "../subdomain.js";
import { createDNSRecord, deleteDNSRecord } from "../cloudflare.js";

const MAX_RETRIES = 5;

export function createDnsRoutes(db: Database.Database, domain: string): Hono {
  const app = new Hono();

  // POST /dns — allocate subdomain and create DNS record
  app.post("/", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json<{ app: string; ip: string }>();

    if (!body.app || !body.ip) {
      return c.json({ error: "Missing app or ip" }, 400);
    }

    // Generate unique subdomain with retry on collision
    let subdomain: string = "";
    for (let i = 0; i < MAX_RETRIES; i++) {
      subdomain = generateSubdomain(body.app);
      if (!getSubdomain(db, subdomain)) break;
      if (i === MAX_RETRIES - 1) {
        return c.json({ error: "Failed to generate unique subdomain" }, 500);
      }
    }

    // Create Cloudflare DNS record
    await createDNSRecord(subdomain, body.ip);

    // Store in database
    createSubdomain(db, {
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
  app.put("/:subdomain", async (c) => {
    const userId = c.get("userId");
    const subdomain = c.req.param("subdomain");
    const body = await c.req.json<{ ip: string }>();

    if (!body.ip) {
      return c.json({ error: "Missing ip" }, 400);
    }

    const existing = getSubdomain(db, subdomain);
    if (!existing) {
      return c.json({ error: "Subdomain not found" }, 404);
    }

    if (existing.user_id !== userId) {
      return c.json({ error: "Not authorized" }, 403);
    }

    await createDNSRecord(subdomain, body.ip);
    updateSubdomainIp(db, subdomain, userId, body.ip);

    return c.json({ subdomain, domain: `${subdomain}.${domain}`, ip: body.ip });
  });

  // DELETE /dns/:subdomain — remove DNS record
  app.delete("/:subdomain", async (c) => {
    const userId = c.get("userId");
    const subdomain = c.req.param("subdomain");

    const existing = getSubdomain(db, subdomain);
    if (!existing) {
      return c.json({ error: "Subdomain not found" }, 404);
    }

    if (existing.user_id !== userId) {
      return c.json({ error: "Not authorized" }, 403);
    }

    await deleteDNSRecord(subdomain);
    deleteSubdomain(db, subdomain, userId);

    return c.json({ deleted: subdomain });
  });

  return app;
}
