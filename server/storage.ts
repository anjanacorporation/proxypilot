import { type User, type InsertUser, type Proxy, type InsertProxy, type ScreenSession, type InsertScreenSession } from "@shared/schema";
import { randomUUID } from "crypto";

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
      isWorking: insertProxy.isWorking ?? true,
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

  async getScreenSession(screenNumber: number): Promise<ScreenSession | undefined> {
    return Array.from(this.screenSessions.values()).find(
      session => session.screenNumber === screenNumber
    );
  }

  async createScreenSession(insertSession: InsertScreenSession): Promise<ScreenSession> {
    // Check if a session with this screen number already exists
    for (const [existingId, existingSession] of this.screenSessions) {
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

export const storage = new MemStorage();
