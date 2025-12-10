import { useTimePeriodStore, TIME_PERIOD_OPTIONS, TimePeriod } from '@/stores/timePeriodStore'
import { format } from 'date-fns'

export default function TimePeriodSelector() {
  const { timePeriod, setTimePeriod, getDateRange } = useTimePeriodStore()
  const dateRange = getDateRange()

  return (
    <div>
      <label className="block text-sm font-medium text-blue-200 mb-2">
        Time Period
      </label>
      <select
        value={timePeriod}
        onChange={(e) => setTimePeriod(e.target.value as TimePeriod)}
        className="w-full bg-purple-800 text-white rounded-lg px-3 py-2 border border-purple-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none cursor-pointer"
      >
        {TIME_PERIOD_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-purple-300 mt-2">
        {format(dateRange.start, 'MMM d, yyyy')} - {format(dateRange.end, 'MMM d, yyyy')}
      </p>
    </div>
  )
}

