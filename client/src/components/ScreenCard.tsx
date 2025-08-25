import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, AlertTriangle, Loader2 } from "lucide-react";
import { ScreenSession, Proxy } from "@shared/schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface ScreenCardProps {
  session: ScreenSession;
  viewMode: 'grid' | 'list';
}

export default function ScreenCard({ session, viewMode }: ScreenCardProps) {
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const queryClient = useQueryClient();

  // Get proxy info
  const { data: proxy } = useQuery<Proxy>({
    queryKey: ["/api/proxies", session.proxyId],
    enabled: !!session.proxyId,
  });

  // Auto-refresh logic
  useEffect(() => {
    if (!session.isActive) return;

    const interval = setInterval(() => {
      setLastRefresh(new Date());
      // Here you would trigger content refresh
    }, session.refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [session.refreshInterval, session.isActive]);

  const refreshScreenMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/screen-sessions/${session.id}`, {
      lastRefresh: new Date(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screen-sessions"] });
      setLastRefresh(new Date());
    },
  });

  const handleRefresh = () => {
    refreshScreenMutation.mutate();
  };

  const getCountryFlag = (country: string) => {
    switch (country) {
      case 'usa': return '🇺🇸';
      case 'canada': return '🇨🇦';
      case 'australia': return '🇦🇺';
      default: return '🌍';
    }
  };

  const getStatusColor = () => {
    if (!session.isActive) return 'bg-gray-500';
    if (!proxy || !proxy.isWorking) return 'bg-red-500';
    return 'bg-green-500';
  };

  const getStatusText = () => {
    if (!session.isActive) return 'Inactive';
    if (!proxy) return 'No Proxy';
    if (!proxy.isWorking) return 'Connection Failed';
    return 'Live';
  };

  if (viewMode === 'list') {
    return (
      <div className="bg-dark-800 rounded-lg border border-dark-700 p-4 flex items-center space-x-4" data-testid={`screen-card-${session.screenNumber}`}>
        <div className="flex items-center space-x-3">
          <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
          <span className="text-white font-medium">Screen {session.screenNumber}</span>
        </div>
        
        <div className="flex-1">
          <p className="text-sm text-gray-300 truncate">{session.targetUrl}</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-400">
            {getCountryFlag(session.country)} {proxy?.ip || 'Loading...'}
          </span>
          <Badge variant="outline" className={`text-xs ${
            session.isActive && proxy?.isWorking ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400'
          }`}>
            {getStatusText()}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRefresh}
            disabled={refreshScreenMutation.isPending}
            data-testid={`button-refresh-screen-${session.screenNumber}`}
          >
            <RotateCcw className={`w-3 h-3 ${refreshScreenMutation.isPending ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-dark-800 rounded-lg border overflow-hidden group transition-all ${
      session.isActive && proxy?.isWorking 
        ? 'border-dark-700 hover:border-blue-500/50' 
        : 'border-red-500/50'
    }`} data-testid={`screen-card-${session.screenNumber}`}>
      {/* Header */}
      <div className="px-3 py-2 bg-dark-700 border-b border-dark-600 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${getStatusColor()} ${session.isActive ? 'animate-pulse' : ''}`} />
          <span className="text-xs text-gray-300">Screen {session.screenNumber}</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className="text-xs text-gray-400" data-testid={`proxy-info-${session.screenNumber}`}>
            {proxy ? `${getCountryFlag(session.country)} ${proxy.ip}` : 'Loading...'}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRefresh}
            disabled={refreshScreenMutation.isPending}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 h-auto"
            data-testid={`button-refresh-screen-${session.screenNumber}`}
          >
            <RotateCcw className={`w-3 h-3 ${refreshScreenMutation.isPending ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Content Area */}
      <div className="aspect-[16/10] bg-gray-900 relative">
        {session.isActive && proxy?.isWorking ? (
          <iframe
            src={`/api/proxy-fetch?url=${encodeURIComponent(session.targetUrl)}&proxyId=${session.proxyId}`}
            className="w-full h-full"
            title={`Screen ${session.screenNumber}`}
            sandbox="allow-same-origin allow-scripts"
            data-testid={`iframe-screen-${session.screenNumber}`}
          />
        ) : session.isActive && !proxy ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-6 h-6 text-amber-400 animate-spin mb-2 mx-auto" />
              <p className="text-sm text-gray-400">Connecting to proxy...</p>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <AlertTriangle className="w-6 h-6 text-red-400 mb-2 mx-auto" />
              <p className="text-sm text-gray-400">
                {!session.isActive ? 'Screen inactive' : 'Proxy connection failed'}
              </p>
              <Button
                size="sm"
                variant="link"
                onClick={handleRefresh}
                className="text-xs text-blue-400 hover:text-blue-300 mt-1 h-auto p-0"
                data-testid={`button-retry-screen-${session.screenNumber}`}
              >
                Retry
              </Button>
            </div>
          </div>
        )}
        
        {/* Status Badge */}
        <div className="absolute top-2 right-2">
          <Badge 
            variant="secondary" 
            className={`text-xs ${
              session.isActive && proxy?.isWorking 
                ? 'bg-black/50 text-white' 
                : 'bg-red-500/80 text-white'
            }`}
          >
            {getStatusText()}
          </Badge>
        </div>
      </div>
    </div>
  );
}
