import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import Database from "better-sqlite3";
import { createDb, createUser, getSubdomain } from "../db.js";
import { createDnsRoutes } from "./dns.js";
import { authMiddleware } from "../middleware.js";

// Mock cloudflare module
vi.mock("../cloudflare.js", () => ({
  createDNSRecord: vi.fn().mockResolvedValue(undefined),
  deleteDNSRecord: vi.fn().mockResolvedValue(undefined),
}));

describe("DNS routes", () => {
  let db: Database.Database;
  let app: Hono;
  let apiKey: string;

  beforeEach(() => {
    db = createDb(":memory:");
    const user = createUser(db, { email: "test@example.com", doAccountId: "do-123" });
    apiKey = user.api_key;

    app = new Hono();
    app.use("/dns/*", authMiddleware(db));
    app.route("/dns", createDnsRoutes(db, "noxel.sh"));
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
    const body = await res.json();
    expect(body.subdomain).toMatch(/^uptime-kuma-[a-z0-9]{3}$/);
    expect(body.domain).toMatch(/^uptime-kuma-[a-z0-9]{3}\.noxel\.sh$/);
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
    const { subdomain } = await postRes.json();

    // Then delete it
    const delRes = await app.request(`/dns/${subdomain}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(delRes.status).toBe(200);
    expect(getSubdomain(db, subdomain)).toBeNull();
  });

  it("DELETE /dns/:subdomain returns 404 for unknown subdomain", async () => {
    const res = await app.request("/dns/nonexistent-xyz", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(res.status).toBe(404);
  });
});
