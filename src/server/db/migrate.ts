import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, queryClient } from "./index.js";

export async function runMigrations() {
  console.log("Running database migrations...");
  try {
    await migrate(db, { migrationsFolder: "./src/server/db/migrations" });
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
