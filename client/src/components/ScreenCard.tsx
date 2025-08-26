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
  const { data: proxy, isLoading: proxyLoading, isError: proxyError } = useQuery<Proxy>({
    queryKey: ["/api/proxies", session.proxyId],
    queryFn: async () => {
      if (!session.proxyId) throw new Error("No proxyId");
      const res = await apiRequest("GET", `/api/proxies/${session.proxyId}`);
      return res.json();
    },
    enabled: !!session.proxyId,
    staleTime: 10_000,
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
      case 'uk': return '🇬🇧';
      case 'germany': return '🇩🇪';
      case 'france': return '🇫🇷';
      case 'netherlands': return '🇳🇱';
      default: return '🌍';
    }
  };

  const getStatusColor = () => {
    if (!session.isActive) return 'bg-gray-500';
    if (proxyLoading) return 'bg-yellow-500';
    if (proxyError || !proxy || !proxy.isWorking) return 'bg-red-500';
    return 'bg-green-500';
  };

  const getStatusText = () => {
    if (!session.isActive) return 'Inactive';
    if (proxyLoading) return 'Loading Proxy';
    if (proxyError) return 'Proxy Error';
    if (!proxy) return 'No Proxy';
    if (!proxy.isWorking) return 'Connection Failed';
    return 'Live';
  };

  if (viewMode === 'list') {
    return (
      <div className="bg-dark-800 rounded-lg border border-dark-700 p-5 md:p-6 flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-5 min-h-[240px] md:min-h-[280px]" data-testid={`screen-card-${session.screenNumber}`}>
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
          <span className="text-sm md:text-base text-white font-medium">Screen {session.screenNumber}</span>
        </div>
        
        <div className="flex-1 w-full sm:w-auto">
          <p className="text-xs md:text-sm text-gray-300 truncate">{session.targetUrl}</p>
        </div>
        
        <div className="flex items-center justify-between w-full sm:w-auto sm:space-x-2">
          <span className="text-xs text-gray-400">
            {getCountryFlag(session.country)} {proxy?.ip || 'Loading...'}
          </span>
          <div className="flex items-center space-x-2">
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
      <div className="px-3 md:px-4 py-2.5 md:py-3 bg-dark-700 border-b border-dark-600 flex items-center justify-between min-h-[60px]">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${getStatusColor()} ${session.isActive ? 'animate-pulse' : ''}`} />
          <span className="text-xs text-gray-300">Screen {session.screenNumber}</span>
        </div>
        <div className="flex items-center space-x-1">
          <span 
            className="text-sm text-gray-300 truncate max-w-[140px] md:max-w-[220px] xl:max-w-none" 
            data-testid={`proxy-info-${session.screenNumber}`}
            title={proxy ? `${session.country?.toUpperCase() || ''} ${proxy.ip}` : ''}
          >
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

      {/* Content Area (only when live) */}
      {session.isActive && proxy?.isWorking && (
        <div className="relative bg-transparent">
          {/* Mobile scale wrapper to mimic desktop layout and reduce text size */}
          <div className="transform origin-top-left scale-[0.85] sm:scale-100 w-[118%] sm:w-full">
            <iframe
              src={`/api/proxy-fetch?url=${encodeURIComponent(session.targetUrl)}&sessionId=${session.id}`}
              className="w-full h-[28vh] sm:h-[24vh] md:h-[20vh] xl:h-[25vh]"
              title={`Screen ${session.screenNumber}`}
              sandbox="allow-same-origin allow-scripts"
              data-testid={`iframe-screen-${session.screenNumber}`}
            />
          </div>
          {/* Status Badge */}
          <div className="absolute top-2 right-2">
            <Badge 
              variant="secondary" 
              className="text-xs bg-black/50 text-white"
            >
              {getStatusText()}
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}
