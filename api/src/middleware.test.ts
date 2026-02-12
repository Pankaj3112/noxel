import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { createTestDb } from "./test-utils.js";
import { createUser } from "./db.js";
import { authMiddleware } from "./middleware.js";
import type { Bindings } from "./worker.js";

describe("auth middleware", () => {
  let db: D1Database;
  let app: Hono<{ Bindings: Bindings }>;

  beforeEach(() => {
    db = createTestDb();
    app = new Hono<{ Bindings: Bindings }>();

    // Inject test DB into env
    app.use("/*", async (c, next) => {
      c.env = { ...c.env, DB: db } as Bindings;
      await next();
    });

    app.use("/*", authMiddleware);
    app.get("/test", (c) => c.json({ userId: c.get("userId") }));
  });

  it("rejects request without Authorization header", async () => {
    const res = await app.request("/test");
    expect(res.status).toBe(401);
  });

  it("rejects request with invalid api key", async () => {
    const res = await app.request("/test", {
      headers: { Authorization: "Bearer nxl_invalid" },
    });
    expect(res.status).toBe(401);
  });

  it("allows request with valid api key and sets userId", async () => {
    const user = await createUser(db, { email: "test@example.com", doAccountId: "do-123" });
    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${user.api_key}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string };
    expect(body.userId).toBe(user.id);
  });
});
