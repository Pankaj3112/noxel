import { Hono } from "hono";
import { cors } from "hono/cors";
import { initCloudflare } from "./cloudflare.js";
import { authMiddleware } from "./middleware.js";
import { authRoutes } from "./routes/auth.js";
import { dnsRoutes } from "./routes/dns.js";
import { templateRoutes } from "./routes/templates.js";

export type Bindings = {
  DB: D1Database;
  DOMAIN: string;
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ZONE_ID: string;
  DO_CLIENT_ID: string;
  DO_CLIENT_SECRET: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("/*", cors());

// Initialize Cloudflare config per-request from env
app.use("/*", async (c, next) => {
  initCloudflare({
    apiToken: c.env.CLOUDFLARE_API_TOKEN,
    zoneId: c.env.CLOUDFLARE_ZONE_ID,
    domain: c.env.DOMAIN,
  });
  await next();
});

// Health check (no auth)
app.get("/health", (c) => c.json({ status: "ok" }));

// Templates route (no auth required — public catalog)
app.route("/templates", templateRoutes);

// Auth routes (no auth required — this IS the auth endpoint)
app.route("/auth", authRoutes);

// DNS routes (auth required)
app.use("/dns/*", authMiddleware);
app.route("/dns", dnsRoutes);

export default app;
