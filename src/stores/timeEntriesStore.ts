import { create } from 'zustand'
import type { TimeEntry } from '@/types'
import { api } from '@/lib/api'

interface TimeEntriesState {
  entries: TimeEntry[]
  dateRange: {
    start: Date | null
    end: Date | null
  }
  isLoading: boolean
  error: string | null
  lastSync: Date | null
  lastFetchParams: any
  setEntries: (entries: TimeEntry[]) => void
  addEntry: (entry: TimeEntry) => void
  setDateRange: (start: Date | null, end: Date | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  getEntriesByMember: (memberId: number) => TimeEntry[]
  getEntriesByDateRange: (start: Date, end: Date) => TimeEntry[]
  fetchTimeEntries: (params?: { startDate?: string; endDate?: string; memberIds?: number[] }) => Promise<void>
  syncTimeEntries: (params?: { startDate?: string; endDate?: string; memberIds?: number[] }) => Promise<void>
}

export const useTimeEntriesStore = create<TimeEntriesState>((set, get) => ({
  entries: [],
  dateRange: {
    start: null,
    end: null,
  },
  isLoading: false,
  error: null,
  lastSync: null,
  lastFetchParams: null,

  setEntries: (entries) => set({ entries, lastSync: new Date() }),
  addEntry: (entry) => set((state) => ({
    entries: [...state.entries, entry]
  })),
  setDateRange: (start, end) => set({ dateRange: { start, end } }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  getEntriesByMember: (memberId) => {
    return get().entries.filter(e => e.memberId === memberId)
  },
  getEntriesByDateRange: (start, end) => {
    return get().entries.filter(e => {
      const entryDate = new Date(e.dateStart)
      return entryDate >= start && entryDate <= end
    })
  },

  fetchTimeEntries: async (params) => {
    const { isLoading, lastSync, lastFetchParams } = get()
    if (isLoading) return

    // Smart Cache Check:
    // 1. Data is fresh (< 5 mins)
    // 2. Params match last fetch OR no params AND last fetch was full (no params)
    const isFresh = lastSync && (new Date().getTime() - lastSync.getTime() < 5 * 60 * 1000)
    const paramsMatch = JSON.stringify(params || {}) === JSON.stringify(lastFetchParams || {})

    // If fetching full data (no params) but we already have full data (lastFetchParams was null/empty), it matches.
    // If fetching specific range, and it matches last specific range, it matches.
    if (isFresh && paramsMatch) {
      console.log('[TimeEntries] Data is fresh & params match, skipping fetch')
      return
    }

    set({ isLoading: true, error: null })
    try {
      console.log('[TimeEntries] Fetching time entries...', params)
      const data = await api.getTimeEntries(params)

      const entries: TimeEntry[] = data.map((e: any) => ({
        id: e.id,
        memberId: e.memberId || e.member?.id,
        ticketId: e.ticketId || e.ticket?.id,
        projectId: e.projectId || e.project?.id,
        hours: e.hours || 0,
        billableOption: e.billableOption,
        notes: e.notes,
        internalNotes: e.internalNotes,
        dateStart: new Date(e.dateStart),
        dateEnd: e.dateEnd ? new Date(e.dateEnd) : undefined,
        updatedAt: e.updatedAt ? new Date(e.updatedAt) : undefined
      }))

      set({ entries, isLoading: false, lastSync: new Date(), lastFetchParams: params || {} })
      console.log(`✅ Fetched ${entries.length} time entries`)
    } catch (error: any) {
      console.error('Error fetching time entries:', error)
      set({ error: error.message || 'Failed to fetch time entries', isLoading: false })
    }
  },

  syncTimeEntries: async (params) => {
    const { lastSync, entries, isLoading } = get()
    if (isLoading) return

    if (!lastSync) {
      return get().fetchTimeEntries(params)
    }

    set({ isLoading: true })
    try {
      console.log(`[TimeEntries] Syncing updates since ${lastSync.toISOString()}...`)
      const data = await api.getTimeEntries({
        ...params,
        modifiedSince: lastSync.toISOString()
      })

      if (data.length === 0) {
        console.log('[TimeEntries] No updates found')
        set({ isLoading: false, lastSync: new Date() })
        return
      }

      const updates: TimeEntry[] = data.map((e: any) => ({
        id: e.id,
        memberId: e.memberId || e.member?.id,
        ticketId: e.ticketId || e.ticket?.id,
        projectId: e.projectId || e.project?.id,
        hours: e.hours || 0,
        billableOption: e.billableOption,
        notes: e.notes,
        internalNotes: e.internalNotes,
        dateStart: new Date(e.dateStart),
        dateEnd: e.dateEnd ? new Date(e.dateEnd) : undefined,
        updatedAt: e.updatedAt ? new Date(e.updatedAt) : undefined
      }))

      // Merge updates
      const entryMap = new Map(entries.map(e => [e.id, e]))
      updates.forEach(u => entryMap.set(u.id, u))

      const merged = Array.from(entryMap.values())
      // Sort explicitly by dateStart desc to maintain order
      merged.sort((a, b) => b.dateStart.getTime() - a.dateStart.getTime())

      set({ entries: merged, isLoading: false, lastSync: new Date() })
      console.log(`✅ Synced ${updates.length} time entry updates`)
    } catch (error: any) {
      console.error('Error syncing time entries:', error)
      set({ isLoading: false })
    }
  }
}))
