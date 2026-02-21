import * as http from "node:http";
import * as crypto from "node:crypto";
import open from "open";
import * as p from "@clack/prompts";
import { saveCredentials, getCredentials } from "../lib/credentials.js";
import { exchangeAuthCode } from "../lib/api.js";
import { DO_CLIENT_ID, DO_AUTH_URL, OAUTH_PORT } from "../lib/config.js";

export async function loginCommand(): Promise<void> {
  p.intro("noxel login");

  // Check if already logged in
  const existing = getCredentials();
  if (existing) {
    const shouldContinue = await p.confirm({
      message: `Already connected as ${existing.digitalocean.email}. Reconnect?`,
    });
    if (p.isCancel(shouldContinue) || !shouldContinue) {
      p.outro("Cancelled.");
      return;
    }
  }

  const redirectUri = `http://localhost:${OAUTH_PORT}/callback`;
  const state = crypto.randomBytes(16).toString("hex");

  // Build auth URL
  const params = new URLSearchParams({
    client_id: DO_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "read write",
    state,
  });
  const authUrl = `${DO_AUTH_URL}?${params}`;

  // Start local server to receive callback
  const { server, codePromise } = await startCallbackServer(state);

  const spinner = p.spinner();

  // Open browser
  p.log.info("Opening browser to connect DigitalOcean...");
  try {
    await open(authUrl);
  } catch {
    p.log.warn(`Browser didn't open. Visit:\n${authUrl}`);
  }

  spinner.start("Waiting for authorization...");

  // Wait for callback with timeout
  let code: string;
  try {
    code = await Promise.race([
      codePromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timed out waiting for authorization (2 min)")), 120_000)
      ),
    ]);
  } catch (err) {
    spinner.stop("Authorization failed");
    server.close();
    p.log.error((err as Error).message);
    return;
  } finally {
    server.close();
  }

  spinner.message("Exchanging tokens...");

  // Exchange code via Noxel API (keeps client secret server-side)
  try {
    const result = await exchangeAuthCode(code, redirectUri);

    saveCredentials({
      noxel_api_key: result.noxel_api_key,
      digitalocean: {
        access_token: result.do_access_token,
        refresh_token: result.do_refresh_token,
        expires_at: result.do_expires_at,
        email: result.email,
      },
    });

    spinner.stop(`Connected as ${result.email}`);
    p.outro("Ready! Run noxel deploy to get started.");
  } catch (err) {
    spinner.stop("Login failed");
    p.log.error((err as Error).message);
  }
}

function startCallbackServer(
  expectedState: string
): Promise<{ server: http.Server; codePromise: Promise<string> }> {
  return new Promise((resolve, reject) => {
    let resolveCode: (code: string) => void;
    let rejectCode: (err: Error) => void;

    const codePromise = new Promise<string>((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });

    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${OAUTH_PORT}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const error = url.searchParams.get("error");
      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>Authorization denied</h1><p>You can close this window.</p>");
        rejectCode(new Error(`Authorization denied: ${error}`));
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (!code) {
        res.writeHead(400);
        res.end("Missing code");
        rejectCode(new Error("Missing code parameter"));
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400);
        res.end("Invalid state");
        rejectCode(new Error("Invalid state parameter — possible CSRF attack"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h1>Connected to DigitalOcean!</h1><p>You can close this window and return to the terminal.</p>");
      resolveCode(code);
    });

    server.on("error", reject);
    server.listen(OAUTH_PORT, "127.0.0.1", () => resolve({ server, codePromise }));
  });
}
