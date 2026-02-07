import "dotenv/config";
import { deleteDNSRecord } from "./cloudflare.js";

const API_BASE = "https://api.digitalocean.com/v2";

function getToken(): string {
  const token = process.env.DIGITALOCEAN_API_TOKEN;
  if (!token || token === "your_token_here") {
    throw new Error("DIGITALOCEAN_API_TOKEN not set in .env");
  }
  return token;
}

async function listDroplets() {
  const res = await fetch(`${API_BASE}/droplets?tag_name=noxel-prototype`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const data = await res.json();
  return data.droplets as Array<{
    id: number;
    name: string;
    networks: { v4: Array<{ ip_address: string; type: string }> };
  }>;
}

async function deleteDroplet(id: number, name: string) {
  const res = await fetch(`${API_BASE}/droplets/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${getToken()}` },
  });

  if (res.ok || res.status === 204) {
    console.log(`  Deleted droplet: ${name} (${id})`);
  } else {
    console.log(`  Failed to delete: ${name} - ${res.status}`);
  }
}

async function main() {
  console.log("🗑️  Noxel Cleanup\n");

  const droplets = await listDroplets();

  if (droplets.length === 0) {
    console.log("No noxel-prototype droplets found.");
    return;
  }

  console.log(`Found ${droplets.length} droplet(s):\n`);

  for (const droplet of droplets) {
    const ip = droplet.networks.v4.find((n) => n.type === "public")?.ip_address;
    console.log(`• ${droplet.name} (${ip})`);
  }

  console.log("\nDestroying...\n");

  for (const droplet of droplets) {
    // Delete droplet
    await deleteDroplet(droplet.id, droplet.name);

    // Try to clean up DNS (extract app name from droplet name)
    const appName = droplet.name.split("-")[0]; // "kuma-123456" → "kuma"
    try {
      await deleteDNSRecord(appName);
    } catch {
      // DNS record might not exist, ignore
    }
  }

  console.log("\n✅ Cleanup complete!");
}

main().catch((err) => {
  console.error("❌ Cleanup failed:", err.message);
  process.exit(1);
});
