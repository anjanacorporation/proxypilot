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

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      {/* Header */}
      <header className="bg-dark-800 border-b border-dark-700 px-6 py-4" data-testid="header">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Globe className="text-blue-500 text-2xl" />
              <h1 className="text-2xl font-bold text-white">ProxyGrid</h1>
            </div>
            <Badge variant="secondary" className="bg-blue-500/20 text-blue-400">
              v2.1.0
            </Badge>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Proxy Status Indicator */}
            <div className="flex items-center space-x-2 px-3 py-2 bg-dark-700 rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm text-gray-300" data-testid="active-proxies">
                {proxyStats?.working || 0} Active Proxies
              </span>
            </div>
            
            {/* Download App Button */}
            <Button 
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700"
              onClick={() => setShowDownloadModal(true)}
              data-testid="button-download-app"
            >
              <Download className="w-4 h-4" />
              <span>Download App</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        <Sidebar />
        <ProxyGrid />
      </div>

      {/* Download Modal */}
      {showDownloadModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" data-testid="download-modal">
          <div className="bg-dark-800 rounded-lg border border-dark-700 p-6 w-96 max-w-[90vw]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Download ProxyGrid App</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDownloadModal(false)}
                data-testid="button-close-modal"
              >
                ×
              </Button>
            </div>
            
            <div className="space-y-4">
              <p className="text-gray-300 text-sm">Choose your operating system to download the desktop application:</p>
              
              <div className="space-y-3">
                <Button 
                  variant="outline" 
                  className="w-full justify-between bg-dark-700 hover:bg-dark-600 border-dark-600"
                  data-testid="button-download-windows"
                >
                  <div className="flex items-center space-x-3">
                    <span>🪟</span>
                    <span className="text-white">Windows</span>
                  </div>
                  <div className="text-sm text-gray-400">ProxyGrid-Setup-2.1.0.exe</div>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full justify-between bg-dark-700 hover:bg-dark-600 border-dark-600"
                  data-testid="button-download-mac"
                >
                  <div className="flex items-center space-x-3">
                    <span>🍎</span>
                    <span className="text-white">macOS</span>
                  </div>
                  <div className="text-sm text-gray-400">ProxyGrid-2.1.0.dmg</div>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full justify-between bg-dark-700 hover:bg-dark-600 border-dark-600"
                  data-testid="button-download-linux"
                >
                  <div className="flex items-center space-x-3">
                    <span>🐧</span>
                    <span className="text-white">Linux</span>
                  </div>
                  <div className="text-sm text-gray-400">ProxyGrid-2.1.0.AppImage</div>
                </Button>
              </div>
              
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <div className="flex items-start space-x-2">
                  <span className="text-blue-400 mt-0.5">ℹ️</span>
                  <div className="text-sm text-blue-300">
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
