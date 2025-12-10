import { create } from 'zustand'
import type { ComparisonResult } from '@/types'

interface ComparisonState {
  result: ComparisonResult | null
  isLoading: boolean
  error: string | null
  setResult: (result: ComparisonResult | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearResult: () => void
}

export const useComparisonStore = create<ComparisonState>((set) => ({
  result: null,
  isLoading: false,
  error: null,
  setResult: (result) => set({ result }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  clearResult: () => set({ result: null }),
}))

