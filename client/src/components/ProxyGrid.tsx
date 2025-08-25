import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Grid3X3, List, RotateCcw } from "lucide-react";
import ScreenCard from "./ScreenCard";
import { useQuery } from "@tanstack/react-query";
import { ScreenSession } from "@shared/schema";

export default function ProxyGrid() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const { data: screenSessions = [], refetch, isLoading } = useQuery<ScreenSession[]>({
    queryKey: ["/api/screen-sessions"],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const handleRefreshAll = () => {
    refetch();
  };

  return (
    <div className="flex-1 p-4 md:p-6 overflow-hidden" data-testid="proxy-grid">
      {/* Grid Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 md:mb-6 space-y-4 sm:space-y-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-white">Screen Grid</h2>
          <p className="text-sm md:text-base text-gray-400">Multi-proxy web viewing</p>
        </div>
        
        <div className="flex items-center space-x-2 md:space-x-4 w-full sm:w-auto">
          {/* Grid View Toggle */}
          <div className="flex bg-dark-700 rounded-lg p-1">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className={`${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'} text-xs md:text-sm`}
              data-testid="button-grid-view"
            >
              <Grid3X3 className="w-3 h-3 md:w-4 md:h-4 mr-1" />
              <span className="hidden sm:inline">Grid</span>
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className={`${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'} text-xs md:text-sm`}
              data-testid="button-list-view"
            >
              <List className="w-3 h-3 md:w-4 md:h-4 mr-1" />
              <span className="hidden sm:inline">List</span>
            </Button>
          </div>
          
          {/* Refresh All Button */}
          <Button
            variant="outline"
            onClick={handleRefreshAll}
            disabled={isLoading}
            className="bg-dark-700 hover:bg-dark-600 text-gray-300 border-dark-600 text-xs md:text-sm px-2 md:px-4"
            data-testid="button-refresh-all"
          >
            <RotateCcw className={`w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh All</span>
            <span className="sm:hidden">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Screen Grid/List */}
      {screenSessions.length === 0 ? (
        <div className="h-[calc(100vh-180px)] md:h-[calc(100vh-200px)] flex items-center justify-center" data-testid="empty-state">
          <div className="text-center px-4">
            <div className="w-12 h-12 md:w-16 md:h-16 bg-dark-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Grid3X3 className="w-6 h-6 md:w-8 md:h-8 text-gray-400" />
            </div>
            <h3 className="text-base md:text-lg font-medium text-white mb-2">No Active Screens</h3>
            <p className="text-sm md:text-base text-gray-400 mb-4">Configure and start the proxy grid to begin viewing content</p>
            <Badge variant="outline" className="border-blue-500/30 text-blue-400 text-xs md:text-sm">
              Ready to Start
            </Badge>
          </div>
        </div>
      ) : (
        <div className={`h-[calc(100vh-180px)] md:h-[calc(100vh-200px)] overflow-y-auto ${
          viewMode === 'grid' 
            ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6' 
            : 'space-y-3 md:space-y-4'
        }`}>
          {screenSessions.map((session) => (
            <ScreenCard
              key={session.id}
              session={session}
              viewMode={viewMode}
            />
          ))}
          
          {/* Fill empty slots for grid view */}
          {viewMode === 'grid' && screenSessions.length < 10 && (
            Array.from({ length: 10 - screenSessions.length }, (_, index) => (
              <div
                key={`empty-${index}`}
                className="bg-dark-800 rounded-lg border border-dashed border-dark-600 aspect-[16/9] min-h-[600px] md:min-h-[440px] flex items-center justify-center"
                data-testid={`empty-screen-${screenSessions.length + index + 1}`}
              >
                <div className="text-center">
                  <div className="w-6 h-6 md:w-8 md:h-8 bg-dark-700 rounded-full flex items-center justify-center mx-auto mb-2">
                    <span className="text-gray-500 text-xs md:text-sm">{screenSessions.length + index + 1}</span>
                  </div>
                  <p className="text-xs text-gray-500">Empty Screen</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
