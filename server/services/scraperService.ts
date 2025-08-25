import axios from 'axios';
import { InsertProxy } from '@shared/schema';

export interface ScrapedProxy {
  ip: string;
  port: number;
  country: string;
}

export class ProxyScraper {
  private readonly sources = [
    {
      name: 'proxyscrape',
      url: 'https://api.proxyscrape.com/v2/?request=get&protocol=http&timeout=10000&country=US,CA,AU&format=textplain',
      parser: this.parseProxyScrapeFormat.bind(this),
    },
    {
      name: 'free-proxy-list',
      url: 'https://www.proxy-list.download/api/v1/get?type=http',
      parser: this.parseSimpleFormat.bind(this),
    }
  ];

  async scrapeAllSources(): Promise<ScrapedProxy[]> {
    const allProxies: ScrapedProxy[] = [];
    
    for (const source of this.sources) {
      try {
        console.log(`Scraping from ${source.name}...`);
        const proxies = await this.scrapeSource(source);
        allProxies.push(...proxies);
        console.log(`Found ${proxies.length} proxies from ${source.name}`);
      } catch (error) {
        console.error(`Failed to scrape ${source.name}:`, error);
      }
    }

    return this.deduplicateProxies(allProxies);
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
          country: this.getRandomCountry(), // Random assignment since country info not always available
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
          country: this.getRandomCountry(),
        });
      }
    }

    return proxies;
  }

  private isValidIP(ip: string): boolean {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
  }

  private getRandomCountry(): string {
    const countries = ['usa', 'canada', 'australia'];
    return countries[Math.floor(Math.random() * countries.length)];
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

  async validateProxy(proxy: ScrapedProxy): Promise<boolean> {
    try {
      const testUrl = 'http://httpbin.org/ip';
      const response = await axios.get(testUrl, {
        proxy: {
          host: proxy.ip,
          port: proxy.port,
        },
        timeout: 10000,
      });

      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  convertToInsertProxy(scrapedProxy: ScrapedProxy): InsertProxy {
    return {
      ip: scrapedProxy.ip,
      port: scrapedProxy.port,
      country: scrapedProxy.country,
      isWorking: true,
      lastChecked: new Date(),
      responseTime: null,
    };
  }
}
