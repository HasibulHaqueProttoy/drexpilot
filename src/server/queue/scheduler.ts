import { getBoss, PUBLISH_QUEUE } from "./boss.js";
import { db } from "../db/index.js";
import { scheduledPosts, publishingLogs } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";

export async function schedulePostJob(postId: string, scheduledAt: Date): Promise<string | null> {
  const boss = getBoss();
  
  // Calculate delay in seconds for robustness
  const delaySeconds = Math.max(0, Math.ceil((scheduledAt.getTime() - Date.now()) / 1000));

  const jobId = await boss.send(
    PUBLISH_QUEUE,
    { postId },
    {
      startAfter: delaySeconds,
      singletonKey: `post_${postId}`,
      retryLimit: 3,
      retryBackoff: true,
      retryDelay: 60,
      expireInSeconds: 300,
    }
  );

  await db.insert(publishingLogs).values({
    postId,
    event: "job_created",
    response: JSON.stringify({
      jobId,
      scheduledAt: scheduledAt.toISOString(),
      delaySeconds,
      queue: PUBLISH_QUEUE,
    }),
  });

  return jobId;
}

export async function reschedulePostJob(postId: string, newScheduledAt: Date): Promise<string | null> {
  const boss = getBoss();

  try {
    await cancelPostJob(postId, false);
  } catch (err) {
    console.warn(`[Scheduler] Could not cancel existing job for post ${postId}:`, err);
  }

  const delaySeconds = Math.max(0, Math.ceil((newScheduledAt.getTime() - Date.now()) / 1000));

  const jobId = await boss.send(
    PUBLISH_QUEUE,
    { postId },
    {
      startAfter: delaySeconds,
      singletonKey: `post_${postId}`,
      retryLimit: 3,
      retryBackoff: true,
      retryDelay: 60,
      expireInSeconds: 300,
    }
  );

  await db.insert(publishingLogs).values({
    postId,
    event: "rescheduled",
    response: JSON.stringify({
      jobId,
      newScheduledAt: newScheduledAt.toISOString(),
      delaySeconds,
    }),
  });

  return jobId;
}

export async function cancelPostJob(postId: string, updateDbStatus = true): Promise<void> {
  if (updateDbStatus) {
    await db
      .update(scheduledPosts)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(scheduledPosts.id, postId),
          sql`${scheduledPosts.status} NOT IN ('published')`
        )
      );

    await db.insert(publishingLogs).values({
      postId,
      event: "cancelled",
      response: JSON.stringify({
        cancelledAt: new Date().toISOString(),
      }),
    });
  }
}

export async function recoverPendingJobs(): Promise<void> {
  console.log("[Scheduler] Checking for pending scheduled jobs to recover...");
  const boss = getBoss();

  const pendingPosts = await db.query.scheduledPosts.findMany({
    where: eq(scheduledPosts.status, "scheduled"),
  });

  const now = new Date();
  let recoveredCount = 0;

  for (const post of pendingPosts) {
    try {
      const scheduledTime = new Date(post.scheduledAt);
      const delaySeconds = Math.max(0, Math.ceil((scheduledTime.getTime() - now.getTime()) / 1000));

      console.log(
        `[Scheduler] Re-queuing job for post ${post.id}, scheduled at: ${scheduledTime.toISOString()} (delay: ${delaySeconds}s)`
      );

      await boss.send(
        PUBLISH_QUEUE,
        { postId: post.id },
        {
          startAfter: delaySeconds,
          singletonKey: `post_${post.id}`,
          retryLimit: 3,
          retryBackoff: true,
          retryDelay: 60,
        }
      );
      recoveredCount++;
    } catch (err) {
      console.error(`[Scheduler] Failed to recover job for post ${post.id}:`, err);
    }
  }

  console.log(`[Scheduler] Successfully recovered ${recoveredCount} pending post jobs.`);
}
