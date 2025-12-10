import { create } from 'zustand'

interface UIState {
  isLoading: boolean
  error: string | null
  filters: {
    dateRange: {
      start: Date | null
      end: Date | null
    }
    boardType: 'MS' | 'PS' | 'ALL'
    memberIds: number[]
  }
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setDateRange: (start: Date | null, end: Date | null) => void
  setBoardType: (type: 'MS' | 'PS' | 'ALL') => void
  setMemberIds: (ids: number[]) => void
  clearFilters: () => void
}

export const useUIStore = create<UIState>((set) => ({
  isLoading: false,
  error: null,
  filters: {
    dateRange: {
      start: null,
      end: null,
    },
    boardType: 'ALL',
    memberIds: [],
  },
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setDateRange: (start, end) => set((state) => ({
    filters: {
      ...state.filters,
      dateRange: { start, end },
    },
  })),
  setBoardType: (boardType) => set((state) => ({
    filters: {
      ...state.filters,
      boardType,
    },
  })),
  setMemberIds: (memberIds) => set((state) => ({
    filters: {
      ...state.filters,
      memberIds,
    },
  })),
  clearFilters: () => set({
    filters: {
      dateRange: { start: null, end: null },
      boardType: 'ALL',
      memberIds: [],
    },
  }),
}))

