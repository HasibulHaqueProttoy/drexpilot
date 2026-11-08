import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { scheduledPosts, socialAccounts, publishingLogs } from "../db/schema.js";
import { eq, desc, asc, and, count, sql } from "drizzle-orm";
import { PublisherFactory } from "../publishers/publisher.factory.js";
import { schedulePostJob, reschedulePostJob, cancelPostJob } from "../queue/scheduler.js";
import { executePublish } from "../queue/worker.js";
import { getDefaultTimezone } from "../services/settings.service.js";

const createPostSchema = z.object({
  platform: z.string().default("linkedin"),
  content: z.string().min(1),
  scheduled_at: z.string(),
  timezone: z.string().optional(),
});

const updatePostSchema = z.object({
  content: z.string().min(1).optional(),
  scheduled_at: z.string().optional(),
  timezone: z.string().optional(),
});

export const postsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/posts - List posts and dashboard metrics
  fastify.get("/", async (request, reply) => {
    const query = request.query as { status?: string; limit?: string; order?: string };
    const limit = Math.min(Math.max(parseInt(query.limit || "50", 10) || 50, 1), 100);
    const orderDirection = query.order === "desc" ? desc(scheduledPosts.scheduledAt) : asc(scheduledPosts.scheduledAt);

    // Calculate dashboard statistics
    const statsQuery = await db
      .select({
        status: scheduledPosts.status,
        count: count(),
      })
      .from(scheduledPosts)
      .groupBy(scheduledPosts.status);

    const stats = {
      scheduled: 0,
      published: 0,
      failed: 0,
      cancelled: 0,
      total: 0,
    };

    for (const s of statsQuery) {
      if (s.status in stats) {
        stats[s.status as keyof typeof stats] = Number(s.count);
      }
      stats.total += Number(s.count);
    }

    // Fetch posts with connected account
    const conditions = query.status && query.status !== "all" ? eq(scheduledPosts.status, query.status) : undefined;

    const posts = await db.query.scheduledPosts.findMany({
      where: conditions,
      orderBy: [orderDirection],
      limit,
      with: {
        account: {
          columns: {
            id: true,
            accountName: true,
            platform: true,
            status: true,
          },
        },
      },
    });

    return {
      stats,
      posts,
    };
  });

  // POST /api/posts - Schedule new post via dashboard
  fastify.post("/", async (request, reply) => {
    const parseResult = createPostSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.code(400).send({ error: "Validation failed", details: parseResult.error.format() });
      return;
    }

    const { platform, content, scheduled_at, timezone } = parseResult.data;
    const publisher = PublisherFactory.getPublisher(platform);
    const validation = publisher.validateContent(content);
    if (!validation.valid) {
      reply.code(400).send({ error: validation.error });
      return;
    }

    const resolvedTz = timezone || (await getDefaultTimezone());
    const scheduledDate = new Date(scheduled_at);
    if (isNaN(scheduledDate.getTime())) {
      reply.code(400).send({ error: "Invalid scheduled_at date" });
      return;
    }

    if (scheduledDate.getTime() <= Date.now()) {
      reply.code(400).send({ error: "Scheduled time must be in the future" });
      return;
    }

    const account = await db.query.socialAccounts.findFirst({
      where: and(eq(socialAccounts.platform, platform), eq(socialAccounts.status, "connected")),
    });

    if (!account) {
      reply.code(400).send({ error: `${platform} account is not connected. Please connect your account first.` });
      return;
    }

    const [post] = await db
      .insert(scheduledPosts)
      .values({
        socialAccountId: account.id,
        platform,
        content,
        scheduledAt: scheduledDate,
        timezone: resolvedTz,
        status: "scheduled",
      })
      .returning();

    await schedulePostJob(post.id, scheduledDate);

    reply.code(201).send({
      success: true,
      post,
    });
  });

  // POST /api/posts/:id/publish-now - Publish immediately
  fastify.post("/:id/publish-now", async (request, reply) => {
    const { id } = request.params as { id: string };

    const post = await db.query.scheduledPosts.findFirst({
      where: eq(scheduledPosts.id, id),
    });

    if (!post) {
      reply.code(404).send({ error: "Post not found" });
      return;
    }

    if (post.status === "published") {
      reply.code(400).send({ error: "Post is already published" });
      return;
    }

    try {
      const result = await executePublish(id);
      if (!result.success) {
        reply.code(400).send({ error: result.error || "Failed to publish post" });
        return;
      }

      const updated = await db.query.scheduledPosts.findFirst({
        where: eq(scheduledPosts.id, id),
      });

      return {
        success: true,
        post: updated,
        message: "Post published immediately to LinkedIn.",
      };
    } catch (err: any) {
      reply.code(500).send({ error: err.message || "Failed to publish post" });
    }
  });

  // PATCH /api/posts/:id - Edit scheduled post
  fastify.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = updatePostSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.code(400).send({ error: "Validation failed", details: parseResult.error.format() });
      return;
    }

    const post = await db.query.scheduledPosts.findFirst({
      where: eq(scheduledPosts.id, id),
    });

    if (!post) {
      reply.code(404).send({ error: "Post not found" });
      return;
    }

    if (post.status !== "scheduled") {
      reply.code(400).send({ error: `Cannot edit post in '${post.status}' status.` });
      return;
    }

    const { content, scheduled_at, timezone } = parseResult.data;
    const updates: Partial<typeof scheduledPosts.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (content !== undefined) {
      const publisher = PublisherFactory.getPublisher(post.platform);
      const val = publisher.validateContent(content);
      if (!val.valid) {
        reply.code(400).send({ error: val.error });
        return;
      }
      updates.content = content;
    }

    if (timezone !== undefined) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
        updates.timezone = timezone;
      } catch {
        reply.code(400).send({ error: `Invalid timezone '${timezone}'` });
        return;
      }
    }

    let newDate: Date | null = null;
    if (scheduled_at !== undefined) {
      newDate = new Date(scheduled_at);
      if (isNaN(newDate.getTime()) || newDate.getTime() <= Date.now()) {
        reply.code(400).send({ error: "Scheduled date must be a valid future timestamp." });
        return;
      }
      updates.scheduledAt = newDate;
    }

    const [updated] = await db.update(scheduledPosts).set(updates).where(eq(scheduledPosts.id, id)).returning();

    if (newDate) {
      await reschedulePostJob(id, newDate);
    }

    return {
      success: true,
      post: updated,
    };
  });

  // DELETE /api/posts/:id - Cancel scheduled post
  fastify.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const post = await db.query.scheduledPosts.findFirst({
      where: eq(scheduledPosts.id, id),
    });

    if (!post) {
      reply.code(404).send({ error: "Post not found" });
      return;
    }

    if (post.status === "published") {
      reply.code(400).send({ error: "Cannot cancel a post that is already published." });
      return;
    }

    await cancelPostJob(id, true);

    return {
      success: true,
      message: "Post cancelled successfully.",
    };
  });

  // GET /api/posts/:id/logs - Get publishing logs for post
  fastify.get("/:id/logs", async (request, reply) => {
    const { id } = request.params as { id: string };

    const logs = await db.query.publishingLogs.findMany({
      where: eq(publishingLogs.postId, id),
      orderBy: [desc(publishingLogs.createdAt)],
    });

    return { logs };
  });
};
