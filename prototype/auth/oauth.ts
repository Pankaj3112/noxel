import * as http from "node:http";
import open from "open";
import {
  saveCredentials,
  type ProviderCredentials,
} from "./credentials.js";

// These will be set after registering Noxel as a DO OAuth app.
// Embedded client_secret is standard for CLI apps (doctl, gh do the same).
export const CLIENT_ID = process.env.NOXEL_DO_CLIENT_ID || "REPLACE_WITH_CLIENT_ID";
export const CLIENT_SECRET =
  process.env.NOXEL_DO_CLIENT_SECRET || "REPLACE_WITH_CLIENT_SECRET";

const DO_AUTH_URL = "https://cloud.digitalocean.com/v1/oauth/authorize";
const DO_TOKEN_URL = "https://cloud.digitalocean.com/v1/oauth/token";
const DO_ACCOUNT_URL = "https://api.digitalocean.com/v2/account";

const PORT = 19847;
const TIMEOUT_MS = 120_000; // 2 minutes

function buildAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "read write",
  });
  return `${DO_AUTH_URL}?${params}`;
}

async function exchangeCode(
  code: string,
  redirectUri: string
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const res = await fetch(DO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  return res.json();
}

async function fetchAccountEmail(accessToken: string): Promise<string> {
  const res = await fetch(DO_ACCOUNT_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    return "unknown";
  }

  const data = (await res.json()) as { account: { email: string } };
  return data.account.email;
}

function startServer(): Promise<{ server: http.Server; codePromise: Promise<string> }> {
  return new Promise((resolve, reject) => {
    let resolveCode: (code: string) => void;
    let rejectCode: (err: Error) => void;

    const codePromise = new Promise<string>((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });

    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${PORT}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const error = url.searchParams.get("error");
      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<h1>Authorization denied</h1><p>You can close this window.</p>"
        );
        rejectCode(new Error(`Authorization denied: ${error}`));
        return;
      }

      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(400);
        res.end("Missing code parameter");
        rejectCode(new Error("Missing code parameter in callback"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<h1>Connected to DigitalOcean!</h1><p>You can close this window and return to the terminal.</p>"
      );
      resolveCode(code);
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      reject(err);
    });

    server.listen(PORT, "127.0.0.1", () => {
      resolve({ server, codePromise });
    });
  });
}

export async function runOAuthFlow(): Promise<void> {
  let server: http.Server;
  let codePromise: Promise<string>;

  try {
    const result = await startServer();
    server = result.server;
    codePromise = result.codePromise;
  } catch (err) {
    throw new Error(
      `Could not start local server on port ${PORT}. Is it already in use?`
    );
  }

  const redirectUri = `http://localhost:${PORT}/callback`;
  const authUrl = buildAuthUrl(redirectUri);

  console.log("\nOpening browser to connect your DigitalOcean account...");
  console.log(`\nIf your browser didn't open, visit:\n${authUrl}\n`);

  try {
    await open(authUrl);
  } catch {
    // Browser open failed — URL is already printed above
  }

  // Wait for callback with timeout
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Timed out waiting for authorization (2 min).")),
      TIMEOUT_MS
    );
  });

  let code: string;
  try {
    code = await Promise.race([codePromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
    server.close();
  }

  // Exchange code for token
  console.log("Exchanging authorization code for token...");
  const tokenData = await exchangeCode(code, redirectUri);

  // Fetch account email via /v2/account
  const email = await fetchAccountEmail(tokenData.access_token);

  // Calculate expiry
  const expiresAt = new Date(
    Date.now() + tokenData.expires_in * 1000
  ).toISOString();

  // Save credentials
  const creds: ProviderCredentials = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: expiresAt,
    account_email: email,
  };

  saveCredentials("digitalocean", creds);

  console.log(`\nConnected to DigitalOcean as ${email}`);
}
