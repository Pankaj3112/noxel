import "dotenv/config";
import * as readline from "readline";
import { createDroplet, waitForDroplet, listSSHKeys, addSSHKey } from "./digitalocean.js";
import { createDNSRecord } from "./cloudflare.js";
import { getSSHPublicKey, waitForSSH, runCommands } from "./ssh.js";
import { loadTemplate, listTemplates, type Template, type EnvVar } from "./template.js";

const DOMAIN = process.env.DOMAIN || "makeupbyshivani.com";

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function collectEnvVars(envVars: EnvVar[]): Promise<Record<string, string>> {
  const values: Record<string, string> = {};

  for (const envVar of envVars) {
    const defaultHint = envVar.default ? ` (default: ${envVar.default})` : "";
    const requiredHint = envVar.required ? " *" : "";
    const answer = await prompt(`${envVar.label}${requiredHint}${defaultHint}: `);

    const value = answer.trim() || envVar.default || "";

    if (envVar.required && !value) {
      throw new Error(`${envVar.label} is required`);
    }

    if (value) {
      values[envVar.key] = value;
    }
  }

  return values;
}

async function ensureSSHKey(): Promise<string> {
  const publicKey = getSSHPublicKey();
  const keys = await listSSHKeys();

  const existing = keys.find((k) => k.public_key.trim() === publicKey);
  if (existing) {
    console.log(`Using existing SSH key: ${existing.name}`);
    return existing.fingerprint;
  }

  console.log("Registering SSH key with DigitalOcean...");
  const newKey = await addSSHKey("noxel-deploy", publicKey);
  console.log(`Registered SSH key: ${newKey.fingerprint}`);
  return newKey.fingerprint;
}

async function installDocker(ip: string) {
  console.log("\nInstalling Docker...");
  await runCommands(ip, [
    "apt-get update -qq",
    "apt-get install -y -qq ca-certificates curl gnupg",
    "install -m 0755 -d /etc/apt/keyrings",
    "curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes",
    "chmod a+r /etc/apt/keyrings/docker.gpg",
    `echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list`,
    "apt-get update -qq",
    "apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin",
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

async function deployApp(
  ip: string,
  template: Template,
  subdomain: string,
  envVars: Record<string, string>
) {
  const appDir = `/opt/${subdomain}`;
  const fullDomain = `${subdomain}.${DOMAIN}`;

  console.log(`\nDeploying ${template.name}...`);

  // Create env file content if there are env vars
  let envFileCommands: string[] = [];
  if (Object.keys(envVars).length > 0) {
    const envContent = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    envFileCommands = [
      `cat > ${appDir}/.env << 'EOF'
${envContent}
EOF`,
    ];
  }

  await runCommands(ip, [
    `mkdir -p ${appDir}`,
    `cat > ${appDir}/docker-compose.yml << 'EOF'
${template.composeFile}
EOF`,
    ...envFileCommands,
    `cd ${appDir} && docker compose up -d`,
  ]);

  // Configure Caddy
  const caddyfile = `
${fullDomain} {
    reverse_proxy localhost:${template.port}
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
  const appName = process.argv[2];

  if (!appName) {
    const available = listTemplates();
    console.log("Usage: npm run deploy -- <app-name>\n");
    console.log("Available templates:");
    available.forEach((t) => console.log(`  - ${t}`));
    process.exit(1);
  }

  const template = loadTemplate(appName);

  console.log(`🚀 Noxel - Deploying ${template.name}\n`);
  console.log(`   ${template.description}`);
  console.log(`   Source: ${template.source}\n`);

  // Collect env vars if needed
  let envVars: Record<string, string> = {};
  if (template.env_vars.length > 0) {
    console.log("Configuration required:\n");
    envVars = await collectEnvVars(template.env_vars);
    console.log("");
  }

  // Step 1: Ensure SSH key
  const sshFingerprint = await ensureSSHKey();

  // Step 2: Create droplet
  const subdomain = appName.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const dropletName = `${subdomain}-${Date.now()}`;
  console.log(`\nCreating droplet: ${dropletName}`);
  const droplet = await createDroplet(dropletName, sshFingerprint);
  console.log(`Droplet created: ID ${droplet.id}`);

  // Step 3: Wait for droplet
  const ip = await waitForDroplet(droplet.id);
  console.log(`\nDroplet ready: ${ip}`);

  // Step 4: Create DNS record
  await createDNSRecord(subdomain, ip);

  // Step 5: Wait for SSH
  await waitForSSH(ip);

  // Step 6: Install Docker
  await installDocker(ip);

  // Step 7: Install Caddy
  await installCaddy(ip);

  // Step 8: Deploy app
  await deployApp(ip, template, subdomain, envVars);

  // Done!
  const fullDomain = `${subdomain}.${DOMAIN}`;
  console.log("\n" + "=".repeat(50));
  console.log(`✅ ${template.name} deployed!`);
  console.log(`\n🌐 Live at: https://${fullDomain}`);
  console.log(`📍 Server IP: ${ip}`);
  console.log(`🔑 SSH: ssh root@${ip}`);
  console.log("=".repeat(50));
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:", err.message);
  process.exit(1);
});
