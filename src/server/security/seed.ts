import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { hashPassword } from "./jwt.js";
import { env } from "../config/env.js";

export async function seedAdminUser() {
  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  const name = env.ADMIN_NAME || "Admin";

  const passwordHash = await hashPassword(password);

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!existing) {
    console.log(`[Auth] Creating admin user: ${email}`);
    await db.insert(users).values({
      email,
      passwordHash,
      name,
    });
    console.log(`[Auth] Admin user created successfully.`);
  } else {
    // Keep password in sync with ADMIN_PASSWORD env var
    await db.update(users).set({ passwordHash, name }).where(eq(users.id, existing.id));
    console.log(`[Auth] Admin credentials synchronized for: ${email}`);
  }
}
