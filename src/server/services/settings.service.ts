import { db } from "../db/index.js";
import { appSettings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { env } from "../config/env.js";

export async function getDefaultTimezone(): Promise<string> {
  try {
    const setting = await db.query.appSettings.findFirst({
      where: eq(appSettings.key, "default_timezone"),
    });
    return setting?.value || env.DEFAULT_TIMEZONE || "Asia/Dhaka";
  } catch (error) {
    console.error("Error reading default timezone:", error);
    return env.DEFAULT_TIMEZONE || "Asia/Dhaka";
  }
}

export async function setDefaultTimezone(tz: string): Promise<string> {
  // Validate IANA timezone
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
  } catch {
    throw new Error(`Invalid IANA timezone identifier: '${tz}'`);
  }

  await db
    .insert(appSettings)
    .values({
      key: "default_timezone",
      value: tz,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value: tz,
        updatedAt: new Date(),
      },
    });

  return tz;
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const settings = await db.query.appSettings.findMany();
  const result: Record<string, string> = {
    default_timezone: env.DEFAULT_TIMEZONE || "Asia/Dhaka",
  };
  for (const s of settings) {
    result[s.key] = s.value;
  }
  return result;
}
