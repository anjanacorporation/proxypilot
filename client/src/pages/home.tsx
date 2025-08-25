import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Globe } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import ProxyGrid from "@/components/ProxyGrid";
import { useProxyData } from "@/hooks/useProxyData";

export default function Home() {
  const { proxyStats } = useProxyData();
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      {/* Header */}
      <header className="bg-dark-800 border-b border-dark-700 px-4 md:px-6 py-3 md:py-4" data-testid="header">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 md:space-x-4">
            <div className="flex items-center space-x-2">
              <Globe className="text-blue-500 text-xl md:text-2xl" />
              <h1 className="text-lg md:text-2xl font-bold text-white">ProxyGrid</h1>
            </div>
            <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 text-xs md:text-sm">
              v2.1.0
            </Badge>
          </div>
          
          <div className="flex items-center space-x-2 md:space-x-4">
            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSidebar(!showSidebar)}
              className="md:hidden text-gray-300"
              data-testid="button-mobile-menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </Button>
            
            {/* Proxy Status Indicator */}
            <div className="hidden sm:flex items-center space-x-2 px-2 md:px-3 py-2 bg-dark-700 rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs md:text-sm text-gray-300" data-testid="active-proxies">
                {proxyStats?.working || 0} Active
              </span>
            </div>
            
            {/* Download App Button */}
            <Button 
              className="flex items-center space-x-1 md:space-x-2 bg-blue-600 hover:bg-blue-700 text-xs md:text-sm px-2 md:px-4"
              onClick={() => setShowDownloadModal(true)}
              data-testid="button-download-app"
            >
              <Download className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Download App</span>
              <span className="sm:hidden">App</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-col md:flex-row h-[calc(100vh-65px)] md:h-[calc(100vh-73px)]">
        {/* Mobile Sidebar Overlay */}
        {showSidebar && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 md:hidden" 
            onClick={() => setShowSidebar(false)}
          />
        )}
        
        {/* Sidebar */}
        <div className={`
          fixed md:relative top-0 left-0 z-50 md:z-auto
          transform transition-transform duration-300 ease-in-out
          ${showSidebar ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
          h-full md:h-auto
        `}>
          <Sidebar onClose={() => setShowSidebar(false)} />
        </div>
        
        <ProxyGrid />
      </div>

      {/* Download Modal */}
      {showDownloadModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" data-testid="download-modal">
          <div className="bg-dark-800 rounded-lg border border-dark-700 p-4 md:p-6 w-full max-w-md md:max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base md:text-lg font-semibold text-white">Download ProxyGrid App</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDownloadModal(false)}
                className="text-gray-400 hover:text-white"
                data-testid="button-close-modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>
            
            <div className="space-y-4">
              <p className="text-gray-300 text-xs md:text-sm">Choose your operating system to download the desktop application:</p>
              
              <div className="space-y-3">
                <Button 
                  variant="outline" 
                  className="w-full flex-col sm:flex-row justify-between items-start sm:items-center bg-dark-700 hover:bg-dark-600 border-dark-600 p-4 h-auto space-y-2 sm:space-y-0"
                  data-testid="button-download-windows"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-lg">🪟</span>
                    <span className="text-white font-medium">Windows</span>
                  </div>
                  <div className="text-xs md:text-sm text-gray-400">ProxyGrid-Setup-2.1.0.exe</div>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full flex-col sm:flex-row justify-between items-start sm:items-center bg-dark-700 hover:bg-dark-600 border-dark-600 p-4 h-auto space-y-2 sm:space-y-0"
                  data-testid="button-download-mac"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-lg">🍎</span>
                    <span className="text-white font-medium">macOS</span>
                  </div>
                  <div className="text-xs md:text-sm text-gray-400">ProxyGrid-2.1.0.dmg</div>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full flex-col sm:flex-row justify-between items-start sm:items-center bg-dark-700 hover:bg-dark-600 border-dark-600 p-4 h-auto space-y-2 sm:space-y-0"
                  data-testid="button-download-linux"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-lg">🐧</span>
                    <span className="text-white font-medium">Linux</span>
                  </div>
                  <div className="text-xs md:text-sm text-gray-400">ProxyGrid-2.1.0.AppImage</div>
                </Button>
              </div>
              
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <div className="flex items-start space-x-2">
                  <span className="text-blue-400 mt-0.5 text-sm">ℹ️</span>
                  <div className="text-xs md:text-sm text-blue-300">
                    The desktop app includes all web features plus enhanced performance and system integration.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
