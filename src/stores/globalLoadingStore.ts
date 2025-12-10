import { create } from 'zustand'
import { api } from '@/lib/api'

interface SyncEntity {
  lastSync: string | null
  isStale: boolean
  count: number
}

interface SyncStatus {
  isStale: boolean
  lastSync: string | null
  entities: Record<string, SyncEntity>
}

interface SyncResult {
  entity: string
  synced: boolean
  count: number
  message: string
}

interface GlobalLoadingState {
  // Sync state
  isSyncing: boolean
  syncProgress: string
  syncResults: SyncResult[]
  syncError: string | null
  lastSyncStatus: SyncStatus | null
  
  // Actions
  checkSyncStatus: () => Promise<SyncStatus>
  performSync: (options?: { force?: boolean; entities?: string[] }) => Promise<void>
  setSyncProgress: (progress: string) => void
  clearSyncError: () => void
}

export const useGlobalLoadingStore = create<GlobalLoadingState>((set, get) => ({
  isSyncing: false,
  syncProgress: '',
  syncResults: [],
  syncError: null,
  lastSyncStatus: null,

  checkSyncStatus: async () => {
    try {
      const status = await api.getSyncStatus()
      set({ lastSyncStatus: status as SyncStatus })
      return status as SyncStatus
    } catch (error: any) {
      console.error('Failed to check sync status:', error)
      throw error
    }
  },

  performSync: async (options) => {
    const { isSyncing } = get()
    if (isSyncing) return

    set({ 
      isSyncing: true, 
      syncProgress: 'Starting sync...', 
      syncResults: [],
      syncError: null 
    })

    try {
      // Perform sync
      const result = await api.performSync(options)
      
      set({ 
        syncResults: result.results,
        syncProgress: 'Sync complete!',
      })

      // Refresh sync status
      await get().checkSyncStatus()

      // Clear progress after a moment
      setTimeout(() => {
        set({ syncProgress: '', isSyncing: false })
      }, 2000)
    } catch (error: any) {
      console.error('Sync failed:', error)
      set({ 
        syncError: error.message || 'Sync failed',
        syncProgress: '',
        isSyncing: false 
      })
    }
  },

  setSyncProgress: (progress) => set({ syncProgress: progress }),
  
  clearSyncError: () => set({ syncError: null }),
}))

