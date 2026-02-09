import type { MiddlewareHandler } from "hono";
import { getUserByApiKey } from "./db.js";
import type { Bindings } from "./worker.js";

// Extend Hono context to carry userId
declare module "hono" {
  interface ContextVariableMap {
    userId: string;
  }
}

export const authMiddleware: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const apiKey = authHeader.slice(7); // Remove "Bearer "
  const user = await getUserByApiKey(c.env.DB, apiKey);

  if (!user) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  c.set("userId", user.id);
  await next();
};
