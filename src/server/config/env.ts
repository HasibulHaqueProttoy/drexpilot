import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url().default("postgres://hasibulprottoy@localhost:5433/postpilot"),
  TOKEN_ENCRYPTION_KEY: z.string().min(32).default("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
  COOKIE_SECRET: z.string().min(16).default("postpilot-cookie-secret-very-secure-key-32"),
  JWT_SECRET: z.string().min(16).default("postpilot-jwt-super-secret-key-32-chars"),
  LINKEDIN_CLIENT_ID: z.string().default("mock_client_id"),
  LINKEDIN_CLIENT_SECRET: z.string().default("mock_client_secret"),
  LINKEDIN_REDIRECT_URI: z.string().default("http://localhost:3001/api/auth/linkedin/callback"),
  DEFAULT_TIMEZONE: z.string().default("Asia/Dhaka"),
  MCP_API_KEY: z.string().default("postpilot-mcp-secret-key-12345"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
});

export const env = envSchema.parse(process.env);
