import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import crypto from "node:crypto";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { verifyToken, generateToken, verifyPassword } from "../security/jwt.js";
import { env } from "../config/env.js";

interface OAuthClient {
  clientId: string;
  clientSecret?: string;
  clientName: string;
  redirectUris: string[];
}

interface AuthCode {
  code: string;
  clientId: string;
  redirectUri: string;
  userId: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  expiresAt: number;
}

// In-memory store for registered clients and active auth codes
const registeredClients = new Map<string, OAuthClient>();
const authCodes = new Map<string, AuthCode>();

// Pre-register a static client for Claude / manual connector setup
const STATIC_CLIENT_ID = "smmpilot_claude_client";
const STATIC_CLIENT_SECRET = "smmpilot_claude_secret_2026";
registeredClients.set(STATIC_CLIENT_ID, {
  clientId: STATIC_CLIENT_ID,
  clientSecret: STATIC_CLIENT_SECRET,
  clientName: "Claude",
  redirectUris: [
    "https://claude.ai/api/auth/mcp/callback",
    "https://claude.ai",
    "http://localhost:3000",
  ],
});

function getBaseUrl(request: FastifyRequest): string {
  // 1. Always prioritize the incoming request host (supports custom domain e.g. smmpilot.drex.agency)
  const host = (request.headers["x-forwarded-host"] || request.headers.host)?.toString();
  const proto = (request.headers["x-forwarded-proto"] || "https").toString();
  if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
    return `${proto}://${host}`;
  }

  // 2. Custom domain configured in FRONTEND_URL
  if (env.FRONTEND_URL && !env.FRONTEND_URL.includes("localhost") && !env.FRONTEND_URL.includes("127.0.0.1")) {
    return env.FRONTEND_URL.replace(/\/+$/, "");
  }

  // 3. Fallback to Render external URL
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, "");
  }

  return `http://${env.HOST}:${env.PORT}`;
}

