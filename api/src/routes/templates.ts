import { Hono } from "hono";

// Hardcoded for MVP. Later this comes from a database or template registry.
const TEMPLATES = [
  {
    slug: "uptime-kuma",
    name: "Uptime Kuma",
    description: "Self-hosted monitoring tool",
    source: "https://github.com/louislam/uptime-kuma",
    port: 3001,
    min_ram: "512MB",
    env_vars: [],
  },
  {
    slug: "n8n",
    name: "n8n",
    description: "Workflow automation tool",
    source: "https://github.com/n8n-io/n8n",
    port: 5678,
    min_ram: "1GB",
    env_vars: [
      { key: "N8N_BASIC_AUTH_USER", label: "Admin username", required: true, secret: false },
      { key: "N8N_BASIC_AUTH_PASSWORD", label: "Admin password", required: true, secret: true },
    ],
  },
];

export function createTemplateRoutes(): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    return c.json({ templates: TEMPLATES });
  });

  return app;
}
