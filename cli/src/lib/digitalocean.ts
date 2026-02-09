const API_BASE = "https://api.digitalocean.com/v2";

async function doFetch(token: string, path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DigitalOcean API error: ${res.status} ${text}`);
  }

  return res.json();
}

export async function createDroplet(
  token: string,
  name: string,
  sshKeyFingerprint: string,
  region: string
) {
  const data = await doFetch(token, "/droplets", {
    method: "POST",
    body: JSON.stringify({
      name,
      region,
      size: "s-1vcpu-1gb",
      image: "ubuntu-24-04-x64",
      ssh_keys: [sshKeyFingerprint],
      tags: ["noxel"],
    }),
  });

  return data.droplet as { id: number; name: string; status: string };
}

export async function getDroplet(token: string, id: number) {
  const data = await doFetch(token, `/droplets/${id}`);
  return data.droplet as {
    id: number;
    name: string;
    status: string;
    networks: { v4: Array<{ ip_address: string; type: string }> };
  };
}

export async function waitForDroplet(token: string, id: number): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const droplet = await getDroplet(token, id);
    if (droplet.status === "active") {
      const pub = droplet.networks.v4.find((n) => n.type === "public");
      if (pub) return pub.ip_address;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Timeout waiting for droplet to become active");
}

export async function deleteDroplet(token: string, id: number): Promise<void> {
  await fetch(`${API_BASE}/droplets/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function listSSHKeys(token: string) {
  const data = await doFetch(token, "/account/keys");
  return data.ssh_keys as Array<{
    id: number;
    fingerprint: string;
    name: string;
    public_key: string;
  }>;
}

export async function addSSHKey(token: string, name: string, publicKey: string) {
  const data = await doFetch(token, "/account/keys", {
    method: "POST",
    body: JSON.stringify({ name, public_key: publicKey }),
  });
  return data.ssh_key as { id: number; fingerprint: string; name: string };
}

// Available DigitalOcean regions for the CLI region picker
export const REGIONS = [
  { value: "blr1", label: "Bangalore" },
  { value: "sfo3", label: "San Francisco" },
  { value: "ams3", label: "Amsterdam" },
  { value: "fra1", label: "Frankfurt" },
  { value: "lon1", label: "London" },
  { value: "nyc3", label: "New York" },
  { value: "sgp1", label: "Singapore" },
  { value: "syd1", label: "Sydney" },
  { value: "tor1", label: "Toronto" },
];
