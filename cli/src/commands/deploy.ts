import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  getCredentials,
  isTokenExpired,
  saveCredentials,
  saveDeployment,
} from "../lib/credentials.js";
import { refreshDoToken, allocateDns } from "../lib/api.js";
import {
  createDroplet,
  waitForDroplet,
  listSSHKeys,
  addSSHKey,
  REGIONS,
} from "../lib/digitalocean.js";
import { getSSHPublicKey, waitForSSH, runCommands } from "../lib/ssh.js";
import { loadTemplate, listTemplates, type Template } from "../lib/template.js";

export async function deployCommand(appName?: string): Promise<void> {
  p.intro("noxel deploy");

  // 1. Check auth
  const creds = getCredentials();
  if (!creds) {
    p.log.error("Not logged in. Run: noxel login");
    return;
  }

  // Refresh token if expired
  let doToken = creds.digitalocean.access_token;
  if (isTokenExpired(creds)) {
    try {
      const refreshed = await refreshDoToken(creds.digitalocean.refresh_token);
      doToken = refreshed.do_access_token;
      saveCredentials({
        ...creds,
        digitalocean: {
          ...creds.digitalocean,
          access_token: refreshed.do_access_token,
          refresh_token: refreshed.do_refresh_token,
          expires_at: refreshed.do_expires_at,
        },
      });
    } catch {
      p.log.error("Session expired. Run: noxel login");
      return;
    }
  }

  // 2. Select template
  let template: Template;
  if (appName) {
    try {
      template = loadTemplate(appName);
    } catch (err) {
      p.log.error((err as Error).message);
      return;
    }
  } else {
    const available = listTemplates();
    if (available.length === 0) {
      p.log.error("No templates available.");
      return;
    }

    const templates = available.map((slug) => {
      const t = loadTemplate(slug);
      return {
        value: slug,
        label: `${t.name} — ${t.description} (${t.resources.min_ram})`,
      };
    });

    const selected = await p.select({
      message: "Select an app to deploy",
      options: templates,
    });

    if (p.isCancel(selected)) {
      p.outro("Cancelled.");
      return;
    }

    template = loadTemplate(selected as string);
  }

  // 3. Select region
  const region = await p.select({
    message: "Server region?",
    options: REGIONS.map((r) => ({ value: r.value, label: `${r.label} (${r.value})` })),
  });

  if (p.isCancel(region)) {
    p.outro("Cancelled.");
    return;
  }

  // 4. Collect env vars
  const envVars: Record<string, string> = {};
  if (template.env_vars.length > 0) {
    p.log.info(`${template.name} requires some configuration:`);

    for (const envVar of template.env_vars) {
      const value = await p.text({
        message: envVar.label,
        placeholder: envVar.default || "",
        validate: (val) => {
          if (envVar.required && !val) return `${envVar.label} is required`;
        },
      });

      if (p.isCancel(value)) {
        p.outro("Cancelled.");
        return;
      }

      envVars[envVar.key] = value as string;
    }
  }

  // 5. Deploy!
  const startTime = Date.now();
  const spinner = p.spinner();

  try {
    // Ensure SSH key
    spinner.start("Checking SSH key...");
    const publicKey = getSSHPublicKey();
    const keys = await listSSHKeys(doToken);
    let sshFingerprint: string;

    const existing = keys.find((k) => k.public_key.trim() === publicKey);
    if (existing) {
      sshFingerprint = existing.fingerprint;
    } else {
      const newKey = await addSSHKey(doToken, "noxel-deploy", publicKey);
      sshFingerprint = newKey.fingerprint;
    }

    // Create droplet
    spinner.message("Creating server on DigitalOcean...");
    const dropletName = `noxel-${template.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
    const droplet = await createDroplet(doToken, dropletName, sshFingerprint, region as string);

    // Wait for droplet
    spinner.message("Waiting for server to be ready...");
    const ip = await waitForDroplet(doToken, droplet.id);

    // Allocate DNS via Noxel API
    spinner.message("Setting up DNS...");
    const slugName = template.name.toLowerCase().replace(/\s+/g, "-");
    const dns = await allocateDns(creds.noxel_api_key, slugName, ip);

    // Wait for SSH
    spinner.message("Connecting to server...");
    await waitForSSH(ip);

    // Install Docker
    spinner.message("Installing Docker + Caddy...");
    await installDocker(ip);
    await installCaddy(ip);

    // Deploy app
    spinner.message(`Deploying ${template.name}...`);
    await deployApp(ip, template, dns.subdomain, dns.domain, envVars);

    // Provisioning SSL
    spinner.message("Provisioning SSL certificate...");
    // Caddy handles this automatically — just wait a moment for it to kick in
    await new Promise((r) => setTimeout(r, 3000));

    spinner.stop("Deployed!");

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

    // Save deployment locally
    saveDeployment({
      app: template.name,
      subdomain: dns.subdomain,
      domain: dns.domain,
      droplet_id: droplet.id,
      ip,
      region: region as string,
      created_at: new Date().toISOString(),
      custom_domain: null,
    });

    p.log.info(`App:  ${pc.bold(template.name)}`);
    p.log.info(`URL:  ${pc.cyan(`https://${dns.domain}`)}`);
    p.log.info(`SSH:  ${pc.dim(`ssh root@${ip}`)}`);

    p.outro(`Deployed in ${elapsed}s`);
  } catch (err) {
    spinner.stop("Deployment failed");
    p.log.error((err as Error).message);
  }
}

// --- Helpers (migrated from prototype/deploy.ts) ---

async function installDocker(ip: string): Promise<void> {
  await runCommands(ip, [
    "cloud-init status --wait",
    "apt-get update -qq",
    "apt-get install -y -qq ca-certificates curl gnupg",
    "install -m 0755 -d /etc/apt/keyrings",
    "curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes",
    "chmod a+r /etc/apt/keyrings/docker.gpg",
    `echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list`,
    "apt-get update -qq",
    "apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin",
  ]);
}

async function installCaddy(ip: string): Promise<void> {
  await runCommands(ip, [
    "apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https",
    "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg --yes",
    `curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list`,
    "apt-get update -qq",
    "apt-get install -y -qq caddy",
  ]);
}

async function deployApp(
  ip: string,
  template: Template,
  subdomain: string,
  fullDomain: string,
  envVars: Record<string, string>
): Promise<void> {
  const appDir = `/opt/${subdomain}`;

  let envFileCommands: string[] = [];
  if (Object.keys(envVars).length > 0) {
    const envContent = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    envFileCommands = [
      `cat > ${appDir}/.env << 'EOF'\n${envContent}\nEOF`,
    ];
  }

  await runCommands(ip, [
    `mkdir -p ${appDir}`,
    `cat > ${appDir}/docker-compose.yml << 'EOF'\n${template.composeFile}\nEOF`,
    ...envFileCommands,
    `cd ${appDir} && docker compose up -d`,
  ]);

  // Configure Caddy
  const caddyfile = `${fullDomain} {\n    reverse_proxy localhost:${template.port}\n}`;

  await runCommands(ip, [
    `cat > /etc/caddy/Caddyfile << 'EOF'\n${caddyfile}\nEOF`,
    "systemctl restart caddy",
  ]);
}
