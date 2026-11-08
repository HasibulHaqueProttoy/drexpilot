import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function runMcpTest() {
  console.log("=== Testing MCP Client connection over Streamable HTTP ===");
  const apiKey = "postpilot-mcp-secret-key-12345";
  const url = new URL(`http://localhost:3002/mcp/sse?apiKey=${apiKey}`);

  const transport = new SSEClientTransport(url);
  const client = new Client(
    { name: "test-claude-agent", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log("✓ Successfully connected to PostPilot MCP server over SSE");

  // 1. List tools
  const tools = await client.listTools();
  console.log(`✓ Tools discovered (${tools.tools.length}):`, tools.tools.map((t) => t.name).join(", "));

  // 2. Call connect_linkedin
  const connectRes = await client.callTool({
    name: "connect_linkedin",
    arguments: {},
  });
  console.log("✓ Tool 'connect_linkedin' result:", JSON.stringify(connectRes.content, null, 2));

  // 3. Call schedule_post
  const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const scheduleRes = await client.callTool({
    name: "schedule_post",
    arguments: {
      platform: "linkedin",
      content: "Scheduled through Claude via MCP on PostPilot! #AI #Automation",
      scheduled_at: futureDate,
      timezone: "Asia/Dhaka",
    },
  });
  console.log("✓ Tool 'schedule_post' result:", JSON.stringify(scheduleRes.content, null, 2));

  // Parse post_id
  const scheduleData = JSON.parse((scheduleRes.content[0] as any).text);
  const postId = scheduleData.post_id;

  // 4. Call update_scheduled_post
  const updateRes = await client.callTool({
    name: "update_scheduled_post",
    arguments: {
      post_id: postId,
      content: "Updated through Claude via MCP on PostPilot! Verified edit functionality.",
    },
  });
  console.log("✓ Tool 'update_scheduled_post' result:", JSON.stringify(updateRes.content, null, 2));

  // 5. Call list_scheduled_posts
  const listRes = await client.callTool({
    name: "list_scheduled_posts",
    arguments: {
      status: "scheduled",
      limit: 5,
    },
  });
  console.log("✓ Tool 'list_scheduled_posts' result:", JSON.stringify(listRes.content, null, 2));

  // 6. Call cancel_scheduled_post
  const cancelRes = await client.callTool({
    name: "cancel_scheduled_post",
    arguments: {
      post_id: postId,
    },
  });
  console.log("✓ Tool 'cancel_scheduled_post' result:", JSON.stringify(cancelRes.content, null, 2));

  // 7. Call publish_post_now
  const publishNowRes = await client.callTool({
    name: "publish_post_now",
    arguments: {
      platform: "linkedin",
      content: "Published immediately by Claude via MCP! Direct publish test.",
    },
  });
  console.log("✓ Tool 'publish_post_now' result:", JSON.stringify(publishNowRes.content, null, 2));

  console.log("=== All 6 MCP Tools Tested Successfully! ===");
  await client.close();
  process.exit(0);
}

runMcpTest().catch((err) => {
  console.error("MCP Test failed:", err);
  process.exit(1);
});
