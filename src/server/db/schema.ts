import { pgTable, uuid, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: varchar("platform", { length: 50 }).notNull().default("linkedin"),
    accountId: varchar("account_id", { length: 255 }).notNull(),
    accountName: varchar("account_name", { length: 255 }).notNull(),
    accountType: varchar("account_type", { length: 50 }).notNull().default("personal"), // 'personal' | 'organization'
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    status: varchar("status", { length: 50 }).notNull().default("connected"), // 'connected' | 'disconnected' | 'expired'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    platformAccountIdx: index("social_accounts_platform_account_idx").on(table.platform, table.accountId),
    statusIdx: index("social_accounts_status_idx").on(table.status),
  })
);

export const scheduledPosts = pgTable(
  "scheduled_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 50 }).notNull().default("linkedin"),
    content: text("content").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    timezone: varchar("timezone", { length: 100 }).notNull().default("Asia/Dhaka"),
    status: varchar("status", { length: 50 }).notNull().default("scheduled"), // 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled'
    externalPostId: varchar("external_post_id", { length: 255 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("scheduled_posts_status_idx").on(table.status),
    scheduledAtIdx: index("scheduled_posts_scheduled_at_idx").on(table.scheduledAt),
    socialAccountIdx: index("scheduled_posts_social_account_idx").on(table.socialAccountId),
  })
);

export const publishingLogs = pgTable(
  "publishing_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => scheduledPosts.id, { onDelete: "cascade" }),
    event: varchar("event", { length: 50 }).notNull(), // 'job_created' | 'publish_attempt' | 'publish_success' | 'publish_failed' | 'rescheduled' | 'cancelled'
    response: text("response"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    postIdIdx: index("publishing_logs_post_id_idx").on(table.postId),
    eventIdx: index("publishing_logs_event_idx").on(table.event),
  })
);

export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const socialAccountsRelations = relations(socialAccounts, ({ many }) => ({
  posts: many(scheduledPosts),
}));

export const scheduledPostsRelations = relations(scheduledPosts, ({ one, many }) => ({
  account: one(socialAccounts, {
    fields: [scheduledPosts.socialAccountId],
    references: [socialAccounts.id],
  }),
  logs: many(publishingLogs),
}));

export const publishingLogsRelations = relations(publishingLogs, ({ one }) => ({
  post: one(scheduledPosts, {
    fields: [publishingLogs.postId],
    references: [scheduledPosts.id],
  }),
}));

export type SocialAccount = typeof socialAccounts.$inferSelect;
export type NewSocialAccount = typeof socialAccounts.$inferInsert;
export type ScheduledPost = typeof scheduledPosts.$inferSelect;
export type NewScheduledPost = typeof scheduledPosts.$inferInsert;
export type PublishingLog = typeof publishingLogs.$inferSelect;
export type NewPublishingLog = typeof publishingLogs.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;
