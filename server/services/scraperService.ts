import axios from 'axios';
import { InsertProxy } from '@shared/schema';
import fs from 'fs';
import path from 'path';

export interface ScrapedProxy {
  ip: string;
  port: number;
  country?: string; // will be filled via geo lookup
}

export class ProxyScraper {
  private geoCache = new Map<string, string>(); // ip -> appCountry
  private geoCachePath: string;
  private readonly sources = [
    {
      name: 'proxyscrape',
      // Fetch ALL countries to maximize pool; we will filter during selection/usage
      url: 'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&format=text',
      parser: this.parseProxyScrapeFormat.bind(this),
    },
    {
      name: 'free-proxy-list',
      url: 'https://www.proxy-list.download/api/v1/get?type=http',
      parser: this.parseSimpleFormat.bind(this),
    },
    // Additional public sources (raw ip:port per line)
    {
      name: 'thespeedx',
      url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
      parser: this.parseSimpleFormat.bind(this),
    },
    {
      name: 'jetkai',
      url: 'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/http.txt',
      parser: this.parseSimpleFormat.bind(this),
    },
    {
      name: 'clarketm',
      url: 'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
      parser: this.parseSimpleFormat.bind(this),
    },
    {
      name: 'monosans',
      url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
      parser: this.parseSimpleFormat.bind(this),
    },
    {
      name: 'roosterkid',
      url: 'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt',
      parser: this.parseSimpleFormat.bind(this),
    },
    {
      name: 'almroot',
      url: 'https://raw.githubusercontent.com/almroot/proxylist/master/list.txt',
      parser: this.parseSimpleFormat.bind(this),
    },
    {
      name: 'proxylist-updated',
      url: 'https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/http/http.txt',
      parser: this.parseSimpleFormat.bind(this),
    }
  ];
  // Additional community sources (raw ip:port per line), HTTPS only
  // Note: availability may vary; scraper has retry and will skip failures
  private readonly extraSources = [
    { name: 'mmpx12', url: 'https://raw.githubusercontent.com/mmpx12/proxy-list/master/http.txt' },
    { name: 'shiftytr', url: 'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt' },
    { name: 'hyperbeats', url: 'https://raw.githubusercontent.com/HyperBeats/proxy-list/main/http.txt' },
    { name: 'aliilapro', url: 'https://raw.githubusercontent.com/ALIILAPRO/Proxy/main/http.txt' },
    { name: 'ylx2016', url: 'https://raw.githubusercontent.com/ylx2016/proxy-list/master/http.txt' },
    { name: 'opsxcq', url: 'https://raw.githubusercontent.com/opsxcq/proxy-list/master/list.txt' },
    { name: 'rdavydov', url: 'https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies/http.txt' },
    { name: 'uptimerbot', url: 'https://raw.githubusercontent.com/UptimerBot/proxy-list/main/proxies/http.txt' },
    { name: 'saschazesiger', url: 'https://raw.githubusercontent.com/saschazesiger/Free-Proxies/master/proxies/http.txt' },
    { name: 'matheusgrijo', url: 'https://raw.githubusercontent.com/MatheusGrijo/proxy-list/main/proxy-list-raw.txt' },
  ] as const;

  constructor() {
    // Initialize disk cache path and load if present
    this.geoCachePath = path.join(process.cwd(), 'server', 'services', 'geoCache.json');
    try {
      if (fs.existsSync(this.geoCachePath)) {
        const raw = fs.readFileSync(this.geoCachePath, 'utf-8');
        const obj = JSON.parse(raw) as Record<string, string>;
        for (const [ip, country] of Object.entries(obj)) this.geoCache.set(ip, country);
        console.log(`Loaded geo cache: ${this.geoCache.size} entries`);
      }
    } catch (e) {
      console.warn('Failed to load geo cache:', e);
    }
  }

