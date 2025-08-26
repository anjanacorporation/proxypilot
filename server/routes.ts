import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { proxyService } from "./services/proxyService";
import { insertScreenSessionSchema } from "@shared/schema";
import { createProxyMiddleware } from 'http-proxy-middleware';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

// Map proxy country to an Accept-Language header to improve geo-consistency
function getAcceptLanguage(country?: string): string {
  const c = (country || '').toLowerCase();
  switch (c) {
    case 'usa': return 'en-US,en;q=0.9';
    case 'canada': return 'en-CA,en;q=0.8,fr-CA;q=0.6,fr;q=0.5';
    case 'australia': return 'en-AU,en;q=0.9';
    case 'uk': return 'en-GB,en;q=0.9';
    case 'germany': return 'de-DE,de;q=0.9,en;q=0.6';
    case 'france': return 'fr-FR,fr;q=0.9,en;q=0.6';
    case 'netherlands': return 'nl-NL,nl;q=0.9,en;q=0.6';
    default: return 'en-US,en;q=0.9';
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Start proxy auto-update service
  await proxyService.startAutoUpdate();

  // Get proxy statistics
  app.get("/api/proxy-stats", async (req, res) => {
    try {
      const stats = await proxyService.getProxyStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to get proxy statistics" });
    }
  });

  // Pick a single working proxy for a given country to pin across screens
  app.get("/api/pick-proxy", async (req, res) => {
    try {
      const { country } = req.query as { country?: string };
      if (!country) return res.status(400).json({ message: 'country is required' });
      const proxy = await proxyService.getProxyForScreen(country);
      if (!proxy) return res.status(404).json({ message: 'No proxy available' });
      res.json({ proxyId: proxy.id, ip: proxy.ip, port: proxy.port, country: proxy.country });
    } catch (error) {
      res.status(500).json({ message: 'Failed to pick proxy' });
    }
  });

  // List all proxies (for picking IDs to verify)
  app.get("/api/proxies", async (_req, res) => {
    try {
      const proxies = await storage.getProxies();
      res.json(proxies);
    } catch (error) {
      res.status(500).json({ message: "Failed to list proxies" });
    }
  });

  // Trigger verification of all proxies (automatic verify system)
  app.post("/api/proxies/verify-all", async (_req, res) => {
    try {
      const result = await proxyService.verifyAllProxies();
      res.json({ message: "Verification started/completed", ...result });
    } catch (error) {
      res.status(500).json({ message: "Failed to verify proxies" });
    }
  });

  // Diagnostic: verify a small random sample quickly
  app.get("/api/proxies/verify-sample", async (req, res) => {
    try {
      const size = Math.max(1, Math.min(200, parseInt(String(req.query.size || '50'), 10) || 50));
      const out = await proxyService.verifySample(size);
      res.json(out);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || 'Failed to run sample verification' });
    }
  });

  // Verify what IP/geo the target will see through a given proxy
  app.get("/api/proxy-verify", async (req, res) => {
    try {
      const { proxyId } = req.query as { proxyId?: string };
      if (!proxyId) return res.status(400).json({ message: 'proxyId is required' });
      const proxy = await storage.getProxyById(proxyId);
      if (!proxy) return res.status(404).json({ message: 'Proxy not found' });

      const proxyUrl = `http://${proxy.ip}:${proxy.port}`;
      const httpsAgent = new HttpsProxyAgent(proxyUrl);
      // 1) Detect external IP via proxy
      const ipResp = await axios.get('https://api.ipify.org?format=json', {
        proxy: false,
        httpsAgent,
        timeout: 5000,
      });
      const detectedIp = ipResp.data?.ip as string | undefined;
      if (!detectedIp) return res.status(502).json({ message: 'Could not detect IP via proxy' });

      // 2) Geolocate detected IP (no need to use proxy for this)
      const geoResp = await axios.get(`http://ip-api.com/json/${detectedIp}?fields=status,countryCode,query`, { timeout: 3000 });
      const countryCode = geoResp.data?.countryCode || 'XX';

      return res.json({
        requestedProxy: { id: proxy.id, ip: proxy.ip, port: proxy.port, country: proxy.country },
        detected: { ip: detectedIp, countryCode },
      });
    } catch (err: any) {
      return res.status(500).json({ message: err?.message || 'Proxy verify failed' });
    }
  });

  // Get individual proxy by ID
  app.get("/api/proxies/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const proxy = await storage.getProxyById(id);
      
      if (!proxy) {
        return res.status(404).json({ message: "Proxy not found" });
      }

      res.json(proxy);
    } catch (error) {
      res.status(500).json({ message: "Failed to get proxy" });
    }
  });

  // Get all screen sessions
  app.get("/api/screen-sessions", async (req, res) => {
    try {
      const sessions = await storage.getScreenSessions();
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "Failed to get screen sessions" });
    }
  });

  // Create new screen session
  app.post("/api/screen-sessions", async (req, res) => {
    try {
      const validatedData = insertScreenSessionSchema.parse(req.body);
      
      // If client provided a proxyId, try to use it as-is when valid and working
      let proxy: Awaited<ReturnType<typeof storage.getProxyById>> | null = null;
      if (validatedData.proxyId) {
        const p = await storage.getProxyById(validatedData.proxyId);
        if (p && p.isWorking) {
          proxy = p;
        }
      }
      // Fallback to autodetect
      if (!proxy) {
        proxy = await proxyService.getProxyForScreen(validatedData.country);
      }
      if (!proxy) {
        return res.status(400).json({ message: `No working proxies available for ${validatedData.country}` });
      }

      const session = await storage.createScreenSession({
        ...validatedData,
        proxyId: proxy.id,
      });

      res.json(session);
    } catch (error) {
      res.status(400).json({ message: "Invalid screen session data" });
    }
  });

  // Update screen session
  app.patch("/api/screen-sessions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const session = await storage.updateScreenSession(id, updates);
      if (!session) {
        return res.status(404).json({ message: "Screen session not found" });
      }

      res.json(session);
    } catch (error) {
      res.status(500).json({ message: "Failed to update screen session" });
    }
  });

  // Delete screen session
  app.delete("/api/screen-sessions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteScreenSession(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Screen session not found" });
      }

      res.json({ message: "Screen session deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete screen session" });
    }
  });

  // Clear all screen sessions
  app.delete("/api/screen-sessions", async (req, res) => {
    try {
      await storage.clearScreenSessions();
      res.json({ message: "All screen sessions cleared" });
    } catch (error) {
      res.status(500).json({ message: "Failed to clear screen sessions" });
    }
  });

  // Proxy endpoint for fetching web content through proxies (with in-request rotation)
  app.get("/api/proxy-fetch", async (req, res) => {
    const { url, proxyId, sessionId } = req.query as { url?: string; proxyId?: string; sessionId?: string };
    if (!url || !proxyId) {
      return res.status(400).json({ message: "URL and proxyId are required" });
    }

    // Ensure URL has protocol
    let targetUrl = url as string;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://' + targetUrl;
    }
    // Enforce HTTPS-only: if user passed http://, upgrade to https://
    if (targetUrl.startsWith('http://')) {
      try {
        const u = new URL(targetUrl);
        u.protocol = 'https:';
        targetUrl = u.toString();
      } catch { /* if URL parse fails, leave as-is */ }
    }

    // Build a queue of proxies to try: requested one first, then other working ones
    const tried = new Set<string>();
    const maxAttempts = 3;

    // Restrict to proxies likely to be HTTP and same country as the original when possible
    const allowedPorts = new Set([80, 8080, 8081, 8082, 8000, 8888, 3128, 8118, 8811]);
    const tier1 = new Set(['usa', 'canada', 'australia', 'uk', 'germany', 'france', 'netherlands']);
    const getBaseProxy = async () => await storage.getProxyById(proxyId as string);

    const pickNextProxy = async () => {
      // Prefer the requested proxy first
      if (!tried.has(proxyId as string)) {
        const p = await storage.getProxyById(proxyId as string);
        if (p) return p;
        tried.add(proxyId as string);
      }
      // If sessionId present: try pinned, then rotate within same country
      let targetCountry: string | undefined;
      if (sessionId) {
        const sess = await storage.getScreenSessionById(sessionId as string);
        if (sess?.proxyId && !tried.has(sess.proxyId)) {
          const pinned = await storage.getProxyById(sess.proxyId);
          if (pinned) return pinned;
          tried.add(sess.proxyId);
        }
        targetCountry = sess?.country;
      }

      // Then any other working proxy not yet tried (prefer same country)
      const working = await storage.getWorkingProxies();
      const base = await getBaseProxy();
      let candidates = working.filter(p => !tried.has(p.id) && allowedPorts.has(p.port));
      const countryToMatch = (targetCountry || base?.country);
      if (countryToMatch && tier1.has(countryToMatch)) {
        candidates = candidates.filter(p => p.country === countryToMatch);
      } else if (countryToMatch) {
        // Non-tier1 country: still match same country if possible
        candidates = candidates.filter(p => p.country === countryToMatch);
      } else {
        // No country found: prefer Tier-1
        candidates = candidates.filter(p => tier1.has(p.country));
      }
      if (candidates.length === 0) return null;
      return candidates[Math.floor(Math.random() * candidates.length)];
    };
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const proxy = await pickNextProxy();
      if (!proxy) break;
      tried.add(proxy.id);

      try {
        const proxyUrl = `http://${proxy.ip}:${proxy.port}`;
        const agentOpts = { httpsAgent: new HttpsProxyAgent(proxyUrl) };
        const acceptLanguage = getAcceptLanguage(proxy.country);
        const startedAt = Date.now();
        const response = await axios.get(targetUrl, {
          proxy: false,
          timeout: 8000,
          maxRedirects: 5,
          validateStatus: () => true,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': acceptLanguage,
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
          },
          ...agentOpts,
        });

        // If upstream rejects (4xx/5xx), try rotating to another proxy
        if (response.status >= 400) {
          // Do NOT mark as not working for 4xx (site policy); continue to next
          continue;
        }

        // Success: mark proxy as working and record metrics
        try {
          const rt = Math.max(1, Date.now() - startedAt);
          await storage.updateProxy(proxy.id, { isWorking: true, lastChecked: new Date(), responseTime: rt });
          await proxyService.noteSuccess(proxy.id);
        } catch { /* ignore metric update errors */ }

        // Success: if sessionId provided, unify all active sessions in same country to this proxy
        if (sessionId) {
          try {
            const sess = await storage.getScreenSessionById(sessionId as string);
            if (sess) {
              const sessions = await storage.getScreenSessions();
              const sameCountryActive = sessions.filter(s => s.isActive && s.country === sess.country);
              await Promise.all(sameCountryActive.map(s =>
                s.proxyId !== proxy.id ? storage.updateScreenSession(s.id, { proxyId: proxy.id }) : Promise.resolve(s)
              ));
            }
          } catch { /* ignore session update errors */ }
        }

        res.set({
          'Content-Type': response.headers['content-type'] || 'text/html',
          'X-Frame-Options': 'ALLOWALL',
          'Content-Security-Policy': 'frame-ancestors *',
        });

        let htmlContent = response.data;
        if (typeof htmlContent === 'string' && htmlContent.includes('<html')) {
          const baseUrl = new URL(targetUrl).origin;
          htmlContent = htmlContent.replace(
            '<head>',
            `<head><base href="${baseUrl}/">`
          );
        }

        return res.status(response.status || 200).send(htmlContent);
      } catch (error: any) {
        console.error('Proxy fetch error:', error?.message || error);
        // Mark this proxy as not working, continue to next
        try {
          await storage.updateProxy(proxy.id, { isWorking: false, lastChecked: new Date() });
          // Record failure; may evict after threshold
          await proxyService.noteFailure(proxy.id);
        } catch {}
        // next attempt
      }
    }

    // All attempts failed
    const errorHtml = `
      <html>
        <body style="background: #1f2937; color: white; font-family: Arial; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
          <div style="text-align: center;">
            <h3>⚠️ Connection Failed</h3>
            <p>Unable to load content through any proxy</p>
            <small>All attempts timed out or were refused</small>
          </div>
        </body>
      </html>
    `;
    return res.status(500).set('Content-Type', 'text/html').send(errorHtml);
  });

  // Force proxy update
  app.post("/api/update-proxies", async (req, res) => {
    try {
      await proxyService.updateProxies();
      res.json({ message: "Proxy update completed" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update proxies" });
    }
  });

  // Health check specific proxy
  app.post("/api/proxy-health/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const isHealthy = await proxyService.healthCheckProxy(id);
      res.json({ proxyId: id, isHealthy });
    } catch (error) {
      res.status(500).json({ message: "Failed to check proxy health" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
