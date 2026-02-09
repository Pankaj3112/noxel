import { Hono } from "hono";
import { createUser, getUserByEmail, updateUserLogin } from "../db.js";
import type { Bindings } from "../worker.js";

const DO_TOKEN_URL = "https://cloud.digitalocean.com/v1/oauth/token";
const DO_ACCOUNT_URL = "https://api.digitalocean.com/v2/account";

export const authRoutes = new Hono<{ Bindings: Bindings }>();

// POST /auth/digitalocean — exchange auth code for tokens
authRoutes.post("/digitalocean", async (c) => {
  const body = await c.req.json<{ code: string; redirect_uri: string }>();

  if (!body.code || !body.redirect_uri) {
    return c.json({ error: "Missing code or redirect_uri" }, 400);
  }

  // Exchange code for tokens using our client secret
  const tokenRes = await fetch(DO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: body.code,
      client_id: c.env.DO_CLIENT_ID,
      client_secret: c.env.DO_CLIENT_SECRET,
      redirect_uri: body.redirect_uri,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return c.json({ error: `DigitalOcean token exchange failed: ${text}` }, 502);
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Fetch account info
  let email = "unknown";
  let doAccountId: string | null = null;
  try {
    const accountRes = await fetch(DO_ACCOUNT_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (accountRes.ok) {
      const accountData = (await accountRes.json()) as {
        account: { email: string; uuid: string };
      };
      email = accountData.account.email;
      doAccountId = accountData.account.uuid;
    }
  } catch {
    // Non-critical — continue with "unknown"
  }

  // Create or find user
  const db = c.env.DB;
  let user = await getUserByEmail(db, email);
  if (user) {
    await updateUserLogin(db, user.id);
  } else {
    user = await createUser(db, { email, doAccountId });
  }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  return c.json({
    do_access_token: tokenData.access_token,
    do_refresh_token: tokenData.refresh_token,
    do_expires_at: expiresAt,
    email,
    noxel_api_key: user.api_key,
  });
});

// POST /auth/digitalocean/refresh — refresh expired DO token
authRoutes.post("/digitalocean/refresh", async (c) => {
  const body = await c.req.json<{ refresh_token: string }>();

  if (!body.refresh_token) {
    return c.json({ error: "Missing refresh_token" }, 400);
  }

  const tokenRes = await fetch(DO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: body.refresh_token,
      client_id: c.env.DO_CLIENT_ID,
      client_secret: c.env.DO_CLIENT_SECRET,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return c.json({ error: `Token refresh failed: ${text}` }, 502);
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  return c.json({
    do_access_token: tokenData.access_token,
    do_refresh_token: tokenData.refresh_token,
    do_expires_at: expiresAt,
  });
});
