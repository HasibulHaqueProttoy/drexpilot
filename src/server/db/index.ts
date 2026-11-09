import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

// Database client instance
const isCloudDb = !env.DATABASE_URL.includes("localhost") && !env.DATABASE_URL.includes("127.0.0.1");

export const queryClient = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: isCloudDb ? "prefer" : false,
});

export const db = drizzle(queryClient, { schema });
