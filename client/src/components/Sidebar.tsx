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

export default function Sidebar() {
  const [config, setConfig] = useState<ProxyConfig>({
    location: "",
    targetUrl: "",
    refreshInterval: 30,
  });
  const [isRunning, setIsRunning] = useState(false);

  const { proxyStats } = useProxyData();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const startProxyMutation = useMutation({
    mutationFn: async () => {
      if (!config.location || !config.targetUrl) {
        throw new Error("Please select location and enter target URL");
      }

      // Create screen sessions for 10 screens
      const promises = Array.from({ length: 10 }, (_, index) =>
        apiRequest("POST", "/api/screen-sessions", {
          screenNumber: index + 1,
          targetUrl: config.targetUrl,
          country: config.location,
          refreshInterval: config.refreshInterval,
          isActive: true,
        })
      );

      await Promise.all(promises);
    },
    onSuccess: () => {
      setIsRunning(true);
      queryClient.invalidateQueries({ queryKey: ["/api/screen-sessions"] });
      toast({
        title: "Success",
        description: "Proxy grid started successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start proxy grid",
        variant: "destructive",
      });
    },
  });

  const stopProxyMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/screen-sessions"),
    onSuccess: () => {
      setIsRunning(false);
      queryClient.invalidateQueries({ queryKey: ["/api/screen-sessions"] });
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
  });

  const updateProxiesMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/update-proxies"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proxy-stats"] });
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
    startProxyMutation.mutate();
  };

  const handleStop = () => {
    stopProxyMutation.mutate();
  };

  const handleUpdateProxies = () => {
    updateProxiesMutation.mutate();
  };

  return (
    <div className="w-80 bg-dark-800 border-r border-dark-700 p-6 overflow-y-auto" data-testid="sidebar">
      <div className="space-y-6">
        {/* Configuration Panel */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white mb-4">Configuration</h2>
          
          {/* Location Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-300">Location</Label>
            <Select value={config.location} onValueChange={(value) => setConfig({ ...config, location: value })}>
              <SelectTrigger className="bg-dark-700 border-dark-600 text-white" data-testid="select-location">
                <SelectValue placeholder="Select Location" />
              </SelectTrigger>
              <SelectContent className="bg-dark-700 border-dark-600">
                <SelectItem value="usa">🇺🇸 United States</SelectItem>
                <SelectItem value="canada">🇨🇦 Canada</SelectItem>
                <SelectItem value="australia">🇦🇺 Australia</SelectItem>
              </SelectContent>
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
                let url = e.target.value;
                // Auto-add https:// if not present
                if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
                  url = 'https://' + url;
                }
                setConfig({ ...config, targetUrl: url });
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
            {startProxyMutation.isPending ? "Starting..." : "Start Proxy Grid"}
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
              <span className="text-gray-400">USA Proxies</span>
              <span className="text-green-400" data-testid="text-usa-proxy-count">
                {proxyStats?.byCountry?.usa || 0}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Canada Proxies</span>
              <span className="text-green-400" data-testid="text-canada-proxy-count">
                {proxyStats?.byCountry?.canada || 0}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Australia Proxies</span>
              <span className="text-green-400" data-testid="text-australia-proxy-count">
                {proxyStats?.byCountry?.australia || 0}
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
