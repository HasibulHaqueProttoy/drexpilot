import type { IPublisher, PublishResult, ContentValidationResult, PostMediaOptions } from "./publisher.interface.js";
import { type SocialAccount, socialAccounts } from "../db/schema.js";
import { decrypt, encrypt } from "../security/crypto.js";
import { db } from "../db/index.js";
import { eq } from "drizzle-orm";
import { env } from "../config/env.js";

let cachedActiveLinkedInVersion: string | null = null;

export function getCandidateLinkedInVersions(): string[] {
  const versions: string[] = [];
  if (process.env.LINKEDIN_API_VERSION) {
    versions.push(process.env.LINKEDIN_API_VERSION);
  }
  if (cachedActiveLinkedInVersion) {
    versions.push(cachedActiveLinkedInVersion);
  }

  const now = new Date();
  // Safe recent active version: 2-3 months prior
  const target = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, "0");
  versions.push(`${y}${m}`);

  // Known recent active stable releases in 2026 / 2025
  versions.push("202606", "202603", "202601", "202512", "202510", "202506");

  return Array.from(new Set(versions));
}

async function downloadMediaBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (url.startsWith("data:")) {
    const matches = url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error("Invalid base64 data URI format");
    }
    const contentType = matches[1];
    const buffer = Buffer.from(matches[2], "base64");
    return { buffer, contentType };
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download media file from URL (${res.status}): ${url}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

async function uploadLinkedInImage(accessToken: string, ownerUrn: string, url: string): Promise<string> {
  const { buffer, contentType } = await downloadMediaBuffer(url);
  const version = getCandidateLinkedInVersions()[0];

  // 1. Initialize image upload
  const initRes = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "LinkedIn-Version": version,
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: ownerUrn,
      },
    }),
  });

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`LinkedIn Image initializeUpload failed (${initRes.status}): ${errText}`);
  }

  const initData = (await initRes.json()) as {
    value?: { uploadUrl?: string; image?: string };
  };

  const uploadUrl = initData.value?.uploadUrl;
  const imageUrn = initData.value?.image;

  if (!uploadUrl || !imageUrn) {
    throw new Error("LinkedIn image initializeUpload did not return uploadUrl or image URN");
  }

  // 2. Upload binary bytes
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType || "image/jpeg",
    },
    body: new Uint8Array(buffer),
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Uploading image binary to LinkedIn failed (${uploadRes.status}): ${errText}`);
  }

  return imageUrn;
}

async function uploadLinkedInDocument(accessToken: string, ownerUrn: string, url: string, title?: string | null): Promise<string> {
  const { buffer } = await downloadMediaBuffer(url);
  const version = getCandidateLinkedInVersions()[0];

  // 1. Initialize document upload
  const initRes = await fetch("https://api.linkedin.com/rest/documents?action=initializeUpload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "LinkedIn-Version": version,
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: ownerUrn,
      },
    }),
  });

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`LinkedIn Document (Carousel) initializeUpload failed (${initRes.status}): ${errText}`);
  }

  const initData = (await initRes.json()) as {
    value?: { uploadUrl?: string; document?: string };
  };

  const uploadUrl = initData.value?.uploadUrl;
  const documentUrn = initData.value?.document;

  if (!uploadUrl || !documentUrn) {
    throw new Error("LinkedIn document initializeUpload did not return uploadUrl or document URN");
  }

  // 2. Upload binary bytes
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/pdf",
    },
    body: new Uint8Array(buffer),
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Uploading PDF document to LinkedIn failed (${uploadRes.status}): ${errText}`);
  }

  return documentUrn;
}

