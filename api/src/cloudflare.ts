const API_BASE = "https://api.cloudflare.com/client/v4";

export interface CloudflareConfig {
  apiToken: string;
  zoneId: string;
  domain: string;
}

let config: CloudflareConfig;

export function initCloudflare(cfg: CloudflareConfig): void {
  config = cfg;
}

function getConfig(): CloudflareConfig {
  if (!config) {
    throw new Error("Cloudflare not initialized. Call initCloudflare() first.");
  }
  return config;
}

async function cfFetch(path: string, options: RequestInit = {}) {
  const cfg = getConfig();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${cfg.apiToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await res.json();

  if (!data.success) {
    throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
  }

  return data;
}

export async function createDNSRecord(subdomain: string, ip: string): Promise<void> {
  const cfg = getConfig();
  const fullDomain = `${subdomain}.${cfg.domain}`;

  // Check if record already exists
  const existing = await cfFetch(
    `/zones/${cfg.zoneId}/dns_records?type=A&name=${fullDomain}`
  );

  if (existing.result.length > 0) {
    // Update existing record
    const recordId = existing.result[0].id;
    await cfFetch(`/zones/${cfg.zoneId}/dns_records/${recordId}`, {
      method: "PUT",
      body: JSON.stringify({
        type: "A",
        name: subdomain,
        content: ip,
        ttl: 60,
        proxied: false,
      }),
    });
  } else {
    // Create new record
    await cfFetch(`/zones/${cfg.zoneId}/dns_records`, {
      method: "POST",
      body: JSON.stringify({
        type: "A",
        name: subdomain,
        content: ip,
        ttl: 60,
        proxied: false,
      }),
    });
  }
}

export async function deleteDNSRecord(subdomain: string): Promise<void> {
  const cfg = getConfig();
  const fullDomain = `${subdomain}.${cfg.domain}`;

  const existing = await cfFetch(
    `/zones/${cfg.zoneId}/dns_records?type=A&name=${fullDomain}`
  );

  for (const record of existing.result) {
    await cfFetch(`/zones/${cfg.zoneId}/dns_records/${record.id}`, {
      method: "DELETE",
    });
  }
}
