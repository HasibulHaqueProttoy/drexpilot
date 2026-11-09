import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDefaultTimezone, setDefaultTimezone, getAllSettings } from "../services/settings.service.js";
import { requireAuth } from "./auth.routes.js";

const timezoneSchema = z.object({
  timezone: z.string().min(1),
});

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", requireAuth);

  // GET /api/settings - Get all application settings
  fastify.get("/", async () => {
    const settings = await getAllSettings();
    return {
      settings,
      available_timezones: [
        "Asia/Dhaka",
        "UTC",
        "America/New_York",
        "America/Los_Angeles",
        "America/Chicago",
        "Europe/London",
        "Europe/Paris",
        "Europe/Berlin",
        "Asia/Dubai",
        "Asia/Kolkata",
        "Asia/Singapore",
        "Asia/Tokyo",
        "Australia/Sydney",
      ],
    };
  });

  // POST /api/settings/timezone - Update default timezone
  fastify.post("/timezone", async (request, reply) => {
    const parseResult = timezoneSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.code(400).send({ error: "Validation error", details: parseResult.error.format() });
      return;
    }

    try {
      const tz = await setDefaultTimezone(parseResult.data.timezone);
      return { success: true, timezone: tz, message: "Default timezone updated successfully." };
    } catch (err: any) {
      reply.code(400).send({ error: err.message || "Invalid timezone" });
    }
  });
};
