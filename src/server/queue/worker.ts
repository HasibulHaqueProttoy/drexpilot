import { getBoss, PUBLISH_QUEUE } from "./boss.js";
import { db } from "../db/index.js";
import { scheduledPosts, publishingLogs, socialAccounts } from "../db/schema.js";
import { eq, and, inArray } from "drizzle-orm";
import { PublisherFactory } from "../publishers/publisher.factory.js";

export interface PublishJobData {
  postId: string;
}

export async function registerPublishWorker(): Promise<void> {
  const boss = getBoss();

  await boss.work<PublishJobData>(PUBLISH_QUEUE, { batchSize: 5, pollingIntervalSeconds: 1 }, async (jobs) => {
    for (const job of jobs) {
      const { postId } = job.data;
      console.log(`[Worker] Processing publishing job for post: ${postId} (Job ID: ${job.id})`);

      try {
        await executePublish(postId, job.id);
      } catch (err: any) {
        console.error(`[Worker] Error executing publish job for post ${postId}:`, err);
        throw err; // pg-boss will handle retry according to backoff configuration
      }
    }
  });

  console.log("Publishing worker registered on queue:", PUBLISH_QUEUE);
}

/**
 * Idempotently executes the publishing of a post.
 */
export async function executePublish(postId: string, jobId?: string): Promise<{ success: boolean; externalPostId?: string; error?: string }> {
  // 1. Fetch current post and connected account
  const post = await db.query.scheduledPosts.findFirst({
    where: eq(scheduledPosts.id, postId),
    with: { account: true },
  });

  if (!post) {
    console.warn(`[Worker] Post ${postId} not found in database. Skipping.`);
    return { success: false, error: "Post not found" };
  }

  // Idempotency: if already published or cancelled, abort
  if (post.status === "published") {
    console.log(`[Worker] Post ${postId} is already published. Skipping.`);
    return { success: true, externalPostId: post.externalPostId || undefined };
  }

  if (post.status === "cancelled") {
    console.log(`[Worker] Post ${postId} was cancelled. Skipping.`);
    return { success: false, error: "Post is cancelled" };
  }

  // Concurrency control: Atomic update to 'publishing' status
  const updated = await db
    .update(scheduledPosts)
    .set({
      status: "publishing",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(scheduledPosts.id, postId),
        inArray(scheduledPosts.status, ["scheduled", "failed"])
      )
    )
    .returning();

  if (updated.length === 0) {
    console.warn(`[Worker] Post ${postId} is already being processed or status changed.`);
    return { success: false, error: "Post is already being processed" };
  }

  // 2. Record publish attempt
  await db.insert(publishingLogs).values({
    postId,
    event: "publish_attempt",
    response: JSON.stringify({
      jobId,
      timestamp: new Date().toISOString(),
      platform: post.platform,
    }),
  });

  // 3. Check account
  const account = post.account;
  if (!account || account.status !== "connected") {
    const errorMsg = `Social account (${post.platform}) is not connected or disconnected.`;
    await markPostFailed(postId, errorMsg);
    return { success: false, error: errorMsg };
  }

  // 4. Resolve publisher
  try {
    const publisher = PublisherFactory.getPublisher(post.platform);

    // 5. Execute publish with optional rich media
    const result = await publisher.publish(account, post.content, {
      mediaType: (post.mediaType as any) || "none",
      mediaUrls: post.mediaUrls || [],
      mediaTitle: post.mediaTitle,
    });

    // 6. Update database on success
    const now = new Date();
    await db
      .update(scheduledPosts)
      .set({
        status: "published",
        externalPostId: result.externalPostId,
        publishedAt: now,
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(scheduledPosts.id, postId));

    // Log success
    await db.insert(publishingLogs).values({
      postId,
      event: "publish_success",
      response: JSON.stringify({
        externalPostId: result.externalPostId,
        url: result.url,
        publishedAt: now.toISOString(),
      }),
    });

    console.log(`[Worker] Post ${postId} successfully published! External ID: ${result.externalPostId}`);
    return { success: true, externalPostId: result.externalPostId };
  } catch (publishErr: any) {
    const errorMsg = publishErr.message || String(publishErr);
    await markPostFailed(postId, errorMsg);
    throw publishErr;
  }
}

async function markPostFailed(postId: string, errorMessage: string) {
  const now = new Date();
  await db
    .update(scheduledPosts)
    .set({
      status: "failed",
      errorMessage,
      updatedAt: now,
    })
    .where(eq(scheduledPosts.id, postId));

  await db.insert(publishingLogs).values({
    postId,
    event: "publish_failed",
    response: JSON.stringify({
      error: errorMessage,
      failedAt: now.toISOString(),
    }),
  });
}
