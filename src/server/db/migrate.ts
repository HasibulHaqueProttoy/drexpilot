import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, queryClient } from "./index.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getMigrationsFolder(): string {
  const candidates = [
    path.join(__dirname, "migrations"),
    path.join(process.cwd(), "src/server/db/migrations"),
    path.join(process.cwd(), "dist/server/db/migrations"),
    path.join(process.cwd(), "migrations"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, "meta", "_journal.json"))) {
      return candidate;
    }
  }

  // Default fallback
  return candidates[0];
}

export async function runMigrations() {
  const migrationsFolder = getMigrationsFolder();
  console.log(`Running database migrations from: ${migrationsFolder}...`);
  try {
    await migrate(db, { migrationsFolder });
    console.log("Database migrations completed successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}

// If run directly
if (process.argv[1]?.endsWith("migrate.ts") || process.argv[1]?.endsWith("migrate.js")) {
  runMigrations()
    .then(async () => {
      await queryClient.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      await queryClient.end();
      process.exit(1);
    });
}
