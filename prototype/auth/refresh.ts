import {
  getCredentials,
  saveCredentials,
  deleteCredentials,
  isExpired,
} from "./credentials.js";
import { CLIENT_ID, CLIENT_SECRET } from "./oauth.js";

const DO_TOKEN_URL = "https://cloud.digitalocean.com/v1/oauth/token";
const DO_ACCOUNT_URL = "https://api.digitalocean.com/v2/account";

export async function getDigitalOceanToken(): Promise<string> {
  // 1. Try stored OAuth credentials
  const creds = getCredentials("digitalocean");
  if (creds) {
    if (!isExpired(creds)) {
      return creds.access_token;
    }
    // Attempt refresh
    try {
      return await refreshDigitalOceanToken(creds.refresh_token);
    } catch {
      deleteCredentials("digitalocean");
      throw new Error(
        "DigitalOcean token expired and refresh failed. Run: noxel connect digitalocean"
      );
    }
  }

  // 2. Fall back to env var
  const envToken = process.env.DIGITALOCEAN_API_TOKEN;
  if (envToken && envToken !== "your_token_here") {
    return envToken;
  }

  // 3. Not connected
  throw new Error(
    "Not connected to DigitalOcean. Run: noxel connect digitalocean"
  );
}

async function refreshDigitalOceanToken(
  refreshToken: string
): Promise<string> {
  const res = await fetch(DO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Fetch account email via /v2/account
  let email = "unknown";
  try {
    const accountRes = await fetch(DO_ACCOUNT_URL, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (accountRes.ok) {
      const accountData = (await accountRes.json()) as {
        account: { email: string };
      };
      email = accountData.account.email;
    }
  } catch {
    // Non-critical — keep existing email if fetch fails
  }

  const expiresAt = new Date(
    Date.now() + data.expires_in * 1000
  ).toISOString();

  saveCredentials("digitalocean", {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
    account_email: email,
  });

  return data.access_token;
}
