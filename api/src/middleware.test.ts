import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import Database from "better-sqlite3";
import { createDb, createUser } from "./db.js";
import { authMiddleware } from "./middleware.js";

describe("auth middleware", () => {
  let db: Database.Database;
  let app: Hono;

  beforeEach(() => {
    db = createDb(":memory:");
    app = new Hono();
    app.use("/*", authMiddleware(db));
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
    const user = createUser(db, { email: "test@example.com", doAccountId: "do-123" });
    const res = await app.request("/test", {
      headers: { Authorization: `Bearer ${user.api_key}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe(user.id);
  });
});
