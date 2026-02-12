const API_BASE = "https://api.cloudflare.com/client/v4";

export interface CloudflareConfig {
  apiToken: string;
  zoneId: string;
  domain: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cfFetch(config: CloudflareConfig, path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = (await res.json()) as { success: boolean; errors?: unknown[]; result: unknown[] };

  if (!data.success) {
    throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
  }

  return data;
}

export async function createDNSRecord(config: CloudflareConfig, subdomain: string, ip: string): Promise<void> {
  const fullDomain = `${subdomain}.${config.domain}`;

  // Check if record already exists
  const existing = await cfFetch(
    config,
    `/zones/${config.zoneId}/dns_records?type=A&name=${fullDomain}`
  );

  if (existing.result.length > 0) {
    // Update existing record
    const recordId = existing.result[0].id;
    await cfFetch(config, `/zones/${config.zoneId}/dns_records/${recordId}`, {
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
    await cfFetch(config, `/zones/${config.zoneId}/dns_records`, {
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

export async function deleteDNSRecord(config: CloudflareConfig, subdomain: string): Promise<void> {
  const fullDomain = `${subdomain}.${config.domain}`;

  const existing = await cfFetch(
    config,
    `/zones/${config.zoneId}/dns_records?type=A&name=${fullDomain}`
  );

  for (const record of existing.result) {
    await cfFetch(config, `/zones/${config.zoneId}/dns_records/${record.id}`, {
      method: "DELETE",
    });
  }
}
