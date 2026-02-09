import { getDigitalOceanToken } from "./auth/refresh.js";

const API_BASE = "https://api.digitalocean.com/v2";

async function doFetch(path: string, options: RequestInit = {}) {
  const token = await getDigitalOceanToken();
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

export async function createDroplet(name: string, sshKeyFingerprint: string) {
  const data = await doFetch("/droplets", {
    method: "POST",
    body: JSON.stringify({
      name,
      region: "blr1",
      size: "s-1vcpu-1gb",
      image: "ubuntu-24-04-x64",
      ssh_keys: [sshKeyFingerprint],
      tags: ["noxel-prototype"],
    }),
  });

  return data.droplet as {
    id: number;
    name: string;
    status: string;
  };
}

export async function getDroplet(id: number) {
  const data = await doFetch(`/droplets/${id}`);
  return data.droplet as {
    id: number;
    name: string;
    status: string;
    networks: {
      v4: Array<{ ip_address: string; type: string }>;
    };
  };
}

export async function waitForDroplet(id: number): Promise<string> {
  console.log("Waiting for droplet to be ready...");

  for (let i = 0; i < 60; i++) {
    const droplet = await getDroplet(id);

    if (droplet.status === "active") {
      const publicNetwork = droplet.networks.v4.find((n) => n.type === "public");
      if (publicNetwork) {
        return publicNetwork.ip_address;
      }
    }

    await new Promise((r) => setTimeout(r, 5000));
    process.stdout.write(".");
  }

  throw new Error("Timeout waiting for droplet");
}

export async function listSSHKeys() {
  const data = await doFetch("/account/keys");
  return data.ssh_keys as Array<{
    id: number;
    fingerprint: string;
    name: string;
    public_key: string;
  }>;
}

export async function addSSHKey(name: string, publicKey: string) {
  const data = await doFetch("/account/keys", {
    method: "POST",
    body: JSON.stringify({ name, public_key: publicKey }),
  });
  return data.ssh_key as {
    id: number;
    fingerprint: string;
    name: string;
  };
}

export async function deleteDroplet(id: number) {
  const token = await getDigitalOceanToken();
  await fetch(`${API_BASE}/droplets/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
