import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { createDb, createUser, getUserByApiKey, getUserByEmail, createSubdomain, getSubdomain, getSubdomainsByUser, deleteSubdomain, updateSubdomainIp } from "./db.js";

describe("database", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDb(":memory:");
  });

  describe("users", () => {
    it("creates and retrieves a user by api key", () => {
      const user = createUser(db, { email: "test@example.com", doAccountId: "do-123" });
      expect(user.email).toBe("test@example.com");
      expect(user.api_key).toMatch(/^nxl_/);

      const found = getUserByApiKey(db, user.api_key);
      expect(found).not.toBeNull();
      expect(found!.email).toBe("test@example.com");
    });

    it("retrieves a user by email", () => {
      createUser(db, { email: "test@example.com", doAccountId: "do-123" });
      const found = getUserByEmail(db, "test@example.com");
      expect(found).not.toBeNull();
      expect(found!.do_account_id).toBe("do-123");
    });

    it("returns null for unknown api key", () => {
      expect(getUserByApiKey(db, "nxl_nonexistent")).toBeNull();
    });
  });

  describe("subdomains", () => {
    it("creates and retrieves a subdomain", () => {
      const user = createUser(db, { email: "test@example.com", doAccountId: "do-123" });
      const sub = createSubdomain(db, { subdomain: "uptime-kuma-a7x", userId: user.id, app: "uptime-kuma", ip: "1.2.3.4" });
      expect(sub.subdomain).toBe("uptime-kuma-a7x");

      const found = getSubdomain(db, "uptime-kuma-a7x");
      expect(found).not.toBeNull();
      expect(found!.ip).toBe("1.2.3.4");
    });

    it("lists subdomains by user", () => {
      const user = createUser(db, { email: "test@example.com", doAccountId: "do-123" });
      createSubdomain(db, { subdomain: "app-a1b", userId: user.id, app: "app", ip: "1.1.1.1" });
      createSubdomain(db, { subdomain: "app-c2d", userId: user.id, app: "app", ip: "2.2.2.2" });

      const subs = getSubdomainsByUser(db, user.id);
      expect(subs).toHaveLength(2);
    });

    it("deletes a subdomain", () => {
      const user = createUser(db, { email: "test@example.com", doAccountId: "do-123" });
      createSubdomain(db, { subdomain: "app-x1y", userId: user.id, app: "app", ip: "1.1.1.1" });

      const deleted = deleteSubdomain(db, "app-x1y", user.id);
      expect(deleted).toBe(true);
      expect(getSubdomain(db, "app-x1y")).toBeNull();
    });

    it("prevents deleting another user's subdomain", () => {
      const user1 = createUser(db, { email: "a@test.com", doAccountId: "do-1" });
      const user2 = createUser(db, { email: "b@test.com", doAccountId: "do-2" });
      createSubdomain(db, { subdomain: "app-x1y", userId: user1.id, app: "app", ip: "1.1.1.1" });

      const deleted = deleteSubdomain(db, "app-x1y", user2.id);
      expect(deleted).toBe(false);
    });

    it("updates subdomain IP", () => {
      const user = createUser(db, { email: "test@example.com", doAccountId: "do-123" });
      createSubdomain(db, { subdomain: "app-a1b", userId: user.id, app: "app", ip: "1.1.1.1" });

      updateSubdomainIp(db, "app-a1b", user.id, "9.9.9.9");
      const found = getSubdomain(db, "app-a1b");
      expect(found!.ip).toBe("9.9.9.9");
    });
  });
});
