import { useEffect } from 'react'
import { useGlobalLoadingStore } from '@/stores/globalLoadingStore'

export default function GlobalLoadingBar() {
  const { 
    isSyncing, 
    syncProgress, 
    syncError, 
    checkSyncStatus, 
    performSync,
    clearSyncError 
  } = useGlobalLoadingStore()

  // Note: Sync now runs during build process, not in UI
  // This component only displays sync status if sync is manually triggered via API

  // Don't show if not syncing and no error
  if (!isSyncing && !syncError && !syncProgress) {
    return null
  }

  return (
    <>
      {/* Loading bar at very top */}
      {isSyncing && (
        <div className="fixed top-0 left-0 right-0 z-50">
          {/* Animated gradient bar */}
          <div className="h-1 bg-gray-800 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500 animate-pulse"
              style={{
                animation: 'shimmer 2s ease-in-out infinite',
                backgroundSize: '200% 100%',
              }}
            />
          </div>
          
          {/* Progress message */}
          <div className="bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 px-4 py-2">
            <div className="flex items-center gap-3 max-w-7xl mx-auto">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" />
              <span className="text-sm text-gray-300">
                {syncProgress || 'Syncing data from ConnectWise...'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Success message */}
      {!isSyncing && syncProgress && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <div className="h-1 bg-green-500" />
          <div className="bg-green-900/95 backdrop-blur-sm border-b border-green-800 px-4 py-2">
            <div className="flex items-center gap-3 max-w-7xl mx-auto">
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm text-green-300">{syncProgress}</span>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {syncError && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <div className="h-1 bg-red-500" />
          <div className="bg-red-900/95 backdrop-blur-sm border-b border-red-800 px-4 py-2">
            <div className="flex items-center justify-between max-w-7xl mx-auto">
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-red-300">Sync failed: {syncError}</span>
              </div>
              <button 
                onClick={clearSyncError}
                className="text-red-400 hover:text-red-300 text-sm"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS for shimmer animation */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </>
  )
}

