import { db } from "../server/db/index.js";
import { scheduledPosts, socialAccounts } from "../server/db/schema.js";
import { eq } from "drizzle-orm";
import { schedulePostJob } from "../server/queue/scheduler.js";
import { startBoss } from "../server/queue/boss.js";

async function testWorkerExecution() {
  console.log("=== Testing Automatic Background Publishing via pg-boss ===");
  await startBoss();

  const account = await db.query.socialAccounts.findFirst({
    where: eq(socialAccounts.platform, "linkedin"),
  });

  if (!account) {
    throw new Error("No linkedin account found");
  }

  // Schedule a post 2 seconds in the future
  const publishTime = new Date(Date.now() + 2000);
  const [post] = await db
    .insert(scheduledPosts)
    .values({
      socialAccountId: account.id,
      platform: "linkedin",
      content: "Automated pg-boss worker verification post - published on time!",
      scheduledAt: publishTime,
      timezone: "Asia/Dhaka",
      status: "scheduled",
    })
    .returning();

  console.log(`Created scheduled post ${post.id}, scheduled for ${publishTime.toISOString()}`);
  await schedulePostJob(post.id, publishTime);
  console.log("pg-boss job enqueued. Waiting 5 seconds for worker pickup and execution...");

  await new Promise((resolve) => setTimeout(resolve, 5000));

  const updatedPost = await db.query.scheduledPosts.findFirst({
    where: eq(scheduledPosts.id, post.id),
  });

  console.log(`Post status after wait: ${updatedPost?.status}`);
  console.log(`External Post ID: ${updatedPost?.externalPostId}`);
  console.log(`Published At: ${updatedPost?.publishedAt?.toISOString()}`);

  if (updatedPost?.status === "published" && updatedPost?.externalPostId) {
    console.log("✓ SUCCESS: Post was automatically published by background worker!");
    process.exit(0);
  } else {
    console.error("✗ FAILED: Post was not published automatically. Current status:", updatedPost?.status);
    process.exit(1);
  }
}

testWorkerExecution().catch((err) => {
  console.error(err);
  process.exit(1);
});
