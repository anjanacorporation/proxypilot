import { storage } from '../storage';
import { ProxyScraper } from './scraperService';
import { Proxy, InsertProxy, ProxyStats } from '@shared/schema';
import axios from 'axios';
import { Socket } from 'net';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

export class ProxyService {
  private scraper: ProxyScraper;
  private updateInterval: NodeJS.Timeout | null = null;
  private revalidateInterval: NodeJS.Timeout | null = null;
  private geoEnrichInterval: NodeJS.Timeout | null = null;
  private failureCounts: Map<string, number> = new Map();
  private statsCache: { data: ProxyStats; ts: number } | null = null;

  constructor() {
    this.scraper = new ProxyScraper();
  }

  // Normalize input country to our canonical keys
  private normalizeCountry(c: string): string {
    if (!c) return c;
    const s = c.trim().toLowerCase();
    if (s === 'us' || s === 'united states' || s === 'united_states' || s === 'usa') return 'usa';
    if (s === 'ca' || s === 'can' || s === 'canada') return 'canada';
    if (s === 'au' || s === 'australia') return 'australia';
    if (s === 'gb' || s === 'uk' || s === 'united kingdom' || s === 'united_kingdom') return 'uk';
    if (s === 'de' || s === 'germany') return 'germany';
    if (s === 'fr' || s === 'france') return 'france';
    if (s === 'nl' || s === 'netherlands') return 'netherlands';
    if (s === 'unknown') return 'unknown';
    return s;
  }

  // Prefer typical HTTP proxy ports and exclude likely SOCKS ports (e.g., 1080)
  private isLikelyHttpProxy(port: number): boolean {
    const commonHttpPorts = new Set([80, 8080, 8081, 8082, 8000, 8888, 3128, 3129, 8118]);
    if (port === 1080) return false; // common SOCKS port
    // Allow known http ports or any high ephemeral port except known SOCKS
    return commonHttpPorts.has(port) || (port > 1024 && port !== 1080);
  }

  async startAutoUpdate(): Promise<void> {
    // Initial proxy fetch
    await this.updateProxies();

    // Set up periodic updates every 5 minutes
    this.updateInterval = setInterval(async () => {
      await this.updateProxies();
    }, 5 * 60 * 1000);

    console.log('Proxy auto-update started (5 minute intervals)');

    // Periodic background revalidation every 10 minutes
    this.revalidateInterval = setInterval(async () => {
      await this.verifyAllProxies();
    }, 10 * 60 * 1000);

    // Periodic slow geo enrichment every 15 minutes
    this.geoEnrichInterval = setInterval(async () => {
      await this.geolocateUnknownProxies();
    }, 15 * 60 * 1000);
  }

