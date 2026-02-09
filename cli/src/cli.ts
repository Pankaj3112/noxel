#!/usr/bin/env node
import { Command } from "commander";
import { loginCommand } from "./commands/login.js";

const program = new Command();

program
  .name("noxel")
  .description("Deploy open-source apps in minutes")
  .version("0.1.0");

program
  .command("login")
  .description("Connect your DigitalOcean account")
  .action(loginCommand);

program.parse();
