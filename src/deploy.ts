import "dotenv/config";
import { createDroplet, waitForDroplet, listSSHKeys, addSSHKey } from "./digitalocean.js";
import { createDNSRecord } from "./cloudflare.js";
import { getSSHPublicKey, waitForSSH, runCommands } from "./ssh.js";

const DOMAIN = "makeupbyshivani.com";
const APP_NAME = "kuma"; // subdomain: kuma.makeupbyshivani.com

async function ensureSSHKey(): Promise<string> {
  const publicKey = getSSHPublicKey();
  const keys = await listSSHKeys();

  // Check if our key is already registered
  const existing = keys.find((k) => k.public_key.trim() === publicKey);
  if (existing) {
    console.log(`Using existing SSH key: ${existing.name}`);
    return existing.fingerprint;
  }

  // Register new key
  console.log("Registering SSH key with DigitalOcean...");
  const newKey = await addSSHKey("noxel-deploy", publicKey);
  console.log(`Registered SSH key: ${newKey.fingerprint}`);
  return newKey.fingerprint;
}

async function installDocker(ip: string) {
  console.log("\nInstalling Docker...");
  await runCommands(ip, [
    // Update and install prerequisites
    "apt-get update -qq",
    "apt-get install -y -qq ca-certificates curl gnupg",

    // Add Docker GPG key
    "install -m 0755 -d /etc/apt/keyrings",
    "curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes",
    "chmod a+r /etc/apt/keyrings/docker.gpg",

    // Add Docker repo
    `echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list`,

    // Install Docker
    "apt-get update -qq",
    "apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin",

    // Verify
    "docker --version",
  ]);
}

async function installCaddy(ip: string) {
  console.log("\nInstalling Caddy...");
  await runCommands(ip, [
    "apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https",
    "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg --yes",
    `curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list`,
    "apt-get update -qq",
    "apt-get install -y -qq caddy",
    "caddy version",
  ]);
}

async function deployUptimeKuma(ip: string, domain: string) {
  console.log("\nDeploying Uptime Kuma...");

  // Create docker-compose file
  const compose = `
services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: uptime-kuma
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - uptime-kuma-data:/app/data

volumes:
  uptime-kuma-data:
`;

  await runCommands(ip, [
    "mkdir -p /opt/uptime-kuma",
    `cat > /opt/uptime-kuma/docker-compose.yml << 'EOF'
${compose}
EOF`,
    "cd /opt/uptime-kuma && docker compose up -d",
  ]);

  // Configure Caddy for reverse proxy + SSL
  const caddyfile = `
${domain} {
    reverse_proxy localhost:3001
}
`;

  await runCommands(ip, [
    `cat > /etc/caddy/Caddyfile << 'EOF'
${caddyfile}
EOF`,
    "systemctl restart caddy",
  ]);
}

async function main() {
  console.log("🚀 Noxel Prototype - Deploying Uptime Kuma\n");

  // Step 1: Ensure SSH key is registered
  const sshFingerprint = await ensureSSHKey();

  // Step 2: Create droplet
  const dropletName = `${APP_NAME}-${Date.now()}`;
  console.log(`\nCreating droplet: ${dropletName}`);
  const droplet = await createDroplet(dropletName, sshFingerprint);
  console.log(`Droplet created: ID ${droplet.id}`);

  // Step 3: Wait for droplet and get IP
  const ip = await waitForDroplet(droplet.id);
  console.log(`\nDroplet ready: ${ip}`);

  // Step 4: Create DNS record
  const subdomain = `${APP_NAME}.${DOMAIN}`;
  await createDNSRecord(APP_NAME, ip);
  console.log(`DNS configured: ${subdomain} → ${ip}`);

  // Step 5: Wait for SSH
  await waitForSSH(ip);

  // Step 6: Install Docker
  await installDocker(ip);

  // Step 7: Install Caddy
  await installCaddy(ip);

  // Step 8: Deploy app
  await deployUptimeKuma(ip, subdomain);

  // Done!
  console.log("\n" + "=".repeat(50));
  console.log("✅ Deployment complete!");
  console.log(`\n🌐 Your app is live at: https://${subdomain}`);
  console.log(`📍 Server IP: ${ip}`);
  console.log(`🔑 SSH: ssh root@${ip}`);
  console.log("=".repeat(50));
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:", err.message);
  process.exit(1);
});
