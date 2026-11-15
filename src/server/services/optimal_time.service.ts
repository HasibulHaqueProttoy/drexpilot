import { fromZonedTime, toZonedTime, format } from "date-fns-tz";

export interface OptimalSlot {
  iso: string;
  localFormatted: string;
  dayOfWeek: string;
  hour: number;
  minute: number;
  engagementTier: "Peak" | "High" | "Good";
  reason: string;
}

// Recommended weekly slots by local hour
const BENCHMARK_SCHEDULE: Record<number, Array<{ hour: number; minute: number; tier: "Peak" | "High" | "Good"; reason: string }>> = {
  // 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday
  1: [ // Monday
    { hour: 10, minute: 0, tier: "High", reason: "Monday morning catch-up window" },
    { hour: 13, minute: 0, tier: "Good", reason: "Monday post-lunch browsing" },
  ],
  2: [ // Tuesday (Peak Day)
    { hour: 9, minute: 0, tier: "Peak", reason: "Tuesday morning professional peak engagement" },
    { hour: 12, minute: 0, tier: "High", reason: "Tuesday lunchtime mobile activity" },
    { hour: 17, minute: 0, tier: "High", reason: "Tuesday end-of-workday wrap-up" },
  ],
  3: [ // Wednesday (Peak Day)
    { hour: 9, minute: 0, tier: "Peak", reason: "Midweek highest professional reading peak" },
    { hour: 12, minute: 0, tier: "Peak", reason: "Wednesday midday executive check-in" },
    { hour: 16, minute: 30, tier: "High", reason: "Wednesday late afternoon review" },
  ],
  4: [ // Thursday (Peak Day)
    { hour: 9, minute: 0, tier: "Peak", reason: "Thursday morning high B2B discussion window" },
    { hour: 13, minute: 0, tier: "High", reason: "Thursday afternoon thought-leadership slot" },
    { hour: 17, minute: 0, tier: "Good", reason: "Thursday evening networking wind-down" },
  ],
  5: [ // Friday
    { hour: 9, minute: 30, tier: "High", reason: "Friday morning weekly wrap-up reading" },
    { hour: 11, minute: 30, tier: "Good", reason: "Friday pre-weekend check-in" },
  ],
  6: [ // Saturday
    { hour: 10, minute: 0, tier: "Good", reason: "Weekend casual professional reading" },
  ],
  0: [ // Sunday
    { hour: 16, minute: 0, tier: "Good", reason: "Sunday evening prep for upcoming business week" },
  ],
};

export function getUpcomingOptimalTimes(timezone = "Asia/Dhaka", count = 6): OptimalSlot[] {
  const results: OptimalSlot[] = [];
  const now = new Date();
  
  // Look ahead up to 14 days
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    // Current date in target timezone
    const targetDay = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const zonedDate = toZonedTime(targetDay, timezone);
    const dayOfWeek = zonedDate.getDay();

    const candidateSlots = BENCHMARK_SCHEDULE[dayOfWeek] || [];
    for (const slot of candidateSlots) {
      // Build date string YYYY-MM-DD in target timezone
      const year = zonedDate.getFullYear();
      const month = String(zonedDate.getMonth() + 1).padStart(2, "0");
      const day = String(zonedDate.getDate()).padStart(2, "0");
      const hourStr = String(slot.hour).padStart(2, "0");
      const minStr = String(slot.minute).padStart(2, "0");

      const localDateStr = `${year}-${month}-${day} ${hourStr}:${minStr}:00`;
      const slotUtc = fromZonedTime(localDateStr, timezone);

      // Must be at least 15 minutes into the future
      if (slotUtc.getTime() > now.getTime() + 15 * 60 * 1000) {
        const localFormatted = format(slotUtc, "EEEE, MMM d, yyyy 'at' h:mm a (zzz)", { timeZone: timezone });
        const dayName = format(slotUtc, "EEEE", { timeZone: timezone });

        results.push({
          iso: slotUtc.toISOString(),
          localFormatted,
          dayOfWeek: dayName,
          hour: slot.hour,
          minute: slot.minute,
          engagementTier: slot.tier,
          reason: slot.reason,
        });

        if (results.length >= count) {
          return results;
        }
      }
    }
  }

  return results;
}
