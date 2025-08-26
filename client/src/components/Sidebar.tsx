import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Play, Square, RefreshCw, RotateCcw } from "lucide-react";
import { useProxyData } from "@/hooks/useProxyData";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ProxyConfig {
  location: string;
  targetUrl: string;
  refreshInterval: number;
}

interface SidebarProps {
  onClose?: () => void;
}

export default function Sidebar({ onClose }: SidebarProps = {}) {
  // Normalize a user-entered URL to have a single scheme (default https)
  const normalizeUrl = (raw: string): string => {
    if (!raw) return raw;
    let s = raw.trim();
    // Remove any leading scheme repetitions like https://https://
    s = s.replace(/^\s*/g, '').replace(/^(https?:\/\/)+/i, (m) => m.split('://')[0] + '://');
    // If after collapsing it still doesn't parse, try stripping scheme entirely then add https
    try {
      // If URL lacks scheme, this will throw; we'll catch and fix below
      // eslint-disable-next-line no-new
      new URL(s);
    } catch {
      s = s.replace(/^(https?:)?\/\//i, '');
      s = 'https://' + s;
    }
    return s;
  };
  const [config, setConfig] = useState<ProxyConfig>({
    location: "",
    targetUrl: "",
    refreshInterval: 30,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [workingOnly, setWorkingOnly] = useState(false);

  const { proxyStats } = useProxyData();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Simple timeout wrapper for apiRequest
  const withTimeout = async <T,>(p: Promise<T>, ms: number, label: string): Promise<T> => {
    let t: any;
    const timeout = new Promise<never>((_, reject) => {
      t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    try {
      const res = await Promise.race([p, timeout]);
      return res as T;
    } finally {
      clearTimeout(t);
    }
  };

  // Run tasks with limited concurrency
  const runLimited = async <T,>(tasks: Array<() => Promise<T>>, limit = 4): Promise<(T | null)[]> => {
    const results: (T | null)[] = [];
    let i = 0;
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (i < tasks.length) {
        const idx = i++;
        try {
          results[idx] = await tasks[idx]();
        } catch {
          results[idx] = null;
        }
      }
    });
    await Promise.all(workers);
    return results;
  };

  const startProxyMutation = useMutation({
    mutationFn: async () => {
      if (!config.location || !config.targetUrl) {
        throw new Error("Please select location and enter target URL");
      }

      // First clear any existing screen sessions (with timeout)
      await withTimeout(apiRequest("DELETE", "/api/screen-sessions"), 6000, 'Clear screens');

      // Pick one working proxy for this country to pin across all screens
      const pickRes = await withTimeout(apiRequest("GET", `/api/pick-proxy?country=${encodeURIComponent(config.location)}`), 7000, 'Pick proxy');
      const pick = await pickRes.json();
      const pinnedProxyId = pick?.proxyId as string | undefined;
      if (!pinnedProxyId) {
        throw new Error("No working proxy available for the selected country right now");
      }

      // Create screen sessions for exactly 10 screens with timeout and limited concurrency
      const normalizedTarget = normalizeUrl(config.targetUrl);
      const tasks = Array.from({ length: 10 }, (_, index) => async () => {
        const res = await withTimeout(
          apiRequest("POST", "/api/screen-sessions", {
            screenNumber: index + 1,
            targetUrl: normalizedTarget,
            country: config.location,
            proxyId: pinnedProxyId,
            refreshInterval: config.refreshInterval,
            isActive: true,
          }),
          8000,
          `Create screen ${index + 1}`
        );
        return res;
      });
      const results = await runLimited(tasks, 4);
      const succeeded = results.filter(Boolean).length;
      if (succeeded === 0) {
        throw new Error('Failed to create any screens (timeouts or errors).');
      }
    },
    retry: 1,
    retryDelay: (attempt) => 1500 * attempt,
    onSuccess: () => {
      setIsRunning(true);
      queryClient.invalidateQueries({ queryKey: ["/api/screen-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proxy-stats"] });
      toast({
        title: "Success",
        description: "Proxy grid started successfully",
      });
    },
    onError: (error: any) => {
      // Ensure the UI does not remain in a stuck "running" state after an error
      setIsRunning(false);
      toast({
        title: "Error",
        description: error.message || "Failed to start proxy grid",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Ensure UI state reflects reality (non-blocking)
      fetch('/api/screen-sessions', { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then(sessions => {
          if (sessions) setIsRunning(Array.isArray(sessions) && sessions.length > 0);
        })
        .catch(() => {/* ignore */});
    }
  });

  const stopProxyMutation = useMutation({
    mutationFn: () => withTimeout(apiRequest("DELETE", "/api/screen-sessions"), 8000, 'Stop screens'),
    onSuccess: () => {
      setIsRunning(false);
      queryClient.invalidateQueries({ queryKey: ["/api/screen-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proxy-stats"] });
      toast({
        title: "Success",
        description: "All screens stopped",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to stop screens",
        variant: "destructive",
      });
    },
    onSettled: async () => {
      // Ensure UI state reflects reality even if request failed or timed out
      try {
        const res = await fetch('/api/screen-sessions', { credentials: 'include' });
        if (res.ok) {
          const sessions = await res.json();
          setIsRunning(Array.isArray(sessions) && sessions.length > 0);
        } else {
          setIsRunning(false);
        }
      } catch {
        setIsRunning(false);
      }
    }
  });

  const updateProxiesMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/update-proxies"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proxy-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/screen-sessions"] });
      toast({
        title: "Success",
        description: "Proxy update completed",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update proxies",
        variant: "destructive",
      });
    },
  });

  const handleStart = () => {
    if (startProxyMutation.isPending) return; // prevent concurrent starts
    startProxyMutation.mutate();
  };

  const handleStop = () => {
    stopProxyMutation.mutate();
  };

  const handleUpdateProxies = () => {
    updateProxiesMutation.mutate();
  };

  return (
    <div className="w-80 md:w-80 bg-dark-800 border-r border-dark-700 p-4 md:p-6 overflow-y-auto h-screen md:h-auto max-h-screen md:max-h-none overscroll-contain" data-testid="sidebar">
      {/* Mobile Close Button */}
      {onClose && (
        <div className="flex justify-between items-center mb-4 md:hidden">
          <h2 className="text-lg font-semibold text-white">Configuration</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-400 hover:text-white"
            data-testid="button-close-sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>
      )}
      
      <div className="space-y-6">
        {/* Configuration Panel */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white mb-4 hidden md:block">Configuration</h2>
          
          {/* Location Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-300">Location</Label>
            <div className="flex items-center space-x-2 text-xs text-gray-400">
              <input
                id="toggle-working-only"
                type="checkbox"
                checked={workingOnly}
                onChange={(e) => setWorkingOnly(e.target.checked)}
                className="h-3 w-3 accent-blue-500"
              />
              <label htmlFor="toggle-working-only">Working only</label>
            </div>
            <Select value={config.location} onValueChange={(value) => setConfig({ ...config, location: value })}>
              <SelectTrigger className="bg-dark-700 border-dark-600 text-white" data-testid="select-location">
                <SelectValue placeholder="Select Location" />
              </SelectTrigger>
              {(() => {
                const options = [
                  { key: 'unknown', label: '🌍 Unknown' },
                  { key: 'usa', label: '🇺🇸 United States' },
                  { key: 'canada', label: '🇨🇦 Canada' },
                  { key: 'australia', label: '🇦🇺 Australia' },
                  { key: 'uk', label: '🇬🇧 United Kingdom' },
                  { key: 'germany', label: '🇩🇪 Germany' },
                  { key: 'france', label: '🇫🇷 France' },
                  { key: 'netherlands', label: '🇳🇱 Netherlands' },
                ];
                const list = options.filter(o => !workingOnly || ((proxyStats?.workingByCountry?.[o.key as keyof typeof proxyStats.workingByCountry] as unknown as number) ?? 0) > 0);
                return (
                  <SelectContent className="bg-dark-700 border-dark-600">
                    {list.map(o => (
                      <SelectItem key={o.key} value={o.key}>
                        {o.label}{` — W: ${proxyStats?.workingByCountry?.[o.key as any] ?? 0} / ${proxyStats?.byCountry?.[o.key as any] ?? 0}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                );
              })()}
            </Select>
          </div>

          {/* URL Input */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-300">Target URL</Label>
            <Input
              type="url"
              placeholder="https://example.com"
              value={config.targetUrl}
              onChange={(e) => {
                // Collapse repeated schemes typed accidentally like https://https://example.com
                let v = e.target.value;
                v = v.replace(/^(https?:\/\/)+/i, (m) => {
                  const first = m.toLowerCase().startsWith('http://') ? 'http://' : 'https://';
                  return first;
                });
                setConfig({ ...config, targetUrl: v });
              }}
              onBlur={(e) => {
                const v = normalizeUrl(e.target.value);
                setConfig({ ...config, targetUrl: v });
              }}
              className="bg-dark-700 border-dark-600 text-white placeholder-gray-500"
              data-testid="input-target-url"
            />
          </div>

          {/* Refresh Interval */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-300">Refresh Interval</Label>
            <Select value={config.refreshInterval.toString()} onValueChange={(value) => setConfig({ ...config, refreshInterval: parseInt(value) })}>
              <SelectTrigger className="bg-dark-700 border-dark-600 text-white" data-testid="select-refresh-interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-dark-700 border-dark-600">
                <SelectItem value="15">15 seconds</SelectItem>
                <SelectItem value="30">30 seconds</SelectItem>
                <SelectItem value="60">60 seconds</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="space-y-3">
          <Button
            className="w-full bg-green-600 hover:bg-green-700"
            onClick={handleStart}
            disabled={isRunning || startProxyMutation.isPending}
            data-testid="button-start-proxy"
          >
            <Play className="w-4 h-4 mr-2" />
            {startProxyMutation.isPending ? "Starting..." : (startProxyMutation.isError ? "Retry Start" : "Start Proxy Grid")}
          </Button>
          
          <Button
            className="w-full bg-red-600 hover:bg-red-700"
            onClick={handleStop}
            disabled={!isRunning || stopProxyMutation.isPending}
            data-testid="button-stop-proxy"
          >
            <Square className="w-4 h-4 mr-2" />
            {stopProxyMutation.isPending ? "Stopping..." : "Stop All Screens"}
          </Button>
        </div>

        {/* Proxy Statistics */}
        <Card className="bg-dark-700 border-dark-600">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
              Proxy Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Total Proxies</span>
              <span className="text-blue-400" data-testid="text-total-proxy-count">
                {proxyStats?.total ?? 0}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Working</span>
              <span className="text-green-400" data-testid="text-working-proxy-count">
                {proxyStats?.working ?? 0}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">USA Proxies</span>
              <span className="text-green-400" data-testid="text-usa-proxy-count">
                {proxyStats?.byCountry?.usa || 0}
                {typeof proxyStats?.workingByCountry?.usa === 'number' && (
                  <span className="text-blue-400 ml-2">(W: {proxyStats.workingByCountry.usa})</span>
                )}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Canada Proxies</span>
              <span className="text-green-400" data-testid="text-canada-proxy-count">
                {proxyStats?.byCountry?.canada || 0}
                {typeof proxyStats?.workingByCountry?.canada === 'number' && (
                  <span className="text-blue-400 ml-2">(W: {proxyStats.workingByCountry.canada})</span>
                )}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Australia Proxies</span>
              <span className="text-green-400" data-testid="text-australia-proxy-count">
                {proxyStats?.byCountry?.australia || 0}
                {typeof proxyStats?.workingByCountry?.australia === 'number' && (
                  <span className="text-blue-400 ml-2">(W: {proxyStats.workingByCountry.australia})</span>
                )}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">UK Proxies</span>
              <span className="text-green-400" data-testid="text-uk-proxy-count">
                {proxyStats?.byCountry?.uk || 0}
                {typeof proxyStats?.workingByCountry?.uk === 'number' && (
                  <span className="text-blue-400 ml-2">(W: {proxyStats.workingByCountry.uk})</span>
                )}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Germany Proxies</span>
              <span className="text-green-400" data-testid="text-germany-proxy-count">
                {proxyStats?.byCountry?.germany || 0}
                {typeof proxyStats?.workingByCountry?.germany === 'number' && (
                  <span className="text-blue-400 ml-2">(W: {proxyStats.workingByCountry.germany})</span>
                )}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">France Proxies</span>
              <span className="text-green-400" data-testid="text-france-proxy-count">
                {proxyStats?.byCountry?.france || 0}
                {typeof proxyStats?.workingByCountry?.france === 'number' && (
                  <span className="text-blue-400 ml-2">(W: {proxyStats.workingByCountry.france})</span>
                )}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Netherlands Proxies</span>
              <span className="text-green-400" data-testid="text-netherlands-proxy-count">
                {proxyStats?.byCountry?.netherlands || 0}
                {typeof proxyStats?.workingByCountry?.netherlands === 'number' && (
                  <span className="text-blue-400 ml-2">(W: {proxyStats.workingByCountry.netherlands})</span>
                )}
              </span>
            </div>
            
            <div className="pt-2 border-t border-dark-600">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Last Updated</span>
                <span className="text-blue-400" data-testid="text-last-proxy-update">
                  {proxyStats?.lastUpdated ? new Date(proxyStats.lastUpdated).toLocaleTimeString() : 'Never'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Auto Proxy Update Status */}
        <Card className="bg-dark-700 border-dark-600">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <RefreshCw className="w-4 h-4 animate-spin" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Auto Updater</p>
                <p className="text-xs text-gray-400">Scraping new proxies...</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-3 bg-dark-600 border-dark-500"
              onClick={handleUpdateProxies}
              disabled={updateProxiesMutation.isPending}
              data-testid="button-update-proxies"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              {updateProxiesMutation.isPending ? "Updating..." : "Force Update"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
