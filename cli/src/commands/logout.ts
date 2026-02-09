import * as p from "@clack/prompts";
import { getCredentials, deleteCredentials, getDeployments } from "../lib/credentials.js";
import { destroyCommand } from "./destroy.js";

export async function logoutCommand(): Promise<void> {
  p.intro("noxel");

  const creds = getCredentials();
  if (!creds) {
    p.log.info("Not logged in.");
    p.outro("");
    return;
  }

  const deployments = getDeployments();
  const count = Object.keys(deployments).length;

  if (count > 0) {
    const choice = await p.select({
      message: `You have ${count} active deployment${count !== 1 ? "s" : ""}. What would you like to do?`,
      options: [
        { value: "keep", label: "Keep deployments running (just remove credentials)" },
        { value: "destroy", label: "Destroy all deployments, then logout" },
      ],
    });

    if (p.isCancel(choice)) {
      p.outro("Cancelled.");
      return;
    }

    if (choice === "destroy") {
      for (const name of Object.keys(deployments)) {
        await destroyCommand(name);
      }
    }
  }

  deleteCredentials();

  p.log.success("Credentials removed.");

  if (count > 0) {
    p.outro("Your deployments are still running. You can manage them from DigitalOcean.");
  } else {
    p.outro("");
  }
}
