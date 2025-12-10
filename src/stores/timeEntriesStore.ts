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
  setEntries: (entries: TimeEntry[]) => void
  addEntry: (entry: TimeEntry) => void
  setDateRange: (start: Date | null, end: Date | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  getEntriesByMember: (memberId: number) => TimeEntry[]
  getEntriesByDateRange: (start: Date, end: Date) => TimeEntry[]
  fetchTimeEntries: (params?: { startDate?: string; endDate?: string; memberIds?: number[] }) => Promise<void>
}

export const useTimeEntriesStore = create<TimeEntriesState>((set, get) => ({
  entries: [],
  dateRange: {
    start: null,
    end: null,
  },
  isLoading: false,
  error: null,
  setEntries: (entries) => set({ entries }),
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
    const { isLoading } = get()
    if (isLoading) return
    
    set({ isLoading: true, error: null })
    try {
      console.log('[TimeEntries] Fetching time entries...', params)
      const data = await api.getTimeEntries(params)
      
      const entries: TimeEntry[] = data.map((e: any) => ({
        id: e.id,
        memberId: e.memberId || e.member?.id, // API returns memberId directly
        ticketId: e.ticketId || e.ticket?.id,
        projectId: e.projectId || e.project?.id,
        hours: e.hours || 0,
        billableOption: e.billableOption,
        notes: e.notes,
        internalNotes: e.internalNotes,
        dateStart: new Date(e.dateStart),
        dateEnd: e.dateEnd ? new Date(e.dateEnd) : undefined,
      }))
      
      // Log sample for debugging
      if (entries.length > 0) {
        console.log('[TimeEntries] Sample entry:', {
          id: entries[0].id,
          memberId: entries[0].memberId,
          hours: entries[0].hours,
          date: entries[0].dateStart,
        })
      }
      
      set({ entries, isLoading: false })
      console.log(`✅ Fetched ${entries.length} time entries`)
    } catch (error: any) {
      console.error('Error fetching time entries:', error)
      set({ error: error.message || 'Failed to fetch time entries', isLoading: false })
    }
  },
}))
