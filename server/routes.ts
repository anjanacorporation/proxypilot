import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { proxyService } from "./services/proxyService";
import { insertScreenSessionSchema } from "@shared/schema";
import { createProxyMiddleware } from 'http-proxy-middleware';
import axios from 'axios';

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
      
      // Get a proxy for this session
      const proxy = await proxyService.getProxyForScreen(validatedData.country);
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

  // Proxy endpoint for fetching web content through proxies
  app.get("/api/proxy-fetch", async (req, res) => {
    try {
      const { url, proxyId } = req.query;
      
      if (!url || !proxyId) {
        return res.status(400).json({ message: "URL and proxyId are required" });
      }

      const proxy = await storage.getProxyById(proxyId as string);
      if (!proxy) {
        return res.status(404).json({ message: "Proxy not found" });
      }

      if (!proxy.isWorking) {
        return res.status(503).json({ message: "Proxy is not working" });
      }

      // Ensure URL has protocol
      let targetUrl = url as string;
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
      }

      console.log(`Fetching ${targetUrl} through proxy ${proxy.ip}:${proxy.port}`);

      const response = await axios.get(targetUrl, {
        proxy: {
          host: proxy.ip,
          port: proxy.port,
        },
        timeout: 15000,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
        }
      });

      // Set proper headers for iframe embedding
      res.set({
        'Content-Type': response.headers['content-type'] || 'text/html',
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': 'frame-ancestors *',
      });

      let htmlContent = response.data;
      
      // If it's HTML, modify it to work better in iframe
      if (typeof htmlContent === 'string' && htmlContent.includes('<html')) {
        // Add base tag to handle relative URLs
        const baseUrl = new URL(targetUrl).origin;
        htmlContent = htmlContent.replace(
          '<head>',
          `<head><base href="${baseUrl}/">`
        );
      }

      res.send(htmlContent);
    } catch (error: any) {
      console.error('Proxy fetch error:', error.message);
      
      // Return a simple error page for iframe
      const errorHtml = `
        <html>
          <body style="background: #1f2937; color: white; font-family: Arial; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
            <div style="text-align: center;">
              <h3>⚠️ Connection Failed</h3>
              <p>Unable to load content through proxy</p>
              <small>Error: ${error.message}</small>
            </div>
          </body>
        </html>
      `;
      
      res.status(500).set('Content-Type', 'text/html').send(errorHtml);
    }
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
