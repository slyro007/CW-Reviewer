import { create } from 'zustand'
import type { TrendSeries } from '@/types'

interface TrendsState {
  trends: TrendSeries[]
  cached: boolean
  isLoading: boolean
  error: string | null
  setTrends: (trends: TrendSeries[]) => void
  setCached: (cached: boolean) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearTrends: () => void
}

export const useTrendsStore = create<TrendsState>((set) => ({
  trends: [],
  cached: false,
  isLoading: false,
  error: null,
  setTrends: (trends) => set({ trends }),
  setCached: (cached) => set({ cached }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  clearTrends: () => set({ trends: [], cached: false }),
}))

