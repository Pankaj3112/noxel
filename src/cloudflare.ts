const API_BASE = "https://api.cloudflare.com/client/v4";

function getToken(): string {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    throw new Error("CLOUDFLARE_API_TOKEN not set in .env");
  }
  return token;
}

function getZoneId(): string {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!zoneId) {
    throw new Error("CLOUDFLARE_ZONE_ID not set in .env");
  }
  return zoneId;
}

function getDomain(): string {
  if (!process.env.DOMAIN) {
    throw new Error("DOMAIN not set in .env");
  }

  return process.env.DOMAIN;
}

async function cfFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getToken()}`,
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

export async function createDNSRecord(subdomain: string, ip: string) {
  const zoneId = getZoneId();
  const fullDomain = `${subdomain}.${getDomain()}`;

  // First check if record already exists
  const existing = await cfFetch(
    `/zones/${zoneId}/dns_records?type=A&name=${fullDomain}`,
  );

  if (existing.result.length > 0) {
    // Update existing record
    const recordId = existing.result[0].id;
    await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: "PUT",
      body: JSON.stringify({
        type: "A",
        name: subdomain,
        content: ip,
        ttl: 60, // 1 minute for fast updates during testing
        proxied: false, // Direct connection, not through Cloudflare proxy
      }),
    });
    console.log(`Updated DNS record: ${fullDomain} → ${ip}`);
  } else {
    // Create new record
    await cfFetch(`/zones/${zoneId}/dns_records`, {
      method: "POST",
      body: JSON.stringify({
        type: "A",
        name: subdomain,
        content: ip,
        ttl: 60,
        proxied: false,
      }),
    });
    console.log(`Created DNS record: ${fullDomain} → ${ip}`);
  }
}

export async function deleteDNSRecord(subdomain: string) {
  const zoneId = getZoneId();
  const fullDomain = `${subdomain}.${getDomain()}`;

  const existing = await cfFetch(
    `/zones/${zoneId}/dns_records?type=A&name=${fullDomain}`,
  );

  for (const record of existing.result) {
    await cfFetch(`/zones/${zoneId}/dns_records/${record.id}`, {
      method: "DELETE",
    });
    console.log(`Deleted DNS record: ${fullDomain}`);
  }
}
