import type { MiddlewareHandler } from "hono";
import type Database from "better-sqlite3";
import { getUserByApiKey } from "./db.js";

// Extend Hono context to carry userId
declare module "hono" {
  interface ContextVariableMap {
    userId: string;
  }
}

export function authMiddleware(db: Database.Database): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }

    const apiKey = authHeader.slice(7); // Remove "Bearer "
    const user = getUserByApiKey(db, apiKey);

    if (!user) {
      return c.json({ error: "Invalid API key" }, 401);
    }

    c.set("userId", user.id);
    await next();
  };
}
