import { useQuery } from "@tanstack/react-query";
import { ProxyStats } from "@shared/schema";

export function useProxyData() {
  const { data: proxyStats, isLoading: statsLoading } = useQuery<ProxyStats>({
    queryKey: ["/api/proxy-stats"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  return {
    proxyStats,
    statsLoading,
  };
}
