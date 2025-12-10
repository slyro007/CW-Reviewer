import { create } from 'zustand'
import type { TimeEntry } from '@/types'

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
}))

