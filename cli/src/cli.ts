#!/usr/bin/env node
import { Command } from "commander";
import { loginCommand } from "./commands/login.js";
import { deployCommand } from "./commands/deploy.js";
import { destroyCommand } from "./commands/destroy.js";
import { listCommand } from "./commands/list.js";
import { statusCommand } from "./commands/status.js";
import { templatesCommand } from "./commands/templates.js";
import { domainAddCommand, domainVerifyCommand } from "./commands/domain.js";
import { logoutCommand } from "./commands/logout.js";

const program = new Command();

program
  .name("noxel")
  .description("Deploy open-source apps in minutes")
  .version("0.1.0");

program
  .command("login")
  .description("Connect your DigitalOcean account")
  .action(loginCommand);

program
  .command("deploy [app]")
  .description("Deploy an application")
  .action((app?: string) => deployCommand(app));

program
  .command("destroy [name]")
  .description("Destroy a deployment")
  .action((name?: string) => destroyCommand(name));

program
  .command("list")
  .description("Show active deployments")
  .action(listCommand);

program
  .command("status")
  .description("Show connection status")
  .action(statusCommand);

program
  .command("templates")
  .description("List available app templates")
  .action(templatesCommand);

const domain = program
  .command("domain")
  .description("Manage custom domains");

domain
  .command("add <domain>")
  .requiredOption("--app <name>", "Deployment name (from noxel list)")
  .description("Show CNAME instructions for a custom domain")
  .action(domainAddCommand);

domain
  .command("verify <domain>")
  .description("Verify CNAME and configure SSL")
  .action(domainVerifyCommand);

program
  .command("logout")
  .description("Remove stored credentials")
  .action(logoutCommand);

program.parse();
