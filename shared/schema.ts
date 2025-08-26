import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const proxies = pgTable("proxies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ip: text("ip").notNull(),
  port: integer("port").notNull(),
  country: text("country").notNull(), // 'usa', 'canada', 'australia'
  isWorking: boolean("is_working").notNull().default(true),
  lastChecked: timestamp("last_checked").notNull().defaultNow(),
  responseTime: integer("response_time"), // in milliseconds
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const screenSessions = pgTable("screen_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  screenNumber: integer("screen_number").notNull(),
  targetUrl: text("target_url").notNull(),
  proxyId: varchar("proxy_id").references(() => proxies.id),
  country: text("country").notNull(),
  refreshInterval: integer("refresh_interval").notNull().default(30), // in seconds
  isActive: boolean("is_active").notNull().default(true),
  friendly: boolean("friendly").notNull().default(true),
  lastRefresh: timestamp("last_refresh").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertProxySchema = createInsertSchema(proxies).omit({
  id: true,
  createdAt: true,
});

export const insertScreenSessionSchema = createInsertSchema(screenSessions).omit({
  id: true,
  createdAt: true,
  lastRefresh: true,
});

export const proxyStatsSchema = z.object({
  total: z.number(),
  working: z.number(),
  byCountry: z.record(z.number()),
  workingByCountry: z.record(z.number()).optional(),
  lastUpdated: z.string(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Proxy = typeof proxies.$inferSelect;
export type InsertProxy = z.infer<typeof insertProxySchema>;
export type ScreenSession = typeof screenSessions.$inferSelect;
export type InsertScreenSession = z.infer<typeof insertScreenSessionSchema>;
export type ProxyStats = z.infer<typeof proxyStatsSchema>;
