import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { requireAuth } from "./auth.routes.js";
import { env } from "../config/env.js";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function getBaseUrl(request: FastifyRequest): string {
  const host = (request.headers["x-forwarded-host"] || request.headers.host)?.toString();
  const proto = (request.headers["x-forwarded-proto"] || "https").toString();
  if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
    return `${proto}://${host}`;
  }
  if (env.FRONTEND_URL && !env.FRONTEND_URL.includes("localhost")) {
    return env.FRONTEND_URL.replace(/\/+$/, "");
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, "");
  }
  return `http://${env.HOST}:${env.PORT}`;
}

function getMediaTypeFromMime(mime: string): "image" | "video" | "carousel" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf" || mime.includes("pdf")) return "carousel";
  return "file";
}

export const mediaRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/media - List uploaded media assets
  fastify.get("/", { preHandler: [requireAuth] }, async (request) => {
    const baseUrl = getBaseUrl(request);
    if (!fs.existsSync(UPLOADS_DIR)) {
      return { media: [] };
    }

    const files = fs.readdirSync(UPLOADS_DIR).filter((f) => !f.startsWith("."));
    const items = files.map((filename) => {
      const filePath = path.join(UPLOADS_DIR, filename);
      const stat = fs.statSync(filePath);
      const ext = path.extname(filename).toLowerCase();

      let mediaType: "image" | "video" | "carousel" = "image";
      if (ext === ".pdf") mediaType = "carousel";
      else if (ext === ".mp4" || ext === ".mov" || ext === ".webm") mediaType = "video";

      return {
        filename,
        url: `${baseUrl}/uploads/${filename}`,
        media_type: mediaType,
        size: stat.size,
        created_at: stat.birthtime.toISOString(),
      };
    });

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { media: items };
  });

  // POST /api/media/upload - Direct File & Multipart / Base64 upload
  fastify.post("/upload", async (request, reply) => {
    const baseUrl = getBaseUrl(request);

    // 1. Check if multipart/form-data upload
    if (request.isMultipart()) {
      const data = await request.file({
        limits: {
          fileSize: 100 * 1024 * 1024, // 100MB limit for video/pdf
        },
      });

      if (!data) {
        return reply.status(400).send({ error: "No file provided in multipart upload" });
      }

      const ext = path.extname(data.filename) || ".bin";
      const safeName = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`;
      const savePath = path.join(UPLOADS_DIR, safeName);

      await pipeline(data.file, fs.createWriteStream(savePath));

      const mediaType = getMediaTypeFromMime(data.mimetype);
      const stat = fs.statSync(savePath);

      return reply.code(201).send({
        success: true,
        filename: safeName,
        url: `${baseUrl}/uploads/${safeName}`,
        media_type: mediaType,
        size: stat.size,
      });
    }

    // 2. Check if JSON base64 upload
    const body = (request.body || {}) as {
      filename?: string;
      base64_data?: string;
      mime_type?: string;
    };

    if (body.base64_data) {
      const cleanBase64 = body.base64_data.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      const ext = body.filename ? path.extname(body.filename) : (body.mime_type?.includes("pdf") ? ".pdf" : ".jpg");
      const safeName = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`;
      const savePath = path.join(UPLOADS_DIR, safeName);

      fs.writeFileSync(savePath, buffer);
      const mediaType = getMediaTypeFromMime(body.mime_type || "image/jpeg");

      return reply.code(201).send({
        success: true,
        filename: safeName,
        url: `${baseUrl}/uploads/${safeName}`,
        media_type: mediaType,
        size: buffer.length,
      });
    }

    return reply.status(400).send({ error: "Invalid upload request. Send as multipart form file or JSON base64_data." });
  });
};
