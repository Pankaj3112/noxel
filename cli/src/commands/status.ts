import * as p from "@clack/prompts";
import { getCredentials, getDeployments } from "../lib/credentials.js";

export async function statusCommand(): Promise<void> {
  p.intro("noxel");

  const creds = getCredentials();
  const deployments = getDeployments();
  const count = Object.keys(deployments).length;

  if (creds) {
    p.log.info(`DigitalOcean   connected (${creds.digitalocean.email})`);
  } else {
    p.log.info("DigitalOcean   not connected");
  }

  p.log.info(`Deployments    ${count} active`);

  p.outro(creds ? "All systems operational" : "Run noxel login to connect");
}
