import assert from "node:assert";
import { db } from "../server/db/index.js";
import { scheduledPosts, socialAccounts } from "../server/db/schema.js";
import { eq } from "drizzle-orm";
import { LinkedInPublisher } from "../server/publishers/linkedin.publisher.js";
import { executePublish } from "../server/queue/worker.js";
import { encrypt } from "../server/security/crypto.js";

async function runMediaTests() {
  console.log("==========================================");
  console.log("Testing Rich Media Publishing Engine");
  console.log("==========================================");

  const publisher = new LinkedInPublisher();

  // 1. Validation test - media type without URLs should fail
  const valFail = publisher.validateContent("Test post", {
    mediaType: "image",
    mediaUrls: [],
  });
  assert.strictEqual(valFail.valid, false, "Should fail validation when media_type is specified but no URLs given");
  console.log("✓ Validation for missing media URLs passed");

  // 2. Validation test - valid media options
  const valSuccess = publisher.validateContent("Test post with media", {
    mediaType: "carousel",
    mediaUrls: ["https://example.com/slides.pdf"],
    mediaTitle: "2026 Strategy Deck",
  });
  assert.strictEqual(valSuccess.valid, true, "Valid media options should pass validation");
  console.log("✓ Validation for valid media options passed");

  // 3. Setup mock account
  const [mockAccount] = await db
    .insert(socialAccounts)
    .values({
      platform: "linkedin",
      accountId: `mock_media_user_${Date.now()}`,
      accountName: "Media Test Profile",
      accessTokenEncrypted: encrypt("mock_token_for_testing"),
      status: "connected",
    })
    .returning();

  // 4. Test image post publishing
  const [imgPost] = await db
    .insert(scheduledPosts)
    .values({
      socialAccountId: mockAccount.id,
      platform: "linkedin",
      content: "Check out this visual graphic! #Marketing",
      scheduledAt: new Date(),
      timezone: "Asia/Dhaka",
      mediaType: "image",
      mediaUrls: ["https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe"],
      mediaTitle: "Hero Visual",
      status: "scheduled",
    })
    .returning();

  assert.strictEqual(imgPost.mediaType, "image");
  assert.strictEqual(imgPost.mediaTitle, "Hero Visual");
  assert.ok(imgPost.mediaUrls && imgPost.mediaUrls.length === 1);

  const imgResult = await executePublish(imgPost.id);
  assert.strictEqual(imgResult.success, true);
  console.log("✓ Image post execution & publishing verified");

  // 5. Test PDF Carousel post publishing
  const [carouselPost] = await db
    .insert(scheduledPosts)
    .values({
      socialAccountId: mockAccount.id,
      platform: "linkedin",
      content: "Swipe through my 5-step framework for AI agents in 2026 👉",
      scheduledAt: new Date(),
      timezone: "Asia/Dhaka",
      mediaType: "carousel",
      mediaUrls: ["https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"],
      mediaTitle: "AI Agents Framework 2026",
      status: "scheduled",
    })
    .returning();

  const carouselResult = await executePublish(carouselPost.id);
  assert.strictEqual(carouselResult.success, true);

  const savedCarousel = await db.query.scheduledPosts.findFirst({
    where: eq(scheduledPosts.id, carouselPost.id),
  });
  assert.strictEqual(savedCarousel?.status, "published");
  assert.strictEqual(savedCarousel?.mediaType, "carousel");
  assert.strictEqual(savedCarousel?.mediaTitle, "AI Agents Framework 2026");
  console.log("✓ PDF Carousel slide deck execution & publishing verified");

  // 6. Test Video post publishing
  const [videoPost] = await db
    .insert(scheduledPosts)
    .values({
      socialAccountId: mockAccount.id,
      platform: "linkedin",
      content: "Quick walkthrough video of DrexPilot in action 🎬",
      scheduledAt: new Date(),
      timezone: "Asia/Dhaka",
      mediaType: "video",
      mediaUrls: ["https://example.com/demo.mp4"],
      mediaTitle: "Walkthrough Video",
      status: "scheduled",
    })
    .returning();

  const videoResult = await executePublish(videoPost.id);
  assert.strictEqual(videoResult.success, true);
  console.log("✓ Video post execution & publishing verified");

  // Clean up
  await db.delete(socialAccounts).where(eq(socialAccounts.id, mockAccount.id));

  console.log("==========================================");
  console.log("ALL RICH MEDIA TESTS PASSED SUCCESSFULLY!");
  console.log("==========================================");
}

runMediaTests().catch((err) => {
  console.error("Rich media test failed:", err);
  process.exit(1);
});
