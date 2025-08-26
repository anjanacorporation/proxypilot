import { type User, type InsertUser, type Proxy, type InsertProxy, type ScreenSession, type InsertScreenSession, users, proxies, screenSessions } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from './db';
import { and, desc, eq } from 'drizzle-orm';

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Proxy management
  getProxies(country?: string): Promise<Proxy[]>;
  getWorkingProxies(country?: string): Promise<Proxy[]>;
  getProxyById(id: string): Promise<Proxy | undefined>;
  createProxy(proxy: InsertProxy): Promise<Proxy>;
  updateProxy(id: string, updates: Partial<Proxy>): Promise<Proxy | undefined>;
  deleteProxy(id: string): Promise<boolean>;
  clearProxies(): Promise<void>;
  
  // Screen session management
  getScreenSessions(): Promise<ScreenSession[]>;
  getScreenSessionById(id: string): Promise<ScreenSession | undefined>;
  getScreenSession(screenNumber: number): Promise<ScreenSession | undefined>;
  createScreenSession(session: InsertScreenSession): Promise<ScreenSession>;
  updateScreenSession(id: string, updates: Partial<ScreenSession>): Promise<ScreenSession | undefined>;
  deleteScreenSession(id: string): Promise<boolean>;
  clearScreenSessions(): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private proxies: Map<string, Proxy>;
  private screenSessions: Map<string, ScreenSession>;

  constructor() {
    this.users = new Map();
    this.proxies = new Map();
    this.screenSessions = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Proxy management
  async getProxies(country?: string): Promise<Proxy[]> {
    const proxies = Array.from(this.proxies.values());
    if (country) {
      return proxies.filter(proxy => proxy.country === country);
    }
    return proxies;
  }

  async getWorkingProxies(country?: string): Promise<Proxy[]> {
    const proxies = await this.getProxies(country);
    return proxies.filter(proxy => proxy.isWorking);
  }

  async getProxyById(id: string): Promise<Proxy | undefined> {
    return this.proxies.get(id);
  }

  async createProxy(insertProxy: InsertProxy): Promise<Proxy> {
    const id = randomUUID();
    const proxy: Proxy = {
      ...insertProxy,
      id,
      // Default to not working until verified via HTTPS-only checks
      isWorking: insertProxy.isWorking ?? false,
      responseTime: insertProxy.responseTime ?? null,
      createdAt: new Date(),
      lastChecked: new Date(),
    };
    this.proxies.set(id, proxy);
    return proxy;
  }

  async updateProxy(id: string, updates: Partial<Proxy>): Promise<Proxy | undefined> {
    const proxy = this.proxies.get(id);
    if (!proxy) return undefined;
    
    const updatedProxy = { ...proxy, ...updates };
    this.proxies.set(id, updatedProxy);
    return updatedProxy;
  }

  async deleteProxy(id: string): Promise<boolean> {
    return this.proxies.delete(id);
  }

  async clearProxies(): Promise<void> {
    this.proxies.clear();
  }

  // Screen session management
  async getScreenSessions(): Promise<ScreenSession[]> {
    return Array.from(this.screenSessions.values());
  }

  async getScreenSessionById(id: string): Promise<ScreenSession | undefined> {
    return this.screenSessions.get(id);
  }

  async getScreenSession(screenNumber: number): Promise<ScreenSession | undefined> {
    return Array.from(this.screenSessions.values()).find(
      session => session.screenNumber === screenNumber
    );
  }

  async createScreenSession(insertSession: InsertScreenSession): Promise<ScreenSession> {
    // Check if a session with this screen number already exists
    for (const [existingId, existingSession] of Array.from(this.screenSessions.entries())) {
      if (existingSession.screenNumber === insertSession.screenNumber) {
        // Update existing session instead of creating duplicate
        const updatedSession: ScreenSession = {
          ...existingSession,
          ...insertSession,
          id: existingId, // Keep the existing ID
          createdAt: existingSession.createdAt, // Keep original creation time
          lastRefresh: new Date(),
        };
        this.screenSessions.set(existingId, updatedSession);
        return updatedSession;
      }
    }

    // Create new session if none exists with this screen number
    const id = randomUUID();
    const session: ScreenSession = {
      ...insertSession,
      id,
      proxyId: insertSession.proxyId ?? null,
      refreshInterval: insertSession.refreshInterval ?? 30,
      isActive: insertSession.isActive ?? true,
      friendly: (insertSession as any).friendly ?? true,
      createdAt: new Date(),
      lastRefresh: new Date(),
    };
    this.screenSessions.set(id, session);
    return session;
  }

  async updateScreenSession(id: string, updates: Partial<ScreenSession>): Promise<ScreenSession | undefined> {
    const session = this.screenSessions.get(id);
    if (!session) return undefined;
    
    const updatedSession = { ...session, ...updates };
    this.screenSessions.set(id, updatedSession);
    return updatedSession;
  }

  async deleteScreenSession(id: string): Promise<boolean> {
    return this.screenSessions.delete(id);
  }

  async clearScreenSessions(): Promise<void> {
    this.screenSessions.clear();
  }
}

