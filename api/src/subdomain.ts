const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomSuffix(length = 6): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += CHARS[array[i] % CHARS.length];
  }
  return result;
}

function sanitizeAppName(app: string): string {
  return app
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // Strip non-alphanumeric (except spaces and dashes)
    .replace(/[\s]+/g, "-")        // Replace spaces with dash
    .replace(/-+/g, "-")           // Collapse multiple dashes
    .replace(/^-|-$/g, "");        // Trim leading/trailing dashes
}

export function generateSubdomain(app: string): string {
  const sanitized = sanitizeAppName(app);
  return `${sanitized}-${randomSuffix()}`;
}

export function isValidSubdomain(subdomain: string): boolean {
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(subdomain) && subdomain.length >= 3;
}
