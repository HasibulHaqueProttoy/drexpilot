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
      // Request both Personal Profile and Company Page publishing scopes
      scope: "openid profile email w_member_social w_organization_social r_organization_social",
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

      // 4. Upsert Personal Account record
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
            accountType: "personal",
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
          accountType: "personal",
          accessTokenEncrypted: encryptedAccessToken,
          refreshTokenEncrypted: encryptedRefreshToken,
          tokenExpiresAt: expiresAt,
          status: "connected",
        });
      }

      // 5. Automatically discover managed LinkedIn Company Pages
      let discoveredPagesCount = 0;
      try {
        const aclsRes = await fetch("https://api.linkedin.com/rest/organizationalEntityAcls?q=roleAssignee", {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            "LinkedIn-Version": "202401",
            "X-Restli-Protocol-Version": "2.0.0",
          },
        });

        if (aclsRes.ok) {
          const aclsData = await aclsRes.json() as { elements?: Array<{ organizationalTarget?: string; role?: string; state?: string }> };
          const elements = aclsData.elements || [];

          for (const item of elements) {
            const orgUrn = item.organizationalTarget;
            if (!orgUrn || !orgUrn.includes("organization:")) continue;
            const orgId = orgUrn.split(":").pop();
            if (!orgId) continue;

            // Fetch company details
            let orgName = `Company Page (${orgId})`;
            try {
              const orgDetailsRes = await fetch(`https://api.linkedin.com/rest/organizations/${orgId}`, {
                headers: {
                  Authorization: `Bearer ${tokenData.access_token}`,
                  "LinkedIn-Version": "202401",
                  "X-Restli-Protocol-Version": "2.0.0",
                },
              });
              if (orgDetailsRes.ok) {
                const orgInfo = await orgDetailsRes.json() as { localizedName?: string };
                if (orgInfo.localizedName) {
                  orgName = orgInfo.localizedName;
                }
              }
            } catch {
              // fallback
            }

            // Upsert organization page
            const existingOrg = await db.query.socialAccounts.findFirst({
              where: and(
                eq(socialAccounts.platform, "linkedin"),
                eq(socialAccounts.accountId, orgId)
              ),
            });

            if (existingOrg) {
              await db
                .update(socialAccounts)
                .set({
                  accountName: orgName,
                  accountType: "organization",
                  accessTokenEncrypted: encryptedAccessToken,
                  refreshTokenEncrypted: encryptedRefreshToken,
                  tokenExpiresAt: expiresAt,
                  status: "connected",
                  updatedAt: new Date(),
                })
                .where(eq(socialAccounts.id, existingOrg.id));
            } else {
              await db.insert(socialAccounts).values({
                platform: "linkedin",
                accountId: orgId,
                accountName: orgName,
                accountType: "organization",
                accessTokenEncrypted: encryptedAccessToken,
                refreshTokenEncrypted: encryptedRefreshToken,
                tokenExpiresAt: expiresAt,
                status: "connected",
              });
            }
            discoveredPagesCount++;
          }
        }
      } catch (orgErr) {
        console.warn("[OAuth] Could not fetch company pages:", orgErr);
      }

      const redirectMsg = discoveredPagesCount > 0
        ? `Connected ${profile.name} and ${discoveredPagesCount} company page(s)!`
        : `Connected ${profile.name}!`;

      return reply.redirect(`${env.FRONTEND_URL}/connections?connected=true&account=${encodeURIComponent(redirectMsg)}`);
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
        accountType: true,
        status: true,
        tokenExpiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const activeAccounts = accounts.filter((a) => a.status === "connected");
    const personalProfiles = activeAccounts.filter((a) => a.accountType === "personal");
    const companyPages = activeAccounts.filter((a) => a.accountType === "organization");

    return {
      connected: activeAccounts.length > 0,
      accounts: activeAccounts,
      allAccounts: accounts,
      personalProfiles,
      companyPages,
      linkedin: personalProfiles[0] || activeAccounts[0] || null,
    };
  });

  // POST /api/auth/linkedin/disconnect - Disconnect account(s)
  fastify.post("/linkedin/disconnect", async (request, reply) => {
    const body = (request.body as { id?: string } | undefined) || {};

    if (body.id) {
      await db
        .update(socialAccounts)
        .set({ status: "disconnected", updatedAt: new Date() })
        .where(eq(socialAccounts.id, body.id));
      return { success: true, message: "Account disconnected successfully." };
    }

    // Disconnect all if no ID specified
    const accounts = await db.query.socialAccounts.findMany({
      where: eq(socialAccounts.platform, "linkedin"),
    });

    for (const acc of accounts) {
      await db
        .update(socialAccounts)
        .set({ status: "disconnected", updatedAt: new Date() })
        .where(eq(socialAccounts.id, acc.id));
    }

    return { success: true, message: "All LinkedIn accounts and pages disconnected." };
  });

  // POST /api/auth/mock-connect - Enable test account and test company page for instant local demo
  fastify.post("/mock-connect", async (request, reply) => {
    const mockToken = encrypt("mock_linkedin_access_token_demo_mode");
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days

    // 1. Personal Profile
    const existingPersonal = await db.query.socialAccounts.findFirst({
      where: and(
        eq(socialAccounts.platform, "linkedin"),
        eq(socialAccounts.accountId, "mock_person_123456")
      ),
    });

    if (existingPersonal) {
      await db
        .update(socialAccounts)
        .set({
          accountName: "Drex Verified Member (Personal Profile)",
          accountType: "personal",
          accessTokenEncrypted: mockToken,
          tokenExpiresAt: expiresAt,
          status: "connected",
          updatedAt: new Date(),
        })
        .where(eq(socialAccounts.id, existingPersonal.id));
    } else {
      await db.insert(socialAccounts).values({
        platform: "linkedin",
        accountId: "mock_person_123456",
        accountName: "Drex Verified Member (Personal Profile)",
        accountType: "personal",
        accessTokenEncrypted: mockToken,
        tokenExpiresAt: expiresAt,
        status: "connected",
      });
    }

    // 2. Company Page
    const existingOrg = await db.query.socialAccounts.findFirst({
      where: and(
        eq(socialAccounts.platform, "linkedin"),
        eq(socialAccounts.accountId, "mock_org_987654")
      ),
    });

    if (existingOrg) {
      await db
        .update(socialAccounts)
        .set({
          accountName: "Drex Digital Agency (Company Page)",
          accountType: "organization",
          accessTokenEncrypted: mockToken,
          tokenExpiresAt: expiresAt,
          status: "connected",
          updatedAt: new Date(),
        })
        .where(eq(socialAccounts.id, existingOrg.id));
    } else {
      await db.insert(socialAccounts).values({
        platform: "linkedin",
        accountId: "mock_org_987654",
        accountName: "Drex Digital Agency (Company Page)",
        accountType: "organization",
        accessTokenEncrypted: mockToken,
        tokenExpiresAt: expiresAt,
        status: "connected",
      });
    }

    return {
      success: true,
      message: "Test Personal Profile & Test Company Page connected successfully! You can now publish to either target.",
    };
  });
};