// Database-backed storage using Drizzle (Supabase/Postgres)
export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    if (!db) return undefined;
    const rows = await db.select().from(users).where(eq(users.id, id));
    return rows[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    if (!db) return undefined;
    const rows = await db.select().from(users).where(eq(users.username, username));
    return rows[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    if (!db) throw new Error('DB not configured');
    const rows = await db.insert(users).values(user).returning();
    return rows[0];
  }

  // Proxy management
  async getProxies(country?: string): Promise<Proxy[]> {
    if (!db) return [];
    if (country) {
      return await db.select().from(proxies).where(eq(proxies.country, country));
    }
    return await db.select().from(proxies);
  }

  async getWorkingProxies(country?: string): Promise<Proxy[]> {
    if (!db) return [];
    const base = eq(proxies.isWorking, true);
    if (country) {
      return await db.select().from(proxies).where(and(base, eq(proxies.country, country))).orderBy(desc(proxies.lastChecked));
    }
    return await db.select().from(proxies).where(base).orderBy(desc(proxies.lastChecked));
  }

  async getProxyById(id: string): Promise<Proxy | undefined> {
    if (!db) return undefined;
    const rows = await db.select().from(proxies).where(eq(proxies.id, id));
    return rows[0];
  }

  async createProxy(insertProxy: InsertProxy): Promise<Proxy> {
    if (!db) throw new Error('DB not configured');
    const row = {
      ...insertProxy,
      id: randomUUID(),
      isWorking: insertProxy.isWorking ?? false,
      responseTime: insertProxy.responseTime ?? null,
      lastChecked: new Date(),
      createdAt: new Date(),
    } as any;
    const rows = await db.insert(proxies).values(row).returning();
    return rows[0];
  }

  async updateProxy(id: string, updates: Partial<Proxy>): Promise<Proxy | undefined> {
    if (!db) return undefined;
    const rows = await db.update(proxies).set(updates as any).where(eq(proxies.id, id)).returning();
    return rows[0];
  }

  async deleteProxy(id: string): Promise<boolean> {
    if (!db) return false;
    const rows = await db.delete(proxies).where(eq(proxies.id, id)).returning();
    return rows.length > 0;
  }

  async clearProxies(): Promise<void> {
    if (!db) return;
    await db.delete(proxies);
  }

  // Screen sessions
  async getScreenSessions(): Promise<ScreenSession[]> {
    if (!db) return [];
    return await db.select().from(screenSessions).orderBy(desc(screenSessions.createdAt));
  }

  async getScreenSessionById(id: string): Promise<ScreenSession | undefined> {
    if (!db) return undefined;
    const rows = await db.select().from(screenSessions).where(eq(screenSessions.id, id));
    return rows[0];
  }

  async getScreenSession(screenNumber: number): Promise<ScreenSession | undefined> {
    if (!db) return undefined;
    const rows = await db.select().from(screenSessions).where(eq(screenSessions.screenNumber, screenNumber));
    return rows[0];
  }

  async createScreenSession(insertSession: InsertScreenSession): Promise<ScreenSession> {
    if (!db) throw new Error('DB not configured');
    // Upsert-by-screenNumber behavior: update if exists, else insert
    const existing = await this.getScreenSession(insertSession.screenNumber);
    if (existing) {
      const updates: Partial<ScreenSession> = {
        ...insertSession,
        id: existing.id,
        lastRefresh: new Date(),
      } as any;
      const rows = await db.update(screenSessions).set(updates as any).where(eq(screenSessions.id, existing.id)).returning();
      return rows[0];
    }
    const row = {
      ...insertSession,
      id: randomUUID(),
      proxyId: insertSession.proxyId ?? null,
      refreshInterval: insertSession.refreshInterval ?? 30,
      isActive: (insertSession as any).isActive ?? true,
      friendly: (insertSession as any).friendly ?? true,
      createdAt: new Date(),
      lastRefresh: new Date(),
    } as any;
    const rows = await db.insert(screenSessions).values(row).returning();
    return rows[0];
  }

  async updateScreenSession(id: string, updates: Partial<ScreenSession>): Promise<ScreenSession | undefined> {
    if (!db) return undefined;
    const rows = await db.update(screenSessions).set(updates as any).where(eq(screenSessions.id, id)).returning();
    return rows[0];
  }

  async deleteScreenSession(id: string): Promise<boolean> {
    if (!db) return false;
    const rows = await db.delete(screenSessions).where(eq(screenSessions.id, id)).returning();
    return rows.length > 0;
  }

  async clearScreenSessions(): Promise<void> {
    if (!db) return;
    await db.delete(screenSessions);
  }
}

export const storage: IStorage = db ? new DbStorage() : new MemStorage();
