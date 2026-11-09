import PgBoss from "pg-boss";
import { env } from "../config/env.js";

export const PUBLISH_QUEUE = "postpilot-publish-queue";

let bossInstance: PgBoss | null = null;

export function getBoss(): PgBoss {
  if (!bossInstance) {
    const isCloudDb = !env.DATABASE_URL.includes("localhost") && !env.DATABASE_URL.includes("127.0.0.1");
    bossInstance = new PgBoss({
      connectionString: env.DATABASE_URL,
      ssl: isCloudDb ? { rejectUnauthorized: false } : undefined,
      archiveCompletedAfterSeconds: 60 * 60 * 24 * 7,
      deleteAfterDays: 14,
      retentionMinutes: 60 * 24 * 7,
    });
  }
  return bossInstance;
}

export async function startBoss(): Promise<PgBoss> {
  const boss = getBoss();
  boss.on("error", (error) => {
    console.error("pg-boss background queue error:", error);
  });
  await boss.start();
  try {
    await boss.createQueue(PUBLISH_QUEUE);
  } catch (err) {
    // Ignore if already created
  }
  console.log("pg-boss queue system started successfully.");
  return boss;
}

export async function stopBoss(): Promise<void> {
  if (bossInstance) {
    await bossInstance.stop({ graceful: true, timeout: 5000 });
    bossInstance = null;
    console.log("pg-boss stopped gracefully.");
  }
}
