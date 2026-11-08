import crypto from "node:crypto";
import { env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Derives a 32-byte Buffer from the secret key (handles hex string or raw utf-8 string).
 */
function getKeyBuffer(): Buffer {
  const key = env.TOKEN_ENCRYPTION_KEY;
  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    return Buffer.from(key, "hex");
  }
  return crypto.createHash("sha256").update(key).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Output format: iv:tag:ciphertext (all base64)
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKeyBuffer(), iv);
  
  let ciphertext = cipher.update(plaintext, "utf8", "base64");
  ciphertext += cipher.final("base64");
  
  const tag = cipher.getAuthTag();
  
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext}`;
}

/**
 * Decrypts a ciphertext string created by encrypt().
 */
export function decrypt(encryptedData: string): string {
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }
  
  const [ivBase64, tagBase64, ciphertext] = parts;
  const iv = Buffer.from(ivBase64, "base64");
  const tag = Buffer.from(tagBase64, "base64");
  
  const decipher = crypto.createDecipheriv(ALGORITHM, getKeyBuffer(), iv);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}
