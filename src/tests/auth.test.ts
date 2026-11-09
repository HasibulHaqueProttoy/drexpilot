import { describe, it } from "node:test";
import assert from "node:assert";
import { hashPassword, verifyPassword, generateToken, verifyToken } from "../server/security/jwt.js";
import { db } from "../server/db/index.js";
import { users } from "../server/db/schema.js";
import { eq } from "drizzle-orm";

async function runAuthTests() {
  console.log("==========================================");
  console.log("Testing JWT & Password Security Subsystem");
  console.log("==========================================");

  // 1. Test password hashing and verification
  const rawPassword = "SuperSecurePassword123!";
  const hash = await hashPassword(rawPassword);
  assert.ok(hash !== rawPassword, "Password hash must not match plaintext");
  assert.ok(hash.startsWith("$2"), "Password hash should be a valid bcrypt hash");

  const isMatch = await verifyPassword(rawPassword, hash);
  assert.strictEqual(isMatch, true, "verifyPassword must return true for correct password");

  const isBadMatch = await verifyPassword("WrongPassword", hash);
  assert.strictEqual(isBadMatch, false, "verifyPassword must return false for incorrect password");
  console.log("✓ Password hashing & verification verified");

  // 2. Test JWT token generation and verification
  const userPayload = {
    id: "11111111-2222-3333-4444-555555555555",
    email: "test.admin@drexpilot.com",
    name: "Admin User",
  };

  const token = generateToken(userPayload);
  assert.ok(typeof token === "string" && token.length > 20, "JWT token must be non-empty string");

  const decoded = verifyToken(token);
  assert.ok(decoded !== null, "Decoded token must not be null");
  assert.strictEqual(decoded.id, userPayload.id);
  assert.strictEqual(decoded.email, userPayload.email);
  assert.strictEqual(decoded.name, userPayload.name);
  console.log("✓ JWT signing & verification verified");

  // 3. Test invalid JWT token
  const invalidDecoded = verifyToken("invalid.jwt.token");
  assert.strictEqual(invalidDecoded, null, "Invalid JWT must return null");
  console.log("✓ Invalid JWT rejection verified");

  // 4. Test database user upsert and query
  const testEmail = `admin_test_${Date.now()}@example.com`;
  const [createdUser] = await db
    .insert(users)
    .values({
      email: testEmail,
      passwordHash: hash,
      name: "Drex Admin",
    })
    .returning();

  assert.ok(createdUser.id, "Created user must have an ID");
  assert.strictEqual(createdUser.email, testEmail);

  const foundUser = await db.query.users.findFirst({
    where: eq(users.email, testEmail),
  });
  assert.ok(foundUser, "User must be queryable from database");
  assert.strictEqual(foundUser.email, testEmail);
  console.log("✓ PostgreSQL users table CRUD verified");

  // Clean up test user
  await db.delete(users).where(eq(users.id, createdUser.id));

  console.log("\n==========================================");
  console.log("ALL AUTH SECURITY TESTS PASSED SUCCESSFULLY!");
  console.log("==========================================");
}

runAuthTests().catch((err) => {
  console.error("Auth test failed:", err);
  process.exit(1);
});