async function uploadLinkedInVideo(accessToken: string, ownerUrn: string, url: string): Promise<string> {
  const { buffer, contentType } = await downloadMediaBuffer(url);
  const version = getCandidateLinkedInVersions()[0];

  // 1. Initialize video upload
  const initRes = await fetch("https://api.linkedin.com/rest/videos?action=initializeUpload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "LinkedIn-Version": version,
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: ownerUrn,
        fileSizeBytes: buffer.length,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    }),
  });

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`LinkedIn Video initializeUpload failed (${initRes.status}): ${errText}`);
  }

  const initData = (await initRes.json()) as {
    value?: {
      uploadInstructions?: Array<{ uploadUrl?: string }>;
      video?: string;
    };
  };

  const uploadUrl = initData.value?.uploadInstructions?.[0]?.uploadUrl;
  const videoUrn = initData.value?.video;

  if (!uploadUrl || !videoUrn) {
    throw new Error("LinkedIn video initializeUpload did not return uploadUrl or video URN");
  }

  // 2. Upload video binary
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType || "video/mp4",
    },
    body: new Uint8Array(buffer),
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Uploading video binary to LinkedIn failed (${uploadRes.status}): ${errText}`);
  }

  return videoUrn;
}

export class LinkedInPublisher implements IPublisher {
  readonly platform = "linkedin";
  private static readonly MAX_CHARACTERS = 3000;
  private static readonly POSTS_ENDPOINT = "https://api.linkedin.com/rest/posts";
  private static readonly TOKEN_ENDPOINT = "https://www.linkedin.com/oauth/v2/accessToken";

  validateContent(content: string, media?: PostMediaOptions): ContentValidationResult {
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

    if (media && media.mediaType && media.mediaType !== "none") {
      if (!media.mediaUrls || media.mediaUrls.length === 0) {
        return {
          valid: false,
          error: `Media type '${media.mediaType}' was specified, but no media URLs were provided.`,
        };
      }
    }

    return { valid: true };
  }

  async publish(account: SocialAccount, content: string, media?: PostMediaOptions): Promise<PublishResult> {
    const validation = this.validateContent(content, media);
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
          mediaType: media?.mediaType || "none",
          mediaUrls: media?.mediaUrls || [],
          timestamp: new Date().toISOString(),
        },
      };
    }

    // Real Official LinkedIn Posts API call (handles personal profiles and company pages)
    const authorUrn = account.accountType === "organization"
      ? `urn:li:organization:${account.accountId}`
      : `urn:li:person:${account.accountId}`;

    // Process Rich Media uploads if present
    let contentPayload: any = undefined;

    if (media && media.mediaType && media.mediaType !== "none" && media.mediaUrls && media.mediaUrls.length > 0) {
      if (media.mediaType === "image") {
        if (media.mediaUrls.length === 1) {
          const imageUrn = await uploadLinkedInImage(accessToken, authorUrn, media.mediaUrls[0]);
          contentPayload = {
            media: {
              id: imageUrn,
              title: media.mediaTitle || undefined,
            },
          };
        } else {
          const imageUrns: string[] = [];
          for (const imgUrl of media.mediaUrls) {
            const urn = await uploadLinkedInImage(accessToken, authorUrn, imgUrl);
            imageUrns.push(urn);
          }
          contentPayload = {
            multiImage: {
              images: imageUrns.map((id) => ({ id })),
            },
          };
        }
      } else if (media.mediaType === "carousel") {
        const documentUrn = await uploadLinkedInDocument(accessToken, authorUrn, media.mediaUrls[0], media.mediaTitle);
        contentPayload = {
          media: {
            id: documentUrn,
            title: media.mediaTitle || "Document / Slide Carousel",
          },
        };
      } else if (media.mediaType === "video") {
        const videoUrn = await uploadLinkedInVideo(accessToken, authorUrn, media.mediaUrls[0]);
        contentPayload = {
          media: {
            id: videoUrn,
            title: media.mediaTitle || undefined,
          },
        };
      }
    }

    const payload: any = {
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

    if (contentPayload) {
      payload.content = contentPayload;
    }

    let response: Response | null = null;
    const versionsToTry = getCandidateLinkedInVersions();

    for (const version of versionsToTry) {
      try {
        response = await fetch(LinkedInPublisher.POSTS_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "LinkedIn-Version": version,
            "X-Restli-Protocol-Version": "2.0.0",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        // If version is sunset / inactive (HTTP 426), try next active candidate
        if (response.status === 426) {
          console.warn(`[LinkedIn API] Version ${version} returned 426 (inactive). Trying next version...`);
          continue;
        }

        // Cache working version
        if (response.ok) {
          cachedActiveLinkedInVersion = version;
        }
        break;
      } catch (networkErr: any) {
        throw new Error(`Network error calling LinkedIn API: ${networkErr.message}`);
      }
    }

    if (!response) {
      throw new Error("Failed to contact LinkedIn API after testing candidate API versions.");
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