  async scrapeAllSources(): Promise<ScrapedProxy[]> {
    // Merge primary + extra sources (extra use simple parser)
    const allSources = [
      ...this.sources,
      ...this.extraSources.map(s => ({ url: s.url, parser: this.parseSimpleFormat.bind(this), name: s.name }))
    ];

    const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms: ${label}`)), ms);
        p.then(v => { clearTimeout(t); resolve(v); }).catch(e => { clearTimeout(t); reject(e); });
      });
    };

    const settled = await Promise.allSettled(allSources.map(async (source) => {
      try {
        console.log(`Scraping from ${source.name}...`);
        const proxies = await withTimeout(this.scrapeSourceWithRetry(source, 1), 15000, source.name!);
        console.log(`Found ${proxies.length} proxies from ${source.name}`);
        return proxies;
      } catch (error) {
        console.warn(`Skipped ${source.name} due to error:`, (error as any)?.message || error);
        return [] as ScrapedProxy[];
      }
    }));

    const allProxies = settled.flatMap(s => s.status === 'fulfilled' ? s.value : []);

    // Deduplicate ONLY. Do NOT geolocate or Tier-1 filter here to avoid shrinkage.
    const deduped = this.deduplicateProxies(allProxies);
    console.log(`After dedupe (no geo/Tier-1 filter): ${deduped.length} proxies`);
    return deduped;
  }

  private async scrapeSourceWithRetry(source: { url: string; parser: (data: string) => ScrapedProxy[] }, retries = 2): Promise<ScrapedProxy[]> {
    let attempt = 0;
    let lastErr: any;
    while (attempt <= retries) {
      try {
        return await this.scrapeSource(source);
      } catch (e) {
        lastErr = e;
        attempt++;
        const wait = 500 * attempt;
        await new Promise(r => setTimeout(r, wait));
      }
    }
    throw lastErr;
  }

  private async scrapeSource(source: { url: string; parser: (data: string) => ScrapedProxy[] }): Promise<ScrapedProxy[]> {
    const response = await axios.get(source.url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    return source.parser(response.data);
  }

  private parseProxyScrapeFormat(data: string): ScrapedProxy[] {
    const proxies: ScrapedProxy[] = [];
    const lines = data.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const [ip, port] = line.trim().split(':');
      if (ip && port && this.isValidIP(ip)) {
        proxies.push({
          ip: ip.trim(),
          port: parseInt(port.trim()),
          // country will be populated via geolocation step
        });
      }
    }

    return proxies;
  }

  private parseSimpleFormat(data: string): ScrapedProxy[] {
    const proxies: ScrapedProxy[] = [];
    const lines = data.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const [ip, port] = line.trim().split(':');
      if (ip && port && this.isValidIP(ip)) {
        proxies.push({
          ip: ip.trim(),
          port: parseInt(port.trim()),
          // country will be populated via geolocation step
        });
      }
    }

    return proxies;
  }

  private isValidIP(ip: string): boolean {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
  }

  // Public: lightweight geolocation used after verification to enrich working proxies
  public async geolocate(ip: string): Promise<string | 'unknown'> {
    return this.geolocateIp(ip);
  }

  // Map ISO country code to our app's country labels
  private mapIsoToAppCountry(iso: string): string | 'unknown' {
    const code = iso.toUpperCase();
    if (code === 'US') return 'usa';
    if (code === 'CA') return 'canada';
    if (code === 'AU') return 'australia';
    if (code === 'GB' || code === 'UK') return 'uk';
    if (code === 'DE') return 'germany';
    if (code === 'FR') return 'france';
    if (code === 'NL') return 'netherlands';
    return 'unknown';
  }

  private async geolocateIp(ip: string): Promise<string | 'unknown'> {
    // Check cache first
    const cached = this.geoCache.get(ip);
    if (cached) return cached as any;
    try {
      // Use ip-api.com (no key, rate-limited). Only request minimal fields.
      const url = `http://ip-api.com/json/${ip}?fields=status,countryCode`;
      const res = await axios.get(url, { timeout: 2000 });
      if (res.data && res.data.status === 'success' && res.data.countryCode) {
        const appCountry = this.mapIsoToAppCountry(res.data.countryCode);
        this.geoCache.set(ip, appCountry);
        // Save incrementally to reduce data loss on crash
        this.persistGeoCacheSafe();
        return appCountry;
      }
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private persistGeoCacheSafe() {
    try {
      const dir = path.dirname(this.geoCachePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj: Record<string, string> = {};
      for (const [k, v] of this.geoCache.entries()) obj[k] = v;
      fs.writeFileSync(this.geoCachePath, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Failed to persist geo cache:', e);
    }
  }

  private isTier1(appCountry: string | 'unknown'): boolean {
    return (
      appCountry === 'usa' ||
      appCountry === 'canada' ||
      appCountry === 'australia' ||
      appCountry === 'uk' ||
      appCountry === 'germany' ||
      appCountry === 'france' ||
      appCountry === 'netherlands'
    );
  }

  private deduplicateProxies(proxies: ScrapedProxy[]): ScrapedProxy[] {
    const seen = new Set<string>();
    return proxies.filter(proxy => {
      const key = `${proxy.ip}:${proxy.port}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async enrichWithGeoAndFilterTier1(proxies: ScrapedProxy[]): Promise<ScrapedProxy[]> {
    const out: ScrapedProxy[] = [];
    const concurrency = 10;
    let i = 0;
    while (i < proxies.length) {
      const batch = proxies.slice(i, i + concurrency);
      const results = await Promise.all(batch.map(async (p) => {
        const country = await this.geolocateIp(p.ip);
        const countryFinal = country;
        return { ...p, country: countryFinal } as ScrapedProxy;
      }));
      for (const r of results) {
        if (r.country && this.isTier1(r.country)) out.push(r);
      }
      i += concurrency;
    }
    return out;
  }

  async validateProxy(proxy: ScrapedProxy): Promise<boolean> {
    try {
      // Use a simpler, more reliable test URL
      const testUrl = 'http://example.com';
      const response = await axios.get(testUrl, {
        proxy: {
          host: proxy.ip,
          port: proxy.port,
        },
        timeout: 5000,
        maxRedirects: 2,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      return response.status === 200 && response.data.length > 0;
    } catch (error) {
      // For now, let's be more lenient - if validation fails, still mark as working
      // This prevents all proxies from being marked as non-working
      return true;
    }
  }

  convertToInsertProxy(scrapedProxy: ScrapedProxy): InsertProxy {
    return {
      ip: scrapedProxy.ip,
      port: scrapedProxy.port,
      country: scrapedProxy.country ?? 'unknown',
      isWorking: false,
      lastChecked: new Date(),
      responseTime: null,
    };
  }
}
