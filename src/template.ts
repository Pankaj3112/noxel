import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

export interface EnvVar {
  key: string;
  label: string;
  required: boolean;
  secret: boolean;
  default?: string;
}

export interface Template {
  name: string;
  description: string;
  source: string;
  port: number;
  env_vars: EnvVar[];
  resources: {
    min_ram: string;
    min_cpu: number;
  };
  composeFile: string;
}

export function listTemplates(): string[] {
  return fs.readdirSync(TEMPLATES_DIR).filter((name) => {
    const templatePath = path.join(TEMPLATES_DIR, name, "template.yaml");
    return fs.existsSync(templatePath);
  });
}

export function loadTemplate(appName: string): Template {
  const templateDir = path.join(TEMPLATES_DIR, appName);

  if (!fs.existsSync(templateDir)) {
    const available = listTemplates();
    throw new Error(
      `Template "${appName}" not found. Available: ${available.join(", ")}`
    );
  }

  const templatePath = path.join(templateDir, "template.yaml");
  const composePath = path.join(templateDir, "docker-compose.yml");

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Missing template.yaml in ${templateDir}`);
  }

  if (!fs.existsSync(composePath)) {
    throw new Error(`Missing docker-compose.yml in ${templateDir}`);
  }

  const templateYaml = fs.readFileSync(templatePath, "utf-8");
  const config = yaml.load(templateYaml) as Record<string, unknown>;
  const composeFile = fs.readFileSync(composePath, "utf-8");

  return {
    name: config.name as string,
    description: config.description as string,
    source: config.source as string,
    port: config.port as number,
    env_vars: (config.env_vars as EnvVar[]) || [],
    resources: config.resources as { min_ram: string; min_cpu: number },
    composeFile,
  };
}
