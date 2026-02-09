import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const NOXEL_DIR = path.join(os.homedir(), ".noxel");
const CREDENTIALS_FILE = path.join(NOXEL_DIR, "credentials.json");

export interface ProviderCredentials {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  account_email: string;
}

interface CredentialsStore {
  [provider: string]: ProviderCredentials;
}

function ensureDir(): void {
  if (!fs.existsSync(NOXEL_DIR)) {
    fs.mkdirSync(NOXEL_DIR, { mode: 0o700 });
  }
}

function readStore(): CredentialsStore {
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf-8"));
  } catch {
    // Corrupted file — delete and start fresh
    fs.unlinkSync(CREDENTIALS_FILE);
    return {};
  }
}

function writeStore(store: CredentialsStore): void {
  ensureDir();
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(store, null, 2), {
    mode: 0o600,
  });
}

export function getCredentials(provider: string): ProviderCredentials | null {
  const store = readStore();
  return store[provider] ?? null;
}

export function saveCredentials(
  provider: string,
  creds: ProviderCredentials
): void {
  const store = readStore();
  store[provider] = creds;
  writeStore(store);
}

export function deleteCredentials(provider: string): boolean {
  const store = readStore();
  if (!(provider in store)) {
    return false;
  }
  delete store[provider];
  writeStore(store);
  return true;
}

export function isExpired(creds: ProviderCredentials): boolean {
  return new Date(creds.expires_at) <= new Date();
}
