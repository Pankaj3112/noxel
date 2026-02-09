import * as dns from "node:dns/promises";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { getDeployments, saveDeployment } from "../lib/credentials.js";
import { runCommands } from "../lib/ssh.js";

export async function domainAddCommand(
  customDomain: string,
  options: { app: string }
): Promise<void> {
  p.intro("noxel domain");

  const deployments = getDeployments();
  const deployment = deployments[options.app];

  if (!deployment) {
    p.log.error(`Deployment "${options.app}" not found. Run noxel list to see deployments.`);
    return;
  }

  p.log.info("Add this DNS record at your domain provider:");
  p.log.info("");
  p.log.info(`  Type:   ${pc.bold("CNAME")}`);
  p.log.info(`  Name:   ${pc.bold(customDomain)}`);
  p.log.info(`  Value:  ${pc.bold(deployment.domain)}`);
  p.log.info("");
  p.log.info(`After adding the record, run:`);
  p.log.info(`  ${pc.cyan(`noxel domain verify ${customDomain}`)}`);

  p.outro("Waiting for DNS configuration");
}

export async function domainVerifyCommand(customDomain: string): Promise<void> {
  p.intro("noxel domain");

  const spinner = p.spinner();
  spinner.start("Checking DNS records...");

  try {
    const records = await dns.resolveCname(customDomain);

    if (records.length === 0) {
      spinner.stop("No CNAME record found");
      p.log.error(`CNAME record for ${customDomain} not found. Please add it and try again.`);
      return;
    }

    spinner.message("CNAME record found!");

    // Find which deployment this CNAME points to
    const deployments = getDeployments();
    const target = records[0]; // e.g., "uptime-kuma-a7x.noxel.sh"
    const subdomain = target.split(".")[0];
    const deployment = deployments[subdomain];

    if (!deployment) {
      spinner.stop("CNAME found but no matching deployment");
      p.log.error(`CNAME points to ${target} but no matching deployment found.`);
      return;
    }

    spinner.message("Configuring SSL certificate...");

    // Update Caddyfile to include custom domain
    const caddyfile = `${deployment.domain}, ${customDomain} {\n    reverse_proxy localhost:${getPortForApp(deployment.app)}\n}`;

    await runCommands(deployment.ip, [
      `cat > /etc/caddy/Caddyfile << 'EOF'\n${caddyfile}\nEOF`,
      "systemctl reload caddy",
    ]);

    // Save custom domain to local deployments
    deployment.custom_domain = customDomain;
    saveDeployment(deployment);

    spinner.stop(`${pc.green(customDomain)} is live!`);
    p.outro("");
  } catch (err) {
    spinner.stop("Verification failed");
    if ((err as NodeJS.ErrnoException).code === "ENOTFOUND" || (err as NodeJS.ErrnoException).code === "ENODATA") {
      p.log.error(`No CNAME record found for ${customDomain}. Please add it and try again.`);
    } else {
      p.log.error((err as Error).message);
    }
  }
}

// Quick helper — in a real version, look this up from the template
function getPortForApp(appName: string): number {
  const ports: Record<string, number> = {
    "Uptime Kuma": 3001,
    "n8n": 5678,
  };
  return ports[appName] || 3000;
}