export const oauthRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. RFC 8414 OAuth 2.0 Authorization Server Metadata
  const metadataHandler = async (request: FastifyRequest) => {
    const baseUrl = getBaseUrl(request);
    return {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256", "plain"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      scopes_supported: ["mcp", "read", "write"],
    };
  };

  fastify.get("/.well-known/oauth-authorization-server", metadataHandler);
  fastify.get("/.well-known/oauth-authorization-server/mcp", metadataHandler);
  fastify.get("/mcp/.well-known/oauth-authorization-server", metadataHandler);
  fastify.get("/.well-known/openid-configuration", metadataHandler);
  fastify.get("/.well-known/openid-configuration/mcp", metadataHandler);
  fastify.get("/mcp/.well-known/openid-configuration", metadataHandler);

  // 2. RFC 7591 Dynamic Client Registration (used by Claude.ai Connectors)
  const registrationHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as {
      client_name?: string;
      redirect_uris?: string[];
      grant_types?: string[];
      response_types?: string[];
      token_endpoint_auth_method?: string;
    };

    const clientId = `claude_${crypto.randomBytes(12).toString("hex")}`;
    const clientSecret = crypto.randomBytes(24).toString("hex");
    const redirectUris = Array.isArray(body.redirect_uris) && body.redirect_uris.length > 0
      ? body.redirect_uris
      : ["https://claude.ai/api/auth/mcp/callback", "https://claude.ai"];

    const client: OAuthClient = {
      clientId,
      clientSecret,
      clientName: body.client_name || "Claude",
      redirectUris,
    };

    registeredClients.set(clientId, client);
    console.log(`[OAuth] Registered dynamic client: ${clientId} (${client.clientName})`);

    reply.header("Content-Type", "application/json; charset=utf-8");
    return reply.code(201).send({
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_secret_expires_at: 0,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: body.token_endpoint_auth_method || "client_secret_post",
    });
  };

  fastify.post("/oauth/register", registrationHandler);
  fastify.post("/register", registrationHandler);
  fastify.post("/mcp/register", registrationHandler);

  // 3. GET /oauth/authorize - Claude Authorization screen
  fastify.get("/oauth/authorize", async (request, reply) => {
    const query = request.query as {
      client_id?: string;
      redirect_uri?: string;
      response_type?: string;
      state?: string;
      code_challenge?: string;
      code_challenge_method?: string;
      scope?: string;
    };

    const clientId = query.client_id || STATIC_CLIENT_ID;
    const redirectUri = query.redirect_uri || "https://claude.ai/api/auth/mcp/callback";
    const state = query.state || "";
    const codeChallenge = query.code_challenge;
    const codeChallengeMethod = query.code_challenge_method;

    // Check if user has an active session in SMMPilot
    const cookieToken = request.cookies.auth_token;
    const userPayload = cookieToken ? verifyToken(cookieToken) : null;

    // If already logged into SMMPilot, issue authorization code immediately
    if (userPayload) {
      const code = `smmpilot_code_${crypto.randomBytes(16).toString("hex")}`;
      authCodes.set(code, {
        code,
        clientId,
        redirectUri,
        userId: userPayload.id,
        codeChallenge,
        codeChallengeMethod,
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      });

      const redirectTarget = new URL(redirectUri);
      redirectTarget.searchParams.set("code", code);
      if (state) redirectTarget.searchParams.set("state", state);

      return reply.redirect(redirectTarget.toString());
    }

    // Otherwise render sleek consent / sign-in screen
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connect SMMPilot to Claude</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
    .card { background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; max-width: 420px; width: 100%; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05); }
    .logo { width: 56px; height: 56px; border-radius: 12px; margin: 0 auto 16px; display: block; }
    h1 { font-size: 20px; font-weight: 700; color: #0f172a; text-align: center; margin: 0 0 8px; }
    p { font-size: 13px; color: #64748b; text-align: center; margin: 0 0 24px; line-height: 1.5; }
    .scope-box { background: #f1f5f9; border-radius: 8px; padding: 12px; font-size: 12px; color: #334155; margin-bottom: 24px; }
    .scope-box ul { margin: 6px 0 0; padding-left: 18px; }
    .form-group { margin-bottom: 16px; }
    label { display: block; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 6px; }
    input { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; box-sizing: border-box; }
    button { width: 100%; background: #2563eb; color: white; border: none; padding: 12px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; transition: background 0.15s; }
    button:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card">
    <img src="/logo.png" alt="SMMPilot Logo" class="logo">
    <h1>Authorize Claude</h1>
    <p>Allow Claude to schedule and publish LinkedIn posts on your behalf using SMMPilot.</p>
    <div class="scope-box">
      <strong>Permissions Requested:</strong>
      <ul>
        <li>Schedule and publish LinkedIn posts (text, images, video, PDF carousel)</li>
        <li>Query optimal posting engagement windows</li>
        <li>View and manage post queues</li>
      </ul>
    </div>
    <form method="POST" action="/oauth/consent">
      <input type="hidden" name="client_id" value="${clientId}">
      <input type="hidden" name="redirect_uri" value="${redirectUri}">
      <input type="hidden" name="state" value="${state}">
      <input type="hidden" name="code_challenge" value="${codeChallenge || ""}">
      <input type="hidden" name="code_challenge_method" value="${codeChallengeMethod || ""}">
      <div class="form-group">
        <label>Admin Email</label>
        <input type="email" name="email" required placeholder="admin@smmpilot.com" value="${env.ADMIN_EMAIL}">
      </div>
      <div class="form-group">
        <label>Admin Password</label>
        <input type="password" name="password" required placeholder="••••••••">
      </div>
      <button type="submit">Authorize Claude Connector</button>
    </form>
  </div>
</body>
</html>`;

    return reply.type("text/html").send(html);
  });

  // 4. POST /oauth/consent - Process credentials and redirect back to Claude
  fastify.post("/oauth/consent", async (request, reply) => {
    const body = request.body as Record<string, string>;
    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const clientId = body.client_id || STATIC_CLIENT_ID;
    const redirectUri = body.redirect_uri || "https://claude.ai/api/auth/mcp/callback";
    const state = body.state || "";
    const codeChallenge = body.code_challenge;
    const codeChallengeMethod = body.code_challenge_method;

    if (!email || !password) {
      return reply.status(400).send("Email and password are required.");
    }

    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return reply.status(401).send("Invalid admin credentials. Please go back and try again.");
    }

    // Set cookie session so user stays logged in
    const token = generateToken({ id: user.id, email: user.email, name: user.name });
    reply.setCookie("auth_token", token, {
      path: "/",
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
    });

    // Generate authorization code
    const code = `smmpilot_code_${crypto.randomBytes(16).toString("hex")}`;
    authCodes.set(code, {
      code,
      clientId,
      redirectUri,
      userId: user.id,
      codeChallenge,
      codeChallengeMethod,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const redirectTarget = new URL(redirectUri);
    redirectTarget.searchParams.set("code", code);
    if (state) redirectTarget.searchParams.set("state", state);

    return reply.redirect(redirectTarget.toString());
  });

  // 5. POST /oauth/token - Token exchange
  fastify.post("/oauth/token", async (request, reply) => {
    const body = (request.body || {}) as {
      grant_type?: string;
      code?: string;
      redirect_uri?: string;
      client_id?: string;
      client_secret?: string;
      code_verifier?: string;
    };

    if (body.grant_type !== "authorization_code" && body.grant_type !== "refresh_token") {
      return reply.status(400).send({ error: "unsupported_grant_type" });
    }

    if (!body.code) {
      return reply.status(400).send({ error: "invalid_request", error_description: "Missing code parameter" });
    }

    const authCode = authCodes.get(body.code);
    if (!authCode) {
      return reply.status(400).send({ error: "invalid_grant", error_description: "Invalid or expired authorization code" });
    }

    if (Date.now() > authCode.expiresAt) {
      authCodes.delete(body.code);
      return reply.status(400).send({ error: "invalid_grant", error_description: "Authorization code expired" });
    }

    // PKCE verification if challenge was provided
    if (authCode.codeChallenge && body.code_verifier) {
      let computed: string;
      if (authCode.codeChallengeMethod === "S256") {
        computed = crypto.createHash("sha256").update(body.code_verifier).digest("base64url");
      } else {
        computed = body.code_verifier;
      }
      if (computed !== authCode.codeChallenge) {
        return reply.status(400).send({ error: "invalid_grant", error_description: "PKCE verification failed" });
      }
    }

    // Clean up code
    authCodes.delete(body.code);

    const user = await db.query.users.findFirst({
      where: eq(users.id, authCode.userId),
    });

    const accessToken = generateToken({
      id: user?.id || authCode.userId,
      email: user?.email || env.ADMIN_EMAIL,
      name: user?.name || "Admin",
    });

    console.log(`[OAuth] Successfully issued access token to client: ${authCode.clientId}`);

    return reply.send({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 30 * 24 * 60 * 60, // 30 days
      scope: "mcp",
    });
  });
};
