import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { env } from "./config/env.js";
import { runMigrations } from "./db/migrate.js";
import { seedAdminUser } from "./security/seed.js";
import { queryClient } from "./db/index.js";
import { startBoss, stopBoss } from "./queue/boss.js";
import { registerPublishWorker } from "./queue/worker.js";
import { recoverPendingJobs } from "./queue/scheduler.js";

import { authRoutes } from "./routes/auth.routes.js";
import { postsRoutes } from "./routes/posts.routes.js";
import { settingsRoutes } from "./routes/settings.routes.js";
import { mcpRoutes } from "./routes/mcp.routes.js";
import { oauthRoutes } from "./routes/oauth.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function buildApp() {
  const app = fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "warn",
    },
  });

  // Security: CORS
  await app.register(cors, {
    origin: true, // Allow frontend and MCP clients
    credentials: true,
  });

  // Security: Cookie
  await app.register(cookie, {
    secret: env.COOKIE_SECRET,
    hook: "onRequest",
  });

  // Support form-urlencoded requests (OAuth / token endpoints)
  await app.register(formbody);

  // Security: Rate limiting
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
  });

  // Security Headers (Google Safe Browsing & Web Risk compliance)
  app.addHook("onSend", async (request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("X-XSS-Protection", "1; mode=block");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  });

  // Health check endpoint
  app.get("/health", async () => ({
    status: "ok",
    service: "smmpilot",
    time: new Date().toISOString(),
  }));

  // API Routes
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(postsRoutes, { prefix: "/api/posts" });
  await app.register(settingsRoutes, { prefix: "/api/settings" });

  // MCP Remote Server Route
  await app.register(mcpRoutes, { prefix: "/mcp" });

  // OAuth 2.0 & Claude Remote Connector Routes
  await app.register(oauthRoutes);

  // Production static file serving if Next.js export exists
  const publicPath = path.join(process.cwd(), "out");
  if (fs.existsSync(publicPath)) {
    await app.register(fastifyStatic, {
      root: publicPath,
      prefix: "/",
      wildcard: false,
    });

    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url && !req.raw.url.startsWith("/api") && !req.raw.url.startsWith("/mcp")) {
        const cleanPath = req.raw.url.split("?")[0].replace(/^\//, "");
        const htmlPath = path.join(publicPath, `${cleanPath}.html`);
        if (cleanPath && fs.existsSync(htmlPath)) {
          return reply.type("text/html").send(fs.readFileSync(htmlPath));
        }
        const indexPath = path.join(publicPath, "index.html");
        if (fs.existsSync(indexPath)) {
          return reply.type("text/html").send(fs.readFileSync(indexPath));
        }
      }
      reply.code(404).send({ error: "Not Found" });
    });
  }

  return app;
}

async function startServer() {
  console.log("==========================================");
  console.log("Starting SMMPilot Server...");
  console.log("==========================================");

  try {
    // 1. Run migrations and ensure admin credentials exist
    await runMigrations();
    await seedAdminUser();

    // 2. Start pg-boss queue
    await startBoss();

    // 3. Register worker
    await registerPublishWorker();

    // 4. Recover pending jobs
    await recoverPendingJobs();

    // 5. Build Fastify app and start listening
    const app = await buildApp();

    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });

    console.log(`✓ Fastify API server listening on http://${env.HOST}:${env.PORT}`);
    console.log(`✓ Streamable HTTP MCP Server available at http://${env.HOST}:${env.PORT}/mcp/sse`);
    console.log(`✓ LinkedIn OAuth initiation: http://${env.HOST}:${env.PORT}/api/auth/linkedin`);

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      try {
        await app.close();
        await stopBoss();
        await queryClient.end();
        console.log("PostPilot shutdown complete.");
        process.exit(0);
      } catch (err) {
        console.error("Error during shutdown:", err);
        process.exit(1);
      }
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

// Start server if executed directly
if (process.argv[1]?.includes("src/server/index.ts") || process.argv[1]?.includes("dist/server/index.js")) {
  startServer();
}
