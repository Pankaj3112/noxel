import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDb } from "./db.js";
import { initCloudflare } from "./cloudflare.js";
import { authMiddleware } from "./middleware.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createDnsRoutes } from "./routes/dns.js";
import { createTemplateRoutes } from "./routes/templates.js";

// Load env vars
const PORT = parseInt(process.env.PORT || "3000", 10);
const DOMAIN = process.env.DOMAIN;
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const DO_CLIENT_ID = process.env.DO_CLIENT_ID;
const DO_CLIENT_SECRET = process.env.DO_CLIENT_SECRET;

// Validate required env vars
const missing = [
  !DOMAIN && "DOMAIN",
  !CF_TOKEN && "CLOUDFLARE_API_TOKEN",
  !CF_ZONE_ID && "CLOUDFLARE_ZONE_ID",
  !DO_CLIENT_ID && "DO_CLIENT_ID",
  !DO_CLIENT_SECRET && "DO_CLIENT_SECRET",
].filter(Boolean);

if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
  console.error("See api/.env.example for reference.");
  process.exit(1);
}

// Initialize
const db = createDb("./noxel.db");
initCloudflare({
  apiToken: CF_TOKEN!,
  zoneId: CF_ZONE_ID!,
  domain: DOMAIN!,
});

// Build app
const app = new Hono();

app.use("/*", cors());

// Health check (no auth)
app.get("/health", (c) => c.json({ status: "ok" }));

// Auth routes (no auth required — this IS the auth endpoint)
app.route("/auth", createAuthRoutes(db, {
  doClientId: DO_CLIENT_ID!,
  doClientSecret: DO_CLIENT_SECRET!,
}));

// Templates route (no auth required — public catalog)
app.route("/templates", createTemplateRoutes());

// DNS routes (auth required)
app.use("/dns/*", authMiddleware(db));
app.route("/dns", createDnsRoutes(db, DOMAIN!));

// Start server
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Noxel API running on http://localhost:${PORT}`);
  console.log(`Domain: ${DOMAIN}`);
});
