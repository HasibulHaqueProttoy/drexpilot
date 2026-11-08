import type { FastifyPluginAsync } from "fastify";
import crypto from "node:crypto";
import { db } from "../db/index.js";
import { socialAccounts } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { encrypt } from "../security/crypto.js";
import { env } from "../config/env.js";

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/auth/linkedin - Initiate OAuth flow
  fastify.get("/linkedin", async (request, reply) => {
    // Generate secure state for CSRF protection
    const state = crypto.randomBytes(24).toString("hex");

    reply.setCookie("oauth_state", state, {
      path: "/",
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
    });

    const params = new URLSearchParams({
      response_type: "code",
      client_id: env.LINKEDIN_CLIENT_ID,
      redirect_uri: env.LINKEDIN_REDIRECT_URI,
      state,
      scope: "openid profile email w_member_social",
    });

    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
    return reply.redirect(authUrl);
  });

  // GET /api/auth/linkedin/callback - Handle LinkedIn OAuth callback
  fastify.get("/linkedin/callback", async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string; error_description?: string };
    const savedState = request.cookies.oauth_state;

    if (query.error) {
      console.error("[OAuth] LinkedIn returned error:", query.error, query.error_description);
      return reply.redirect(`${env.FRONTEND_URL}/connections?error=${encodeURIComponent(query.error_description || query.error)}`);
    }

    // CSRF verification
    if (!query.state || query.state !== savedState) {
      console.error("[OAuth] State mismatch or expired state");
      return reply.redirect(`${env.FRONTEND_URL}/connections?error=${encodeURIComponent("Invalid or expired OAuth state (CSRF failure)")}`);
    }

    if (!query.code) {
      return reply.redirect(`${env.FRONTEND_URL}/connections?error=Missing+authorization+code`);
    }

    try {
      // 1. Exchange authorization code for access token
      const tokenParams = new URLSearchParams({
        grant_type: "authorization_code",
        code: query.code,
        redirect_uri: env.LINKEDIN_REDIRECT_URI,
        client_id: env.LINKEDIN_CLIENT_ID,
        client_secret: env.LINKEDIN_CLIENT_SECRET,
      });

      const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenParams.toString(),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error("[OAuth] Failed to exchange token:", errText);
        return reply.redirect(`${env.FRONTEND_URL}/connections?error=${encodeURIComponent("Failed to retrieve access token from LinkedIn")}`);
      }

      const tokenData = (await tokenRes.json()) as {
        access_token: string;
        expires_in: number;
        refresh_token?: string;
        refresh_token_expires_in?: number;
      };

      // 2. Fetch user profile from OpenID userinfo endpoint
      const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!profileRes.ok) {
        const errText = await profileRes.text();
        console.error("[OAuth] Failed to fetch LinkedIn profile:", errText);
        return reply.redirect(`${env.FRONTEND_URL}/connections?error=${encodeURIComponent("Failed to fetch LinkedIn profile information")}`);
      }

      const profile = (await profileRes.json()) as { sub: string; name: string; email?: string };

      // 3. Encrypt tokens securely
      const encryptedAccessToken = encrypt(tokenData.access_token);
      const encryptedRefreshToken = tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null;
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

      // 4. Upsert account record
      const existing = await db.query.socialAccounts.findFirst({
        where: and(
          eq(socialAccounts.platform, "linkedin"),
          eq(socialAccounts.accountId, profile.sub)
        ),
      });

      if (existing) {
        await db
          .update(socialAccounts)
          .set({
            accountName: profile.name,
            accessTokenEncrypted: encryptedAccessToken,
            refreshTokenEncrypted: encryptedRefreshToken,
            tokenExpiresAt: expiresAt,
            status: "connected",
            updatedAt: new Date(),
          })
          .where(eq(socialAccounts.id, existing.id));
      } else {
        await db.insert(socialAccounts).values({
          platform: "linkedin",
          accountId: profile.sub,
          accountName: profile.name,
          accessTokenEncrypted: encryptedAccessToken,
          refreshTokenEncrypted: encryptedRefreshToken,
          tokenExpiresAt: expiresAt,
          status: "connected",
        });
      }

      return reply.redirect(`${env.FRONTEND_URL}/connections?connected=true&account=${encodeURIComponent(profile.name)}`);
    } catch (err: any) {
      console.error("[OAuth] Callback exception:", err);
      return reply.redirect(`${env.FRONTEND_URL}/connections?error=${encodeURIComponent(err.message || "OAuth processing failed")}`);
    }
  });

  // GET /api/auth/status - Get connected social accounts status
  fastify.get("/status", async () => {
    const accounts = await db.query.socialAccounts.findMany({
      columns: {
        id: true,
        platform: true,
        accountId: true,
        accountName: true,
        status: true,
        tokenExpiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const linkedin = accounts.find((a) => a.platform === "linkedin" && a.status === "connected") || null;

    return {
      connected: Boolean(linkedin),
      linkedin,
      accounts,
    };
  });

  // POST /api/auth/linkedin/disconnect - Disconnect account
  fastify.post("/linkedin/disconnect", async (request, reply) => {
    const accounts = await db.query.socialAccounts.findMany({
      where: eq(socialAccounts.platform, "linkedin"),
    });

    for (const acc of accounts) {
      await db
        .update(socialAccounts)
        .set({ status: "disconnected", updatedAt: new Date() })
        .where(eq(socialAccounts.id, acc.id));
    }

    return { success: true, message: "LinkedIn account disconnected successfully." };
  });

  // POST /api/auth/mock-connect - Enable test account for instant local testing/demo
  fastify.post("/mock-connect", async (request, reply) => {
    const existing = await db.query.socialAccounts.findFirst({
      where: eq(socialAccounts.platform, "linkedin"),
    });

    const mockToken = encrypt("mock_linkedin_access_token_demo_mode");
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days

    if (existing) {
      await db
        .update(socialAccounts)
        .set({
          accountId: "mock_person_123456",
          accountName: "Drex Verified LinkedIn User (Test Profile)",
          accessTokenEncrypted: mockToken,
          tokenExpiresAt: expiresAt,
          status: "connected",
          updatedAt: new Date(),
        })
        .where(eq(socialAccounts.id, existing.id));
    } else {
      await db.insert(socialAccounts).values({
        platform: "linkedin",
        accountId: "mock_person_123456",
        accountName: "Drex Verified LinkedIn User (Test Profile)",
        accessTokenEncrypted: mockToken,
        tokenExpiresAt: expiresAt,
        status: "connected",
      });
    }

    return {
      success: true,
      message: "Test LinkedIn account connected successfully. You can now schedule or publish posts immediately.",
    };
  });
};
