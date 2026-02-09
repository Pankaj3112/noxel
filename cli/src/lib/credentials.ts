import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const NOXEL_DIR = path.join(os.homedir(), ".noxel");
const CREDENTIALS_FILE = path.join(NOXEL_DIR, "credentials.json");
const DEPLOYMENTS_FILE = path.join(NOXEL_DIR, "deployments.json");

export interface Credentials {
  noxel_api_key: string;
  digitalocean: {
    access_token: string;
    refresh_token: string;
    expires_at: string;
    email: string;
  };
}

export interface Deployment {
  app: string;
  subdomain: string;
  domain: string;
  droplet_id: number;
  ip: string;
  region: string;
  created_at: string;
  custom_domain: string | null;
}

export type DeploymentStore = Record<string, Deployment>;

function ensureDir(): void {
  if (!fs.existsSync(NOXEL_DIR)) {
    fs.mkdirSync(NOXEL_DIR, { mode: 0o700 });
  }
}

// --- Credentials ---

export function getCredentials(): Credentials | null {
  if (!fs.existsSync(CREDENTIALS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf-8"));
  } catch {
    fs.unlinkSync(CREDENTIALS_FILE);
    return null;
  }
}

export function saveCredentials(creds: Credentials): void {
  ensureDir();
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function deleteCredentials(): boolean {
  if (!fs.existsSync(CREDENTIALS_FILE)) return false;
  fs.unlinkSync(CREDENTIALS_FILE);
  return true;
}

export function isTokenExpired(creds: Credentials): boolean {
  return new Date(creds.digitalocean.expires_at) <= new Date();
}

export function getDoToken(creds: Credentials): string {
  return creds.digitalocean.access_token;
}

export function getApiKey(creds: Credentials): string {
  return creds.noxel_api_key;
}

// --- Deployments ---

export function getDeployments(): DeploymentStore {
  if (!fs.existsSync(DEPLOYMENTS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function saveDeployment(deployment: Deployment): void {
  ensureDir();
  const store = getDeployments();
  store[deployment.subdomain] = deployment;
  fs.writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(store, null, 2));
}

export function removeDeployment(subdomain: string): void {
  const store = getDeployments();
  delete store[subdomain];
  ensureDir();
  fs.writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(store, null, 2));
}
