import * as p from "@clack/prompts";
import pc from "picocolors";
import { listTemplates, loadTemplate } from "../lib/template.js";

export async function templatesCommand(): Promise<void> {
  p.intro("noxel templates");

  const slugs = listTemplates();

  if (slugs.length === 0) {
    p.log.info("No templates available.");
    p.outro("");
    return;
  }

  for (const slug of slugs) {
    const t = loadTemplate(slug);
    const name = pc.bold(t.name.padEnd(20));
    const desc = t.description.padEnd(40);
    const ram = pc.dim(t.resources.min_ram);
    p.log.info(`${name} ${desc} ${ram}`);
  }

  p.outro(`${slugs.length} templates available`);
}
