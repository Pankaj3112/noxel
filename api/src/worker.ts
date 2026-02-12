import { Hono } from "hono";
import { authMiddleware } from "./middleware.js";
import { authRoutes } from "./routes/auth.js";
import { dnsRoutes } from "./routes/dns.js";
import { templateRoutes } from "./routes/templates.js";
import { rateLimit } from "./rate-limit.js";

export type Bindings = {
  DB: D1Database;
  DOMAIN: string;
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ZONE_ID: string;
  DO_CLIENT_ID: string;
  DO_CLIENT_SECRET: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Health check (no auth)
app.get("/health", (c) => c.json({ status: "ok" }));

// Templates route (no auth required — public catalog)
app.route("/templates", templateRoutes);

// Auth routes (no auth required — this IS the auth endpoint)
// Rate limit: 10 requests per minute per IP
app.use("/auth/*", rateLimit(10, 60_000));
app.route("/auth", authRoutes);

// DNS routes (auth required)
// Rate limit: 30 requests per minute per IP
app.use("/dns/*", rateLimit(30, 60_000));
app.use("/dns/*", authMiddleware);
app.route("/dns", dnsRoutes);

export default app;
