import * as p from "@clack/prompts";
import {
  getCredentials,
  getDeployments,
  removeDeployment,
  type Deployment,
} from "../lib/credentials.js";
import { deleteDns } from "../lib/api.js";
import { deleteDroplet } from "../lib/digitalocean.js";

export async function destroyCommand(name?: string): Promise<void> {
  p.intro("noxel destroy");

  const creds = getCredentials();
  if (!creds) {
    p.log.error("Not logged in. Run: noxel login");
    return;
  }

  const deployments = getDeployments();
  const entries = Object.entries(deployments);

  if (entries.length === 0) {
    p.log.info("No active deployments.");
    p.outro("");
    return;
  }

  let target: [string, Deployment];

  if (name) {
    const found = entries.find(([key]) => key === name);
    if (!found) {
      p.log.error(`Deployment "${name}" not found. Run noxel list to see deployments.`);
      return;
    }
    target = found;
  } else {
    const selected = await p.select({
      message: "Which deployment do you want to destroy?",
      options: entries.map(([key, dep]) => ({
        value: key,
        label: `${key} (${dep.app} — https://${dep.domain})`,
      })),
    });

    if (p.isCancel(selected)) {
      p.outro("Cancelled.");
      return;
    }

    target = [selected as string, deployments[selected as string]];
  }

  const [subdomain, deployment] = target;

  const confirmed = await p.confirm({
    message: `Are you sure? This will permanently delete the server and all data.`,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.outro("Cancelled.");
    return;
  }

  const spinner = p.spinner();

  try {
    spinner.start("Removing DNS record...");
    await deleteDns(creds.noxel_api_key, subdomain);

    spinner.message("Destroying server...");
    await deleteDroplet(creds.digitalocean.access_token, deployment.droplet_id);

    removeDeployment(subdomain);
    spinner.stop(`Destroyed ${deployment.domain}`);

    p.outro("");
  } catch (err) {
    spinner.stop("Destroy failed");
    p.log.error((err as Error).message);
  }
}
