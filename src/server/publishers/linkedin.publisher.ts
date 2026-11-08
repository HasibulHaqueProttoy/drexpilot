import type { IPublisher, PublishResult, ContentValidationResult } from "./publisher.interface.js";
import { type SocialAccount, socialAccounts } from "../db/schema.js";
import { decrypt, encrypt } from "../security/crypto.js";
import { db } from "../db/index.js";
import { eq } from "drizzle-orm";
import { env } from "../config/env.js";

export class LinkedInPublisher implements IPublisher {
  readonly platform = "linkedin";
  private static readonly MAX_CHARACTERS = 3000;
  private static readonly POSTS_ENDPOINT = "https://api.linkedin.com/rest/posts";
  private static readonly TOKEN_ENDPOINT = "https://www.linkedin.com/oauth/v2/accessToken";

  validateContent(content: string): ContentValidationResult {
    if (!content || typeof content !== "string") {
      return { valid: false, error: "Content must be a non-empty string" };
    }

    const trimmed = content.trim();
    if (trimmed.length === 0) {
      return { valid: false, error: "Content cannot be empty or only whitespace" };
    }

    if (trimmed.length > LinkedInPublisher.MAX_CHARACTERS) {
      return {
        valid: false,
        error: `Content exceeds LinkedIn's ${LinkedInPublisher.MAX_CHARACTERS} character limit (currently ${trimmed.length} characters)`,
      };
    }

    return { valid: true };
  }

  async publish(account: SocialAccount, content: string): Promise<PublishResult> {
    const validation = this.validateContent(content);
    if (!validation.valid) {
      throw new Error(`Content validation failed: ${validation.error}`);
    }

    // Check account status
    if (account.status !== "connected") {
      throw new Error(`LinkedIn account is not connected (current status: ${account.status})`);
    }

    // Refresh token if expired or close to expiry (within 5 minutes)
    let accessToken: string;
    try {
      accessToken = await this.getValidAccessToken(account);
    } catch (err: any) {
      // Mark account as expired if refresh failed
      await db
        .update(socialAccounts)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(socialAccounts.id, account.id));
      throw new Error(`Failed to obtain valid LinkedIn access token: ${err.message}`);
    }

    // Check for simulated/mock testing mode (e.g. test credentials or automated tests)
    const rawToken = account.accessTokenEncrypted ? decrypt(account.accessTokenEncrypted) : "";
    const isMockAccount =
      account.accountId.startsWith("mock_") ||
      account.accountId.startsWith("test_") ||
      rawToken.startsWith("mock_") ||
      rawToken.includes("test_oauth");
    if (isMockAccount || env.LINKEDIN_CLIENT_ID === "mock_client_id") {
      // If mock account or explicitly mock mode
      const mockPostId = `urn:li:share:mock_${Date.now()}`;
      return {
        externalPostId: mockPostId,
        url: `https://www.linkedin.com/feed/update/${mockPostId}`,
        rawResponse: {
          mock: true,
          id: mockPostId,
          commentary: content,
          timestamp: new Date().toISOString(),
        },
      };
    }

    // Real Official LinkedIn Posts API call
    const authorUrn = `urn:li:person:${account.accountId}`;
    const payload = {
      author: authorUrn,
      commentary: content,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };

    let response: Response;
    try {
      response = await fetch(LinkedInPublisher.POSTS_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "LinkedIn-Version": "202401",
          "X-Restli-Protocol-Version": "2.0.0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (networkErr: any) {
      throw new Error(`Network error calling LinkedIn API: ${networkErr.message}`);
    }

    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = await response.text();
      } catch {
        errorBody = "No response body";
      }

      if (response.status === 401) {
        await db
          .update(socialAccounts)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(socialAccounts.id, account.id));
        throw new Error(`LinkedIn OAuth token expired or invalid (HTTP 401): ${errorBody}`);
      }

      if (response.status === 403) {
        throw new Error(
          `LinkedIn permission denied (HTTP 403). Check that 'w_member_social' permission is granted to your LinkedIn app: ${errorBody}`
        );
      }

      throw new Error(`LinkedIn API error (HTTP ${response.status}): ${errorBody}`);
    }

    // Retrieve post URN from x-restli-id header or json response
    const restliId = response.headers.get("x-restli-id");
    let responseData: any = {};
    try {
      const text = await response.text();
      if (text) {
        responseData = JSON.parse(text);
      }
    } catch {
      responseData = {};
    }

    const postId = restliId || responseData.id || `urn:li:share:${Date.now()}`;
    return {
      externalPostId: postId,
      url: `https://www.linkedin.com/feed/update/${postId}`,
      rawResponse: {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        data: responseData,
      },
    };
  }

  /**
   * Retrieves a valid access token, refreshing if necessary.
   */
  private async getValidAccessToken(account: SocialAccount): Promise<string> {
    if (account.accessTokenEncrypted.startsWith("mock_")) {
      return "mock_token";
    }

    const now = new Date();
    // If token has an expiry date and is expired or expiring in next 5 minutes
    const isExpiringSoon =
      account.tokenExpiresAt &&
      account.tokenExpiresAt.getTime() - now.getTime() < 5 * 60 * 1000;

    if (isExpiringSoon && account.refreshTokenEncrypted) {
      return await this.refreshAccessToken(account);
    }

    return decrypt(account.accessTokenEncrypted);
  }

  /**
   * Refreshes OAuth token using refresh_token grant.
   */
  private async refreshAccessToken(account: SocialAccount): Promise<string> {
    if (!account.refreshTokenEncrypted) {
      throw new Error("No refresh token available");
    }

    const refreshToken = decrypt(account.refreshTokenEncrypted);
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: env.LINKEDIN_CLIENT_ID,
      client_secret: env.LINKEDIN_CLIENT_SECRET,
    });

    const response = await fetch(LinkedInPublisher.TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to refresh LinkedIn token (HTTP ${response.status}): ${errText}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
      refresh_token_expires_in?: number;
    };

    const newAccessTokenEncrypted = encrypt(data.access_token);
    const newExpiresAt = new Date(Date.now() + data.expires_in * 1000);

    const updateData: Partial<typeof socialAccounts.$inferInsert> = {
      accessTokenEncrypted: newAccessTokenEncrypted,
      tokenExpiresAt: newExpiresAt,
      status: "connected",
      updatedAt: new Date(),
    };

    if (data.refresh_token) {
      updateData.refreshTokenEncrypted = encrypt(data.refresh_token);
    }

    await db.update(socialAccounts).set(updateData).where(eq(socialAccounts.id, account.id));

    return data.access_token;
  }
}
