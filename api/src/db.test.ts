import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./test-utils.js";
import { createUser, getUserByApiKey, getUserByEmail, createSubdomain, getSubdomain, getSubdomainsByUser, deleteSubdomain, updateSubdomainIp } from "./db.js";

describe("database", () => {
  let db: D1Database;

  beforeEach(() => {
    db = createTestDb();
  });

  describe("users", () => {
    it("creates and retrieves a user by api key", async () => {
      const user = await createUser(db, { email: "test@example.com", doAccountId: "do-123" });
      expect(user.email).toBe("test@example.com");
      expect(user.api_key).toMatch(/^nxl_/);

      const found = await getUserByApiKey(db, user.api_key);
      expect(found).not.toBeNull();
      expect(found!.email).toBe("test@example.com");
    });

    it("retrieves a user by email", async () => {
      await createUser(db, { email: "test@example.com", doAccountId: "do-123" });
      const found = await getUserByEmail(db, "test@example.com");
      expect(found).not.toBeNull();
      expect(found!.do_account_id).toBe("do-123");
    });

    it("returns null for unknown api key", async () => {
      expect(await getUserByApiKey(db, "nxl_nonexistent")).toBeNull();
    });
  });

  describe("subdomains", () => {
    it("creates and retrieves a subdomain", async () => {
      const user = await createUser(db, { email: "test@example.com", doAccountId: "do-123" });
      const sub = await createSubdomain(db, { subdomain: "uptime-kuma-a7x", userId: user.id, app: "uptime-kuma", ip: "1.2.3.4" });
      expect(sub.subdomain).toBe("uptime-kuma-a7x");

      const found = await getSubdomain(db, "uptime-kuma-a7x");
      expect(found).not.toBeNull();
      expect(found!.ip).toBe("1.2.3.4");
    });

    it("lists subdomains by user", async () => {
      const user = await createUser(db, { email: "test@example.com", doAccountId: "do-123" });
      await createSubdomain(db, { subdomain: "app-a1b", userId: user.id, app: "app", ip: "1.1.1.1" });
      await createSubdomain(db, { subdomain: "app-c2d", userId: user.id, app: "app", ip: "2.2.2.2" });

      const subs = await getSubdomainsByUser(db, user.id);
      expect(subs).toHaveLength(2);
    });

    it("deletes a subdomain", async () => {
      const user = await createUser(db, { email: "test@example.com", doAccountId: "do-123" });
      await createSubdomain(db, { subdomain: "app-x1y", userId: user.id, app: "app", ip: "1.1.1.1" });

      const deleted = await deleteSubdomain(db, "app-x1y", user.id);
      expect(deleted).toBe(true);
      expect(await getSubdomain(db, "app-x1y")).toBeNull();
    });

    it("prevents deleting another user's subdomain", async () => {
      const user1 = await createUser(db, { email: "a@test.com", doAccountId: "do-1" });
      const user2 = await createUser(db, { email: "b@test.com", doAccountId: "do-2" });
      await createSubdomain(db, { subdomain: "app-x1y", userId: user1.id, app: "app", ip: "1.1.1.1" });

      const deleted = await deleteSubdomain(db, "app-x1y", user2.id);
      expect(deleted).toBe(false);
    });

    it("updates subdomain IP", async () => {
      const user = await createUser(db, { email: "test@example.com", doAccountId: "do-123" });
      await createSubdomain(db, { subdomain: "app-a1b", userId: user.id, app: "app", ip: "1.1.1.1" });

      await updateSubdomainIp(db, "app-a1b", user.id, "9.9.9.9");
      const found = await getSubdomain(db, "app-a1b");
      expect(found!.ip).toBe("9.9.9.9");
    });
  });
});
