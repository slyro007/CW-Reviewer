import { create } from 'zustand'
import { subYears, startOfYear, startOfQuarter, startOfMonth, startOfWeek } from 'date-fns'

export type TimePeriod = 'all' | 'yearly' | 'quarterly' | 'monthly' | 'weekly'

interface TimePeriodState {
  timePeriod: TimePeriod
  setTimePeriod: (period: TimePeriod) => void
  getDateRange: () => { start: Date; end: Date }
  getPeriodLabel: () => string
}

export const useTimePeriodStore = create<TimePeriodState>((set, get) => ({
  timePeriod: 'all', // Default to All Time
  
  setTimePeriod: (timePeriod) => set({ timePeriod }),
  
  getDateRange: () => {
    const end = new Date()
    let start: Date
    
    switch (get().timePeriod) {
      case 'all':
        start = subYears(end, 3) // 3 years of data
        break
      case 'yearly':
        start = startOfYear(end)
        break
      case 'quarterly':
        start = startOfQuarter(end)
        break
      case 'monthly':
        start = startOfMonth(end)
        break
      case 'weekly':
        start = startOfWeek(end)
        break
      default:
        start = subYears(end, 3)
    }
    
    return { start, end }
  },
  
  getPeriodLabel: () => {
    switch (get().timePeriod) {
      case 'all': return 'All Time'
      case 'yearly': return 'This Year'
      case 'quarterly': return 'This Quarter'
      case 'monthly': return 'This Month'
      case 'weekly': return 'This Week'
      default: return 'All Time'
    }
  },
}))

// Export period options for use in UI components
export const TIME_PERIOD_OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: 'all', label: 'All Time' },
  { value: 'yearly', label: 'This Year' },
  { value: 'quarterly', label: 'This Quarter' },
  { value: 'monthly', label: 'This Month' },
  { value: 'weekly', label: 'This Week' },
]

