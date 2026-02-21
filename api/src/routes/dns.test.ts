import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { createTestDb } from "../test-utils.js";
import { createUser, getSubdomain } from "../db.js";
import { dnsRoutes } from "./dns.js";
import { authMiddleware } from "../middleware.js";
import type { Bindings } from "../worker.js";

// Mock cloudflare module
vi.mock("../cloudflare.js", () => ({
  createDNSRecord: vi.fn().mockResolvedValue(undefined),
  deleteDNSRecord: vi.fn().mockResolvedValue(undefined),
}));

describe("DNS routes", () => {
  let db: D1Database;
  let app: Hono<{ Bindings: Bindings }>;
  let apiKey: string;

  beforeEach(async () => {
    db = createTestDb();
    const user = await createUser(db, { email: "test@example.com", doAccountId: "do-123" });
    apiKey = user.api_key;

    app = new Hono<{ Bindings: Bindings }>();

    // Inject test env bindings
    app.use("/*", async (c, next) => {
      c.env = {
        ...c.env,
        DB: db,
        DOMAIN: "noxel.sh",
        CLOUDFLARE_API_TOKEN: "test-token",
        CLOUDFLARE_ZONE_ID: "test-zone",
      } as Bindings;
      await next();
    });

    app.use("/dns/*", authMiddleware);
    app.route("/dns", dnsRoutes);
  });

  it("POST /dns allocates a subdomain", async () => {
    const res = await app.request("/dns", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ app: "uptime-kuma", ip: "1.2.3.4" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { subdomain: string; domain: string };
    expect(body.subdomain).toMatch(/^uptime-kuma-[a-z0-9]{6}$/);
    expect(body.domain).toMatch(/^uptime-kuma-[a-z0-9]{6}\.noxel\.sh$/);
  });

  it("POST /dns rejects missing fields", async () => {
    const res = await app.request("/dns", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ app: "test" }), // missing ip
    });

    expect(res.status).toBe(400);
  });

  it("POST /dns rejects private IP addresses", async () => {
    const res = await app.request("/dns", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ app: "test-app", ip: "192.168.1.1" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid IP address");
  });

  it("POST /dns rejects invalid IP addresses", async () => {
    const res = await app.request("/dns", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ app: "test-app", ip: "not-an-ip" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid IP address");
  });

  it("DELETE /dns/:subdomain removes a subdomain", async () => {
    // First create one
    const postRes = await app.request("/dns", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ app: "test-app", ip: "1.2.3.4" }),
    });
    const { subdomain } = (await postRes.json()) as { subdomain: string };

    // Then delete it
    const delRes = await app.request(`/dns/${subdomain}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(delRes.status).toBe(200);
    expect(await getSubdomain(db, subdomain)).toBeNull();
  });

  it("DELETE /dns/:subdomain returns 404 for unknown subdomain", async () => {
    const res = await app.request("/dns/nonexistent-xyzabc", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(res.status).toBe(404);
  });
});
