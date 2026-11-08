import type { FastifyPluginAsync } from "fastify";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpServer } from "../mcp/server.js";
import { env } from "../config/env.js";

// Map to store active SSE transports by session ID
const activeTransports = new Map<string, SSEServerTransport>();

export const mcpRoutes: FastifyPluginAsync = async (fastify) => {
  // Authentication hook for MCP routes
  fastify.addHook("preHandler", async (request, reply) => {
    // If request has a valid active session in /messages, it is already authenticated via SSE handshake
    const query = request.query as Record<string, string>;
    if (request.url.startsWith("/mcp/messages") && query?.sessionId && activeTransports.has(query.sessionId)) {
      return;
    }

    // Otherwise check API key if MCP_API_KEY is configured
    if (env.MCP_API_KEY) {
      const apiKeyHeader = request.headers["x-api-key"];
      const authHeader = request.headers.authorization;
      const apiKeyQuery = query?.apiKey;

      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
      const providedKey = apiKeyHeader || bearerToken || apiKeyQuery;

      if (!providedKey || providedKey !== env.MCP_API_KEY) {
        reply.code(401).send({
          error: "Unauthorized",
          message: "Invalid or missing MCP API key. Provide via 'x-api-key' header or '?apiKey=' query parameter.",
        });
        return;
      }
    }
  });

  // GET /mcp/sse: Establishes Server-Sent Events streamable transport
  fastify.get("/sse", async (request, reply) => {
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("Access-Control-Allow-Origin", "*");

    const mcpServer = createMcpServer();
    const query = request.query as Record<string, string>;
    const apiKey = query?.apiKey;
    const endpointUrl = apiKey ? `/mcp/messages?apiKey=${encodeURIComponent(apiKey)}` : "/mcp/messages";

    const transport = new SSEServerTransport(endpointUrl, reply.raw);

    const sessionId = transport.sessionId;
    activeTransports.set(sessionId, transport);
    console.log(`[MCP] New client session connected: ${sessionId}`);

    transport.onclose = () => {
      console.log(`[MCP] Client session closed: ${sessionId}`);
      activeTransports.delete(sessionId);
    };

    transport.onerror = (err) => {
      console.error(`[MCP] Transport error for session ${sessionId}:`, err);
    };

    await mcpServer.connect(transport);
  });

  // POST /mcp/messages: Receives JSON-RPC messages for an active session
  fastify.post("/messages", async (request, reply) => {
    const query = request.query as { sessionId?: string };
    const sessionId = query.sessionId;

    if (!sessionId) {
      reply.code(400).send({ error: "Missing sessionId query parameter" });
      return;
    }

    const transport = activeTransports.get(sessionId);
    if (!transport) {
      reply.code(404).send({ error: `Session not found or expired: ${sessionId}` });
      return;
    }

    await transport.handlePostMessage(request.raw, reply.raw, request.body);
  });

  // GET /mcp/info: Status endpoint providing MCP connection instructions
  fastify.get("/info", async () => {
    return {
      status: "online",
      server_name: "PostPilot",
      version: "1.0.0",
      transport: "Streamable HTTP (SSE)",
      endpoints: {
        sse: "/mcp/sse",
        messages: "/mcp/messages",
      },
      tools: [
        "connect_linkedin",
        "schedule_post",
        "publish_post_now",
        "list_scheduled_posts",
        "update_scheduled_post",
        "cancel_scheduled_post",
      ],
      authentication_required: Boolean(env.MCP_API_KEY),
    };
  });
};
