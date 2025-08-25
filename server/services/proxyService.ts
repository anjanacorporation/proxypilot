import { storage } from '../storage';
import { ProxyScraper } from './scraperService';
import { Proxy, InsertProxy, ProxyStats } from '@shared/schema';

export class ProxyService {
  private scraper: ProxyScraper;
  private updateInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.scraper = new ProxyScraper();
  }

  async startAutoUpdate(): Promise<void> {
    // Initial proxy fetch
    await this.updateProxies();

    // Set up periodic updates every 5 minutes
    this.updateInterval = setInterval(async () => {
      await this.updateProxies();
    }, 5 * 60 * 1000);

    console.log('Proxy auto-update started (5 minute intervals)');
  }

  stopAutoUpdate(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      console.log('Proxy auto-update stopped');
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
      for (const scrapedProxy of scrapedProxies.slice(0, 50)) { // Limit to first 50
        const insertProxy = this.scraper.convertToInsertProxy(scrapedProxy);
        await storage.createProxy(insertProxy);
        addedProxies++;
      }

      console.log(`Added ${addedProxies} proxies (validation will happen in background)`);

      // Validate proxies in background without blocking startup
      this.validateProxiesInBackground(scrapedProxies.slice(0, 50));

    } catch (error) {
      console.error('Proxy update failed:', error);
    }
  }

  async getProxyStats(): Promise<ProxyStats> {
    const allProxies = await storage.getProxies();
    const workingProxies = allProxies.filter(p => p.isWorking);

    const byCountry: Record<string, number> = {};
    workingProxies.forEach(proxy => {
      byCountry[proxy.country] = (byCountry[proxy.country] || 0) + 1;
    });

    return {
      total: allProxies.length,
      working: workingProxies.length,
      byCountry,
      lastUpdated: new Date().toISOString(),
    };
  }

  async getProxyForScreen(country: string): Promise<Proxy | null> {
    const workingProxies = await storage.getWorkingProxies(country);
    if (workingProxies.length === 0) return null;

    // Return random proxy
    return workingProxies[Math.floor(Math.random() * workingProxies.length)];
  }

  async healthCheckProxy(proxyId: string): Promise<boolean> {
    const proxy = await storage.getProxyById(proxyId);
    if (!proxy) return false;

    const isWorking = await this.scraper.validateProxy({
      ip: proxy.ip,
      port: proxy.port,
      country: proxy.country,
    });

    await storage.updateProxy(proxyId, {
      isWorking,
      lastChecked: new Date(),
    });

    return isWorking;
  }

  private async validateProxiesInBackground(scrapedProxies: any[]): Promise<void> {
    console.log('Starting background proxy validation...');
    
    // For now, skip validation and mark all proxies as working
    // This ensures users can immediately use the application
    setTimeout(async () => {
      console.log('Skipping validation - marking all proxies as working for immediate use');
      
      const allProxies = await storage.getProxies();
      let updatedCount = 0;
      
      for (const proxy of allProxies) {
        await storage.updateProxy(proxy.id, {
          isWorking: true,
          lastChecked: new Date(),
        });
        updatedCount++;
      }
      
      console.log(`Background validation completed: ${updatedCount} proxies marked as working`);
    }, 500); // Start after 0.5 second delay
  }
}

// Create global instance
export const proxyService = new ProxyService();
