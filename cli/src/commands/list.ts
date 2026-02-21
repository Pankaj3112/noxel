import * as p from "@clack/prompts";
import pc from "picocolors";
import { getDeployments } from "../lib/credentials.js";

export async function listCommand(): Promise<void> {
  p.intro("noxel");

  const deployments = getDeployments();
  const entries = Object.values(deployments);

  if (entries.length === 0) {
    p.log.info("No active deployments. Run noxel deploy to get started.");
    p.outro("");
    return;
  }

  // Table header
  const header = `${"APP".padEnd(20)} ${"URL".padEnd(40)} STATUS`;
  p.log.info(pc.dim(header));

  for (const dep of entries) {
    const app = dep.app.padEnd(20);
    const url = `https://${dep.domain}`.padEnd(40);
    const status = `${pc.green("●")} running`;
    p.log.info(`${app} ${url} ${status}`);
  }

  p.outro(`${entries.length} deployment${entries.length !== 1 ? "s" : ""}`);
}