  stopAutoUpdate(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      console.log('Proxy auto-update stopped');
    }
    if (this.revalidateInterval) {
      clearInterval(this.revalidateInterval);
      this.revalidateInterval = null;
      console.log('Proxy revalidation stopped');
    }
    if (this.geoEnrichInterval) {
      clearInterval(this.geoEnrichInterval);
      this.geoEnrichInterval = null;
      console.log('Proxy geo enrichment stopped');
    }
  }

  async updateProxies(): Promise<void> {
    try {
      console.log('Starting proxy update...');
      
      // Scrape new proxies
      const scrapedProxies = await this.scraper.scrapeAllSources();
      console.log(`Scraped ${scrapedProxies.length} proxies`);

      // Clear existing proxies
      await storage.clearProxies();

      // Add proxies without validation initially (validate in background)
      let addedProxies = 0;
      for (const scrapedProxy of scrapedProxies.slice(0, 1_000_000)) { // Raise cap to 1,000,000
        const insertProxy = this.scraper.convertToInsertProxy(scrapedProxy);
        await storage.createProxy(insertProxy);
        addedProxies++;
      }

      console.log(`Added ${addedProxies} proxies (starting background validation)`);
      // Kick off background validation right after update
      this.verifyAllProxies().catch(() => {/* noop */});
      // Start slow geo enrichment in background as well
      this.geolocateUnknownProxies().catch(() => {/* noop */});

    } catch (error) {
      console.error('Proxy update failed:', error);
    }
  }

  async getProxyStats(): Promise<ProxyStats> {
    // Serve from cache if recent (within 5s) to support very large pools while keeping UI in sync
    const now = Date.now();
    if (this.statsCache && now - this.statsCache.ts < 5_000) {
      return this.statsCache.data;
    }
    const allProxies = await storage.getProxies();
    const workingProxies = allProxies.filter(p => p.isWorking);

    // Option A: byCountry reflects all proxies, not only working
    const byCountry: Record<string, number> = {};
    allProxies.forEach(proxy => {
      const key = proxy.country || 'unknown';
      byCountry[key] = (byCountry[key] || 0) + 1;
    });

    // Also compute working by country
    const workingByCountry: Record<string, number> = {};
    workingProxies.forEach(proxy => {
      const key = proxy.country || 'unknown';
      workingByCountry[key] = (workingByCountry[key] || 0) + 1;
    });

    const result: ProxyStats = {
      total: allProxies.length,
      working: workingProxies.length,
      byCountry,
      workingByCountry,
      lastUpdated: new Date().toISOString(),
    };
    this.statsCache = { data: result, ts: now };
    return result;
  }

  // Slow, rate-limit-friendly enrichment for proxies with unknown country
  private async geolocateUnknownProxies(): Promise<void> {
    const all = await storage.getProxies();
    const unknown = all.filter(p => !p.country || p.country === 'unknown');
    if (unknown.length === 0) return;
    console.log(`Geo enrichment: ${unknown.length} proxies need country`);

    const concurrency = 5;
    let i = 0;
    while (i < unknown.length) {
      const batch = unknown.slice(i, i + concurrency);
      await Promise.all(batch.map(async (p) => {
        try {
          const country = await this.scraper.geolocate(p.ip);
          if (country && country !== 'unknown') {
            await storage.updateProxy(p.id, { country });
          }
        } catch {/* ignore geo errors */}
      }));
      i += concurrency;
      // Gentle delay to respect public API limits
      await new Promise(r => setTimeout(r, 500));
    }
  }

  async getProxyForScreen(country: string): Promise<Proxy | null> {
    country = this.normalizeCountry(country);
    const STRICT_COUNTRY_PICK = String(process.env.STRICT_COUNTRY_PICK || '').toLowerCase() === 'true';
    // Prefer already-working proxies in the country (trust verification regardless of port)
    const candidates: Proxy[] = [];
    const workingInCountry = await storage.getWorkingProxies(country);
    candidates.push(...workingInCountry);
    if (candidates.length < 5) {
      // add more from country pool
      const allInCountry = (await storage.getProxies(country)).filter(p => this.isLikelyHttpProxy(p.port));
      for (const p of allInCountry) if (!candidates.find(c => c.id === p.id)) candidates.push(p);
    }
    // If strict country pick is on and we still have no candidates, fail fast
    if (STRICT_COUNTRY_PICK && candidates.length === 0) {
      return null;
    }
    if (candidates.length < 5) {
      // add any working globally to increase chances (only if not strict)
      if (!STRICT_COUNTRY_PICK) {
        const anyWorking = (await storage.getWorkingProxies()).filter(p => this.isLikelyHttpProxy(p.port));
        for (const p of anyWorking) if (!candidates.find(c => c.id === p.id)) candidates.push(p);
        // If we have any globally working proxies, return one immediately to avoid timeout
        if (anyWorking.length > 0) {
          const pick = anyWorking[Math.floor(Math.random() * anyWorking.length)];
          return pick;
        }
      }
    }

    // Shuffle candidates
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    // Fast path: if we have already-working proxies, return one immediately
    if (workingInCountry.length > 0) {
      const pick = workingInCountry[Math.floor(Math.random() * workingInCountry.length)];
      return pick;
    }

    // Slow path: parallel probe a tiny sample quickly and return first success
    // Keep this very fast to avoid client-side timeout in /api/pick-proxy
    const sample = candidates.slice(0, 8);
    const concurrency = 4;
    let idx = 0;
    // Only try at most two batches
    let batchesTried = 0;
    while (idx < sample.length && batchesTried < 2) {
      const batch = sample.slice(idx, idx + concurrency);
      const results = await Promise.all(batch.map(async (p) => {
        const { ok } = await this.healthCheckViaProxy(p, 2500);
        await storage.updateProxy(p.id, { isWorking: ok, lastChecked: new Date() });
        return ok ? p : null;
      }));
      const good = results.find(Boolean);
      if (good) return good as Proxy;
      idx += concurrency;
      batchesTried++;
    }

    return null;
  }

  async healthCheckProxy(proxyId: string): Promise<boolean> {
    let proxy = await storage.getProxyById(proxyId);
    
    // If proxy not found, try to get a working alternative
    if (!proxy) {
      console.log(`Proxy ${proxyId} not found for health check`);
      const workingProxies = await storage.getWorkingProxies();
      if (workingProxies.length > 0) {
        proxy = workingProxies[0];
      } else {
        return false;
      }
    }

    // Perform a quick real check via multiple lightweight endpoints
    const { ok, rt } = await this.healthCheckViaProxy(proxy, 12000);
    await storage.updateProxy(proxy.id, { isWorking: ok, lastChecked: new Date(), responseTime: rt ?? null });
    return ok;
  }

  private async healthCheckViaProxy(proxy: Proxy, timeoutMs: number): Promise<{ ok: boolean; rt: number | null }> {
    // HTTPS-only health check: proxy must successfully fetch an HTTPS URL via CONNECT
    const proxyUrl = `http://${proxy.ip}:${proxy.port}`;
    const httpsTestUrls = [
      'https://httpbin.org/get',
      'https://example.com/',
      'https://www.cloudflare.com/cdn-cgi/trace'
    ];
    for (const url of httpsTestUrls) {
      const started = Date.now();
      try {
        await axios.get(url, {
          proxy: false,
          timeout: timeoutMs,
          maxRedirects: 0,
          headers: { 'User-Agent': 'Mozilla/5.0' },
          validateStatus: () => true, // any HTTP status is fine; we only care about HTTPS tunnel working
          httpsAgent: new HttpsProxyAgent(proxyUrl),
        });
        return { ok: true, rt: Date.now() - started };
      } catch {/* try next url */}
    }
    // Do NOT mark as working based on TCP or HTTP-only; require HTTPS success
    return { ok: false, rt: null };
  }

  private tcpConnectTest(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new Socket();
      let settled = false;
      const done = (result: boolean) => {
        if (settled) return;
        settled = true;
        try { socket.destroy(); } catch {}
        resolve(result);
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
      try {
        socket.connect(port, host);
      } catch {
        done(false);
      }
    });
  }

  private async validateProxiesInBackground(scrapedProxies: any[]): Promise<void> {
    // Deprecated. Use verifyAllProxies instead.
    await this.verifyAllProxies();
  }

  // Public: verify all proxies concurrently with small concurrency to avoid overload
  async verifyAllProxies(): Promise<{ total: number; working: number }> {
    console.log('Verifying all proxies...');
    const allProxies = await storage.getProxies();
    const toCheck = allProxies.filter(p => this.isLikelyHttpProxy(p.port));
    let working = 0;

    // Increase concurrency to accelerate large batches (tuneable)
    const batchSize = 100;
    for (let i = 0; i < toCheck.length; i += batchSize) {
      const batch = toCheck.slice(i, i + batchSize);
      await Promise.all(batch.map(async (p) => {
        const { ok, rt } = await this.healthCheckViaProxy(p, 12000);
        if (ok) working++;
        // Enrich country after success if unknown
        let updates: Partial<Proxy> = { isWorking: ok, lastChecked: new Date(), responseTime: rt ?? null };
        if (ok && (!p.country || p.country === 'unknown')) {
          try {
            const country = await this.scraper.geolocate(p.ip);
            if (country && country !== 'unknown') updates.country = country as any;
          } catch {/* ignore geo errors */}
        }
        await storage.updateProxy(p.id, updates);
        if (ok) this.noteSuccess(p.id); else this.noteFailure(p.id);
      }));
    }
    console.log(`Proxy verification done. Working: ${working}/${toCheck.length}`);
    return { total: toCheck.length, working };
  }

  // Quick diagnostic: verify a small random sample and return basic reasons
  async verifySample(size: number = 50): Promise<{ tested: number; working: number; details: Array<{ id: string; ip: string; port: number; ok: boolean }> }> {
    const all = await storage.getProxies();
    const pool = all.filter(p => this.isLikelyHttpProxy(p.port));
    const tested: typeof pool = [];
    // Shuffle-like selection
    const seen = new Set<number>();
    while (tested.length < Math.min(size, pool.length)) {
      const idx = Math.floor(Math.random() * pool.length);
      if (seen.has(idx)) continue;
      seen.add(idx);
      tested.push(pool[idx]);
    }
    let working = 0;
    await Promise.all(tested.map(async (p) => {
      const res = await this.healthCheckViaProxy(p, 10000);
      if (res.ok) working++;
    }));
    return {
      tested: tested.length,
      working,
      details: tested.map(t => ({ id: t.id, ip: t.ip, port: t.port, ok: !!t.isWorking })),
    };
  }

  // Record a proxy success (decay failures)
  noteSuccess(id: string) {
    if (this.failureCounts.has(id)) {
      const v = Math.max(0, (this.failureCounts.get(id) || 0) - 1);
      if (v === 0) this.failureCounts.delete(id); else this.failureCounts.set(id, v);
    }
  }

  // Record a proxy failure and evict if it exceeds threshold
  async noteFailure(id: string, threshold: number = 5) {
    const v = (this.failureCounts.get(id) || 0) + 1;
    this.failureCounts.set(id, v);
    if (v >= threshold) {
      // Remove from storage to avoid reuse
      await storage.deleteProxy(id);
      this.failureCounts.delete(id);
      console.log(`Evicted bad proxy ${id} after ${v} failures`);
    }
  }
}

// Create global instance
export const proxyService = new ProxyService();
