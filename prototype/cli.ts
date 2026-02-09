import "dotenv/config";
import { runOAuthFlow } from "./auth/oauth.js";
import { deleteCredentials, getCredentials } from "./auth/credentials.js";

const [command, subcommand] = process.argv.slice(2);

async function main() {
  switch (command) {
    case "connect":
      await handleConnect(subcommand);
      break;

    case "disconnect":
      await handleDisconnect(subcommand);
      break;

    case "status":
      await handleStatus();
      break;

    case "deploy": {
      process.argv[2] = subcommand || "";
      const { default: deploy } = await import("./deploy.js");
      await deploy();
      break;
    }

    case "destroy": {
      const { default: destroy } = await import("./destroy.js");
      await destroy();
      break;
    }

    default:
      printUsage();
      break;
  }
}

async function handleConnect(provider?: string) {
  if (provider !== "digitalocean") {
    console.log("Usage: noxel connect digitalocean");
    console.log("\nSupported providers: digitalocean");
    process.exit(1);
  }

  const existing = getCredentials("digitalocean");
  if (existing) {
    console.log(
      `Already connected to DigitalOcean as ${existing.account_email}.`
    );
    console.log("Run 'noxel disconnect digitalocean' first to reconnect.");
    return;
  }

  await runOAuthFlow();
}

async function handleDisconnect(provider?: string) {
  if (provider !== "digitalocean") {
    console.log("Usage: noxel disconnect digitalocean");
    process.exit(1);
  }

  const deleted = deleteCredentials("digitalocean");
  if (deleted) {
    console.log("Disconnected from DigitalOcean.");
  } else {
    console.log("Not connected to DigitalOcean.");
  }
}

async function handleStatus() {
  console.log("Noxel Status\n");

  // DigitalOcean
  const doCreds = getCredentials("digitalocean");
  if (doCreds) {
    console.log(`  DigitalOcean: connected as ${doCreds.account_email}`);
  } else if (process.env.DIGITALOCEAN_API_TOKEN) {
    console.log("  DigitalOcean: connected via env var (API token)");
  } else {
    console.log("  DigitalOcean: not connected");
  }

  // Cloudflare
  if (process.env.CLOUDFLARE_API_TOKEN) {
    console.log("  Cloudflare:   connected via env var (API token)");
  } else {
    console.log("  Cloudflare:   not connected");
  }

  // Domain
  if (process.env.DOMAIN) {
    console.log(`  Domain:       ${process.env.DOMAIN}`);
  } else {
    console.log("  Domain:       not set");
  }
}

function printUsage() {
  console.log("Noxel - Deploy open-source AI tools\n");
  console.log("Usage: noxel <command>\n");
  console.log("Commands:");
  console.log("  connect digitalocean    Connect your DigitalOcean account");
  console.log("  disconnect digitalocean Remove DigitalOcean connection");
  console.log("  status                  Show connection status");
  console.log("  deploy <app>            Deploy an application");
  console.log("  destroy                 Destroy deployed resources");
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
