# PostPilot (Drex SMM)
> Lightweight AI-Powered Social Media Publishing & Scheduling Utility connecting to Claude via Model Context Protocol (MCP).

---

## 1. Product Overview

**PostPilot** is a minimalist publishing utility designed to give Claude autonomous scheduling and publishing capabilities to connected social accounts. 

- **Primary supported platform:** LinkedIn (Personal Profiles via Official Posts API).
- **Core Philosophy:** Strictly focused on scheduling and publishing. No bloated analytics, team collaboration, marketing CRM, or complex content calendars. Claude handles the creative and strategic decisions; PostPilot executes reliable scheduling and publishing.
- **Autonomous Publishing:** Posts continue to publish automatically through the PostgreSQL-backed `pg-boss` queue engine even when Claude is offline, closed, or disconnected.

---

## 2. Tech Stack & Architecture

A modular monolithic codebase:

- **Frontend:** Next.js 14 + React + TypeScript + Tailwind CSS (lucide-react icons)
- **Backend API:** Fastify + TypeScript
- **Database & ORM:** PostgreSQL (Supabase / local) + Drizzle ORM
- **Queue Engine:** `pg-boss` (Idempotent background job scheduler with exponential backoff & restart recovery)
- **MCP Server:** Official Model Context Protocol TypeScript SDK (`@modelcontextprotocol/sdk`)
- **Transport:** Streamable HTTP (Server-Sent Events / SSE) with session management
- **Security:** AES-256-GCM encrypted OAuth token storage, state CSRF validation, rate limiting, and API key authentication
- **Deployment:** Railway-ready Dockerfile & `railway.json`

---

## 3. Quick Start & Setup

### Prerequisites
- Node.js 18+ (tested on Node 20 / 25)
- PostgreSQL database (Supabase or local PostgreSQL instance)

### 1. Clone & Install Dependencies
```bash
git clone <repository_url>
cd SMM
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in the configuration details:
```env
PORT=3002
HOST=0.0.0.0
NODE_ENV=development

# PostgreSQL Connection String
DATABASE_URL=postgres://user:password@localhost:5433/postpilot

# 32-byte hex encryption key for OAuth tokens (AES-256-GCM)
TOKEN_ENCRYPTION_KEY=cc24b4b13c55b8756c42a501fe3b365c09e9d58021de84590ae0c6155c949191
COOKIE_SECRET=921ab02c11ee71f28b4952d7e5d8ff617d3b0e1d528f8ac79f0412e6bf5f7143

# LinkedIn Developer App Credentials
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
LINKEDIN_REDIRECT_URI=http://localhost:3002/api/auth/linkedin/callback

DEFAULT_TIMEZONE=Asia/Dhaka
MCP_API_KEY=postpilot-mcp-secret-key-12345
FRONTEND_URL=http://localhost:3003
```

### 3. Run Database Migrations
```bash
npm run db:migrate
```

### 4. Start Development Servers
Run both API backend and Next.js frontend concurrently:
```bash
npm run dev
```
- Dashboard: `http://localhost:3003`
- Fastify API Server: `http://localhost:3002`
- Streamable HTTP MCP Server: `http://localhost:3002/mcp/sse`

---

## 4. Claude MCP Integration

PostPilot exposes a Streamable HTTP (SSE) MCP server.

### Connecting with Claude Desktop

Add this configuration to your Claude Desktop config file:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "postpilot": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:3002/mcp/sse?apiKey=postpilot-mcp-secret-key-12345"
      ]
    }
  }
}
```

---

## 5. MCP Tools Reference

PostPilot exposes 6 tools to Claude:

| Tool Name | Parameters | Description |
|---|---|---|
| `connect_linkedin` | *None* | Generates the official OAuth 2.0 authorization URL or reports active connection status. |
| `schedule_post` | `platform`, `content`, `scheduled_at`, `timezone` (optional) | Validates text length (up to 3000 chars), validates future time, creates the post in PostgreSQL, and queues the job in `pg-boss`. |
| `publish_post_now` | `platform`, `content` | Validates content, publishes immediately to LinkedIn, records external post URN, and logs the response. |
| `list_scheduled_posts` | `status` (optional), `limit` (optional) | Retrieves chronological list of posts with status, local/UTC times, content previews, and IDs. |
| `update_scheduled_post` | `post_id`, `content` (optional), `scheduled_at` (optional), `timezone` (optional) | Edits scheduled content and updates the queue schedule in `pg-boss`. Rejects already-publishing or published posts. |
| `cancel_scheduled_post` | `post_id` | Cancels the `pg-boss` publishing job and updates database status to `cancelled`. Prevents cancellation of already-published posts. |

---

## 6. Official LinkedIn API Integration

- **OAuth 2.0:** Implements OpenID Connect authorization with `openid profile email w_member_social`.
- **Official Posts API:** `POST https://api.linkedin.com/rest/posts` with `LinkedIn-Version: 202401` and `X-Restli-Protocol-Version: 2.0.0`.
- **Token Security:** Tokens are stored encrypted with AES-256-GCM. Decryption only occurs in-memory at publishing time. Tokens are never exposed in API responses or logs.
- **Refresh Flow:** Automatic refresh using `grant_type=refresh_token` before expiration.
- **Sandbox/Demo Mode:** Instant mock connection toggle available on the Connections page for local developer testing without requiring an active LinkedIn developer app.

---

## 7. Scheduling & Recovery Architecture

- **PostgreSQL Queue (`pg-boss`):** Jobs are scheduled with UTC timestamps and singleton keys per post (`post_${postId}`) ensuring zero duplicate publishing.
- **Concurrency Protection:** Atomic database status locking (`scheduled` -> `publishing`) prevents multiple worker instances from publishing the same post.
- **Restart Recovery:** On startup, PostPilot runs `recoverPendingJobs()`, identifying overdue or upcoming jobs and re-enqueuing them.
- **Comprehensive Audit Trail:** Every action (`job_created`, `rescheduled`, `cancelled`, `publish_attempt`, `publish_success`, `publish_failed`) is permanently recorded in `publishing_logs`.

---

## 8. Verification & Test Suite

Run the end-to-end test suite verifying all 14 project requirements:
```bash
# Run comprehensive E2E verification
npx tsx src/tests/e2e_verification.test.ts

# Run MCP Streamable HTTP client integration test
npx tsx src/tests/mcp.test.ts

# Run timed worker execution test
npx tsx src/tests/worker_schedule.test.ts
```

All 14 requirements pass with automated coverage.

---

## 9. Railway Deployment

A production-ready multi-stage `Dockerfile` and `railway.json` are included.

1. Connect your GitHub repository to Railway.
2. Add a PostgreSQL database in Railway (or connect Supabase).
3. Set environment variables:
   - `DATABASE_URL`
   - `TOKEN_ENCRYPTION_KEY`
   - `COOKIE_SECRET`
   - `LINKEDIN_CLIENT_ID`
   - `LINKEDIN_CLIENT_SECRET`
   - `LINKEDIN_REDIRECT_URI` (e.g. `https://your-app.railway.app/api/auth/linkedin/callback`)
   - `MCP_API_KEY`
   - `FRONTEND_URL` (e.g. `https://your-app.railway.app`)
4. Railway will automatically build the Next.js frontend, compile the Fastify server, run migrations, and launch the service.
