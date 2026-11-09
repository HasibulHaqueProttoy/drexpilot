import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";

export interface UserPayload {
  id: string;
  email: string;
  name: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: UserPayload;
  }
}

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = "7d"; // 7 days session

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: UserPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): UserPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as UserPayload;
    if (decoded && decoded.id && decoded.email) {
      return {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name,
      };
    }
    return null;
  } catch {
    return null;
  }
}
