import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "../db/index.js";
import { scheduledPosts, socialAccounts } from "../db/schema.js";
import { eq, desc, and } from "drizzle-orm";
import { PublisherFactory } from "../publishers/publisher.factory.js";
import { schedulePostJob, reschedulePostJob, cancelPostJob } from "../queue/scheduler.js";
import { executePublish } from "../queue/worker.js";
import { getDefaultTimezone } from "../services/settings.service.js";
import { getUpcomingOptimalTimes } from "../services/optimal_time.service.js";
import { env } from "../config/env.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "SMMPilot",
    version: "1.0.0",
  });

  // Tool 1: connect_linkedin
  server.tool(
    "connect_linkedin",
    {},
    async () => {
      const baseUrl = env.FRONTEND_URL || `http://${env.HOST}:${env.PORT}`;
      const authUrl = `${baseUrl.replace(":3000", `:${env.PORT}`)}/api/auth/linkedin`;

      // Check current connection status
      const existing = await db.query.socialAccounts.findFirst({
        where: and(
          eq(socialAccounts.platform, "linkedin"),
          eq(socialAccounts.status, "connected")
        ),
      });

      if (existing) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "already_connected",
                  platform: "linkedin",
                  account_name: existing.accountName,
                  account_id: existing.accountId,
                  message: `LinkedIn is already connected as ${existing.accountName}. To reconnect or switch accounts, visit: ${authUrl}`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "action_required",
                platform: "linkedin",
                auth_url: authUrl,
                message:
                  "Please open the auth_url in your browser to authorize PostPilot with your LinkedIn account. Once authorized, you can schedule and publish posts.",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Tool 2: get_optimal_posting_times
  server.tool(
    "get_optimal_posting_times",
    {
      timezone: z
        .string()
        .optional()
        .describe("IANA timezone, e.g. 'Asia/Dhaka', 'America/New_York'. Defaults to the configured system timezone."),
      count: z
        .number()
        .optional()
        .default(5)
        .describe("Number of upcoming high-engagement time slots to return (default: 5)."),
    },
    async ({ timezone, count }) => {
      const resolvedTz = timezone || (await getDefaultTimezone());
      const slots = getUpcomingOptimalTimes(resolvedTz, count || 5);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                platform: "linkedin",
                timezone: resolvedTz,
                slots,
                recommendation:
                  "Tuesday, Wednesday, and Thursday mornings (8:30 AM - 10:00 AM local time) yield the highest overall professional reach and engagement on LinkedIn.",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Tool 3: schedule_post
  server.tool(
    "schedule_post",
    {
      platform: z.string().describe("Target social media platform. SMMPilot currently supports 'linkedin'."),
      content: z.string().describe("The text content of the post to publish (including emojis, captions, and hashtags)."),
      scheduled_at: z
        .string()
        .optional()
        .describe(
          "ISO 8601 formatted datetime string for when the post should be published (e.g. 2026-11-17T03:00:00Z). If omitted or set to 'optimal', SMMPilot automatically selects the next peak engagement time slot in the user's timezone."
        ),
      timezone: z
        .string()
        .optional()
        .describe("IANA timezone string, e.g. 'Asia/Dhaka', 'America/New_York'. If omitted, default timezone is used."),
      target: z
        .string()
        .optional()
        .describe(
          "Publishing destination: 'personal' for Personal Profile, 'organization' for Company Page, or specific Account Name/ID. Defaults to personal profile."
        ),
      media_type: z
        .enum(["none", "image", "video", "carousel"])
        .default("none")
        .describe(
          "Type of rich media attached: 'none' for text-only, 'image' for single or multiple photos, 'video' for MP4 video, or 'carousel' for PDF document rendered as an interactive LinkedIn slide carousel."
        ),
      media_urls: z
        .array(z.string())
        .optional()
        .describe(
          "Array of image URLs, video URL, or PDF document URL (or base64 data URIs) to attach to the LinkedIn post."
        ),
      media_title: z
        .string()
        .optional()
        .describe("Title for the document / carousel slides or media attachment."),
    },
    async ({ platform, content, scheduled_at, timezone, target, media_type, media_urls, media_title }) => {
      // 1. Platform validation
      const normalizedPlatform = platform.toLowerCase().trim();
      if (normalizedPlatform !== "linkedin") {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Unsupported platform '${platform}'. SMMPilot currently supports 'linkedin'.`,
            },
          ],
        };
      }

      // 2. Validate publisher & content
      const publisher = PublisherFactory.getPublisher(normalizedPlatform);
      const validation = publisher.validateContent(content, {
        mediaType: media_type,
        mediaUrls: media_urls,
        mediaTitle: media_title,
      });
      if (!validation.valid) {
        return {
          isError: true,
          content: [{ type: "text", text: `Content validation error: ${validation.error}` }],
        };
      }

      // 3. Validate timezone
      const resolvedTz = timezone || (await getDefaultTimezone());
      try {
        Intl.DateTimeFormat(undefined, { timeZone: resolvedTz });
      } catch {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Invalid IANA timezone identifier: '${resolvedTz}'. Examples: 'Asia/Dhaka', 'UTC', 'America/New_York'.`,
            },
          ],
        };
      }

      // 4. Validate or compute scheduled date
      let scheduledDate: Date;
      let slotInfo: any = null;

      if (!scheduled_at || scheduled_at.toLowerCase() === "optimal") {
        const optimalSlots = getUpcomingOptimalTimes(resolvedTz, 1);
        if (optimalSlots.length === 0) {
          scheduledDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
        } else {
          scheduledDate = new Date(optimalSlots[0].iso);
          slotInfo = optimalSlots[0];
        }
      } else {
        scheduledDate = new Date(scheduled_at);
        if (isNaN(scheduledDate.getTime())) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Invalid date format for 'scheduled_at': '${scheduled_at}'. Please supply a valid ISO 8601 timestamp or 'optimal'.`,
              },
            ],
          };
        }

        const now = new Date();
        if (scheduledDate.getTime() <= now.getTime()) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Scheduled time must be in the future. Given: ${scheduledDate.toISOString()}, Current UTC: ${now.toISOString()}.`,
              },
            ],
          };
        }
      }

      // 5. Confirm LinkedIn is connected and resolve target profile/page
      let account = null;
      if (target) {
        const lowerTarget = target.toLowerCase().trim();
        const accounts = await db.query.socialAccounts.findMany({
          where: and(
            eq(socialAccounts.platform, normalizedPlatform),
            eq(socialAccounts.status, "connected")
          ),
        });

        if (lowerTarget === "organization" || lowerTarget === "page" || lowerTarget === "company") {
          account = accounts.find((a) => a.accountType === "organization") || null;
        } else if (lowerTarget === "personal" || lowerTarget === "profile") {
          account = accounts.find((a) => a.accountType === "personal") || null;
        } else {
          account =
            accounts.find(
              (a) =>
                a.accountName.toLowerCase().includes(lowerTarget) ||
                a.accountId === target ||
                a.id === target
            ) || null;
        }
      }

      if (!account) {
        account = await db.query.socialAccounts.findFirst({
          where: and(
            eq(socialAccounts.platform, normalizedPlatform),
            eq(socialAccounts.status, "connected")
          ),
        });
      }

      if (!account) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "LinkedIn account is not connected. Use the 'connect_linkedin' tool first to connect your account.",
            },
          ],
        };
      }

      // 6. Insert post into database
      const [post] = await db
        .insert(scheduledPosts)
        .values({
          socialAccountId: account.id,
          platform: normalizedPlatform,
          content,
          scheduledAt: scheduledDate,
          timezone: resolvedTz,
          mediaType: media_type || "none",
          mediaUrls: media_urls || [],
          mediaTitle: media_title || null,
          status: "scheduled",
        })
        .returning();

      // 7. Enqueue publishing job in pg-boss
      await schedulePostJob(post.id, scheduledDate);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                post_id: post.id,
                platform: post.platform,
                status: post.status,
                scheduled_at_utc: post.scheduledAt.toISOString(),
                local_time: slotInfo ? slotInfo.localFormatted : undefined,
                optimal_engagement_window: slotInfo ? slotInfo.reason : undefined,
                timezone: post.timezone,
                content_preview: post.content.length > 80 ? post.content.substring(0, 80) + "..." : post.content,
                account_name: account.accountName,
                account_type: account.accountType,
                media_type: post.mediaType,
                media_count: post.mediaUrls?.length || 0,
                message: slotInfo
                  ? `Post successfully scheduled for the next optimal LinkedIn window: ${slotInfo.localFormatted} (${slotInfo.reason}).`
                  : `Post successfully scheduled for ${scheduledDate.toISOString()} on LinkedIn (${account.accountName}).`,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Tool 3: publish_post_now
  server.tool(
    "publish_post_now",
    {
      platform: z.string().describe("Target social media platform. MVP currently supports 'linkedin'."),
      content: z.string().describe("The text content of the post to publish immediately."),
      target: z
        .string()
        .optional()
        .describe(
          "Publishing destination: 'personal' for Personal Profile, 'organization' for Company Page, or specific Account Name/ID."
        ),
      media_type: z
        .enum(["none", "image", "video", "carousel"])
        .default("none")
        .describe(
          "Type of rich media attached: 'none' for text-only, 'image' for photo(s), 'video' for MP4 video, or 'carousel' for PDF document."
        ),
      media_urls: z
        .array(z.string())
        .optional()
        .describe("Array of image URLs, video URL, or PDF document URL (or base64 data URIs)."),
      media_title: z
        .string()
        .optional()
        .describe("Title for the document / carousel slides or media attachment."),
    },
    async ({ platform, content, target, media_type, media_urls, media_title }) => {
      const normalizedPlatform = platform.toLowerCase().trim();
      if (normalizedPlatform !== "linkedin") {
        return {
          isError: true,
          content: [{ type: "text", text: `Unsupported platform '${platform}'. MVP supports 'linkedin'.` }],
        };
      }

      const publisher = PublisherFactory.getPublisher(normalizedPlatform);
      const validation = publisher.validateContent(content, {
        mediaType: media_type,
        mediaUrls: media_urls,
        mediaTitle: media_title,
      });
      if (!validation.valid) {
        return {
          isError: true,
          content: [{ type: "text", text: `Content validation error: ${validation.error}` }],
        };
      }

      // Check account and resolve target
      const accounts = await db.query.socialAccounts.findMany({
        where: and(
          eq(socialAccounts.platform, normalizedPlatform),
          eq(socialAccounts.status, "connected")
        ),
      });

      let account = null;
      if (target) {
        const lowerTarget = target.toLowerCase().trim();
        if (lowerTarget === "organization" || lowerTarget === "page" || lowerTarget === "company") {
          account = accounts.find((a) => a.accountType === "organization") || null;
        } else if (lowerTarget === "personal" || lowerTarget === "profile") {
          account = accounts.find((a) => a.accountType === "personal") || null;
        } else {
          account =
            accounts.find(
              (a) =>
                a.accountName.toLowerCase().includes(lowerTarget) ||
                a.accountId === target ||
                a.id === target
            ) || null;
        }
      }

      if (!account) {
        account = accounts[0] || null;
      }

      if (!account) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "LinkedIn account is not connected. Use 'connect_linkedin' tool first to connect your account.",
            },
          ],
        };
      }

      // Insert scheduled post record with status 'publishing'
      const [post] = await db
        .insert(scheduledPosts)
        .values({
          socialAccountId: account.id,
          platform: normalizedPlatform,
          content,
          scheduledAt: new Date(),
          timezone: await getDefaultTimezone(),
          mediaType: media_type || "none",
          mediaUrls: media_urls || [],
          mediaTitle: media_title || null,
          status: "scheduled",
        })
        .returning();

      // Execute publish immediately
      try {
        const result = await executePublish(post.id);
        if (!result.success) {
          return {
            isError: true,
            content: [{ type: "text", text: `Failed to publish post: ${result.error}` }],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  post_id: post.id,
                  status: "published",
                  external_post_id: result.externalPostId,
                  message: "Post successfully published to LinkedIn immediately.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Publish error: ${err.message}` }],
        };
      }
    }
  );

  // Tool 4: list_scheduled_posts
  server.tool(
    "list_scheduled_posts",
    {
      status: z
        .enum(["all", "scheduled", "publishing", "published", "failed", "cancelled"])
        .optional()
        .describe("Filter posts by status. Defaults to 'scheduled'."),
      limit: z.coerce.number().min(1).max(100).optional().default(20),
    },
    async ({ status, limit }) => {
      const targetStatus = status || "scheduled";

      const queryConditions = targetStatus === "all" ? undefined : eq(scheduledPosts.status, targetStatus);

      const posts = await db.query.scheduledPosts.findMany({
        where: queryConditions,
        orderBy: [desc(scheduledPosts.scheduledAt)],
        limit,
        with: { account: true },
      });

      const formatted = posts.map((p) => ({
        id: p.id,
        platform: p.platform,
        account_name: p.account?.accountName || "Unknown",
        status: p.status,
        content_preview: p.content.length > 100 ? p.content.substring(0, 100) + "..." : p.content,
        scheduled_at_utc: p.scheduledAt.toISOString(),
        timezone: p.timezone,
        media_type: p.mediaType,
        media_urls: p.mediaUrls,
        media_title: p.mediaTitle,
        published_at: p.publishedAt ? p.publishedAt.toISOString() : null,
        external_post_id: p.externalPostId,
        error_message: p.errorMessage,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                count: formatted.length,
                filter_status: targetStatus,
                posts: formatted,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Tool 5: update_scheduled_post
  server.tool(
    "update_scheduled_post",
    {
      post_id: z.string().describe("ID of the scheduled post to update."),
      content: z.string().optional().describe("New text content for the post."),
      scheduled_at: z.string().optional().describe("New ISO 8601 publishing time."),
      timezone: z.string().optional().describe("New IANA timezone identifier."),
      media_type: z.enum(["none", "image", "video", "carousel"]).optional().describe("New media type."),
      media_urls: z.array(z.string()).optional().describe("New media URLs."),
      media_title: z.string().optional().describe("New media title."),
    },
    async ({ post_id, content, scheduled_at, timezone, media_type, media_urls, media_title }) => {
      const post = await db.query.scheduledPosts.findFirst({
        where: eq(scheduledPosts.id, post_id),
      });

      if (!post) {
        return {
          isError: true,
          content: [{ type: "text", text: `Post with ID '${post_id}' not found.` }],
        };
      }

      if (post.status !== "scheduled") {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Cannot update post with status '${post.status}'. Only posts with status 'scheduled' can be updated.`,
            },
          ],
        };
      }

      const updates: Partial<typeof scheduledPosts.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (content !== undefined) {
        const publisher = PublisherFactory.getPublisher(post.platform);
        const val = publisher.validateContent(content);
        if (!val.valid) {
          return {
            isError: true,
            content: [{ type: "text", text: `Content validation error: ${val.error}` }],
          };
        }
        updates.content = content;
      }

      if (timezone !== undefined) {
        try {
          Intl.DateTimeFormat(undefined, { timeZone: timezone });
          updates.timezone = timezone;
        } catch {
          return {
            isError: true,
            content: [{ type: "text", text: `Invalid IANA timezone identifier: '${timezone}'` }],
          };
        }
      }

      if (media_type !== undefined) {
        updates.mediaType = media_type;
      }
      if (media_urls !== undefined) {
        updates.mediaUrls = media_urls;
      }
      if (media_title !== undefined) {
        updates.mediaTitle = media_title;
      }

      let newDate: Date | null = null;
      if (scheduled_at !== undefined) {
        newDate = new Date(scheduled_at);
        if (isNaN(newDate.getTime())) {
          return {
            isError: true,
            content: [{ type: "text", text: `Invalid date format: '${scheduled_at}'.` }],
          };
        }
        if (newDate.getTime() <= Date.now()) {
          return {
            isError: true,
            content: [{ type: "text", text: "New scheduled time must be in the future." }],
          };
        }
        updates.scheduledAt = newDate;
      }

      // Update in database
      const [updated] = await db
        .update(scheduledPosts)
        .set(updates)
        .where(eq(scheduledPosts.id, post_id))
        .returning();

      // If scheduled time changed, reschedule job in pg-boss
      if (newDate) {
        await reschedulePostJob(post_id, newDate);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                post_id: updated.id,
                content: updated.content,
                scheduled_at_utc: updated.scheduledAt.toISOString(),
                timezone: updated.timezone,
                status: updated.status,
                message: "Post updated successfully.",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Tool 6: cancel_scheduled_post
  server.tool(
    "cancel_scheduled_post",
    {
      post_id: z.string().describe("ID of the scheduled post to cancel."),
    },
    async ({ post_id }) => {
      const post = await db.query.scheduledPosts.findFirst({
        where: eq(scheduledPosts.id, post_id),
      });

      if (!post) {
        return {
          isError: true,
          content: [{ type: "text", text: `Post with ID '${post_id}' not found.` }],
        };
      }

      if (post.status === "published") {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Cannot cancel a post that has already been published to LinkedIn.",
            },
          ],
        };
      }

      if (post.status === "cancelled") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  post_id,
                  status: "cancelled",
                  message: "Post is already cancelled.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      await cancelPostJob(post_id, true);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                post_id,
                status: "cancelled",
                message: "Scheduled post was successfully cancelled.",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Tool 7: list_connected_targets
  server.tool(
    "list_connected_targets",
    {},
    async () => {
      const accounts = await db.query.socialAccounts.findMany({
        where: eq(socialAccounts.status, "connected"),
      });

      const targets = accounts.map((a) => ({
        id: a.id,
        platform: a.platform,
        account_name: a.accountName,
        account_type: a.accountType, // 'personal' or 'organization'
        account_id: a.accountId,
        status: a.status,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total_connected: targets.length,
                personal_profiles: targets.filter((t) => t.account_type === "personal"),
                company_pages: targets.filter((t) => t.account_type === "organization"),
                targets,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  return server;
}
