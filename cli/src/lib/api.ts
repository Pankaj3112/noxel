import { NOXEL_API_URL } from "./config.js";

async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${NOXEL_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `API error: ${res.status}`);
  }

  return res.json();
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` };
}

// --- Auth ---

export async function exchangeAuthCode(
  code: string,
  redirectUri: string
): Promise<{
  do_access_token: string;
  do_refresh_token: string;
  do_expires_at: string;
  email: string;
  noxel_api_key: string;
}> {
  return apiFetch("/auth/digitalocean", {
    method: "POST",
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });
}

export async function refreshDoToken(
  refreshToken: string
): Promise<{
  do_access_token: string;
  do_refresh_token: string;
  do_expires_at: string;
}> {
  return apiFetch("/auth/digitalocean/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

// --- DNS ---

export async function allocateDns(
  apiKey: string,
  app: string,
  ip: string
): Promise<{ subdomain: string; domain: string }> {
  return apiFetch("/dns", {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({ app, ip }),
  });
}

export async function deleteDns(apiKey: string, subdomain: string): Promise<void> {
  await apiFetch(`/dns/${subdomain}`, {
    method: "DELETE",
    headers: authHeaders(apiKey),
  });
}

// --- Templates ---

export interface RemoteTemplate {
  slug: string;
  name: string;
  description: string;
  source: string;
  port: number;
  min_ram: string;
  env_vars: Array<{ key: string; label: string; required: boolean; secret: boolean }>;
}

export async function getTemplates(): Promise<RemoteTemplate[]> {
  const data = await apiFetch("/templates");
  return data.templates;
}
