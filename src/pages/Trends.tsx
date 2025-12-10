import { useMemo, useState, useEffect } from 'react'
import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'
import { format, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, subDays, subMonths, subYears } from 'date-fns'

type TimeRange = '7d' | '30d' | '90d' | '6m' | '1y' | '3y'
type Granularity = 'day' | 'week' | 'month'

export default function Trends() {
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { members } = useMembersStore()
  const { entries, fetchTimeEntries } = useTimeEntriesStore()

  // Auto-fetch time entries if not loaded (3 years for full trends)
  useEffect(() => {
    if (entries.length === 0) {
      const end = new Date()
      const start = subYears(end, 3)
      fetchTimeEntries({
        startDate: format(start, 'yyyy-MM-dd'),
        endDate: format(end, 'yyyy-MM-dd'),
      })
    }
  }, []) // Only on mount
  const [timeRange, setTimeRange] = useState<TimeRange>('3y') // Default to all time (3 years)
  const [granularity, setGranularity] = useState<Granularity>('day')

  const selectedEngineer = selectedEngineerId 
    ? members.find(m => m.id === selectedEngineerId)
    : null

  // Calculate date range
  const dateRange = useMemo(() => {
    const end = new Date()
    let start: Date
    
    switch (timeRange) {
      case '7d': start = subDays(end, 7); break
      case '30d': start = subDays(end, 30); break
      case '90d': start = subDays(end, 90); break
      case '6m': start = subMonths(end, 6); break
      case '1y': start = subMonths(end, 12); break
      case '3y': start = subYears(end, 3); break
      default: start = subYears(end, 3) // Default to all time
    }
    
    return { start, end }
  }, [timeRange])

  // Filter entries by selected engineer and date range
  const filteredEntries = useMemo(() => {
    let result = entries.filter(e => {
      const entryDate = new Date(e.dateStart)
      return entryDate >= dateRange.start && entryDate <= dateRange.end
    })
    
    if (selectedEngineerId !== null) {
      result = result.filter(e => e.memberId === selectedEngineerId)
    }
    
    return result
  }, [entries, selectedEngineerId, dateRange])

  // Generate chart data based on granularity
  const chartData = useMemo(() => {
    let periods: Date[]
    let formatStr: string
    
    switch (granularity) {
      case 'day':
        periods = eachDayOfInterval(dateRange)
        formatStr = 'MMM d'
        break
      case 'week':
        periods = eachWeekOfInterval(dateRange)
        formatStr = 'MMM d'
        break
      case 'month':
        periods = eachMonthOfInterval(dateRange)
        formatStr = 'MMM yyyy'
        break
      default:
        periods = eachDayOfInterval(dateRange)
        formatStr = 'MMM d'
    }

    return periods.map(period => {
      const periodStart = period
      let periodEnd: Date
      
      switch (granularity) {
        case 'day':
          periodEnd = new Date(period)
          periodEnd.setHours(23, 59, 59, 999)
          break
        case 'week':
          periodEnd = new Date(period)
          periodEnd.setDate(periodEnd.getDate() + 6)
          periodEnd.setHours(23, 59, 59, 999)
          break
        case 'month':
          periodEnd = new Date(period.getFullYear(), period.getMonth() + 1, 0, 23, 59, 59, 999)
          break
        default:
          periodEnd = new Date(period)
          periodEnd.setHours(23, 59, 59, 999)
      }

      const periodEntries = filteredEntries.filter(e => {
        const entryDate = new Date(e.dateStart)
        return entryDate >= periodStart && entryDate <= periodEnd
      })

      const totalHours = periodEntries.reduce((sum, e) => sum + e.hours, 0)
      const billableHours = periodEntries
        .filter(e => e.billableOption === 'Billable')
        .reduce((sum, e) => sum + e.hours, 0)
      const nonBillableHours = totalHours - billableHours
      const entryCount = periodEntries.length
      const withNotes = periodEntries.filter(e => e.notes && e.notes.trim().length > 0).length
      const notesPercent = entryCount > 0 ? (withNotes / entryCount) * 100 : 0

      return {
        date: format(period, formatStr),
        totalHours: Number(totalHours.toFixed(1)),
        billableHours: Number(billableHours.toFixed(1)),
        nonBillableHours: Number(nonBillableHours.toFixed(1)),
        entryCount,
        notesPercent: Number(notesPercent.toFixed(0)),
        billablePercent: totalHours > 0 ? Number(((billableHours / totalHours) * 100).toFixed(0)) : 0,
      }
    })
  }, [filteredEntries, dateRange, granularity])

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const totalHours = filteredEntries.reduce((sum, e) => sum + e.hours, 0)
    const billableHours = filteredEntries
      .filter(e => e.billableOption === 'Billable')
      .reduce((sum, e) => sum + e.hours, 0)
    const withNotes = filteredEntries.filter(e => e.notes && e.notes.trim().length > 0).length
    
    // Calculate trend (compare to previous period)
    const previousStart = new Date(dateRange.start)
    previousStart.setTime(previousStart.getTime() - (dateRange.end.getTime() - dateRange.start.getTime()))
    
    const previousEntries = entries.filter(e => {
      const entryDate = new Date(e.dateStart)
      const inRange = entryDate >= previousStart && entryDate < dateRange.start
      return inRange && (selectedEngineerId === null || e.memberId === selectedEngineerId)
    })
    
    const previousHours = previousEntries.reduce((sum, e) => sum + e.hours, 0)
    const hoursTrend = previousHours > 0 ? ((totalHours - previousHours) / previousHours) * 100 : 0

    return {
      totalHours,
      billableHours,
      billablePercent: totalHours > 0 ? (billableHours / totalHours) * 100 : 0,
      entryCount: filteredEntries.length,
      notesPercent: filteredEntries.length > 0 ? (withNotes / filteredEntries.length) * 100 : 0,
      avgHoursPerDay: chartData.length > 0 ? totalHours / chartData.length : 0,
      hoursTrend,
    }
  }, [filteredEntries, entries, dateRange, selectedEngineerId, chartData])

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">Trends</h2>
        <p className="text-gray-400">
          {selectedEngineer 
            ? `Trend analysis for ${selectedEngineer.firstName} ${selectedEngineer.lastName}`
            : 'Trend analysis for all engineers'}
        </p>
      </div>

      {/* Controls */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Time Range</label>
            <div className="flex gap-2">
              {(['7d', '30d', '90d', '6m', '1y', '3y'] as TimeRange[]).map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    timeRange === range
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Granularity</label>
            <div className="flex gap-2">
              {(['day', 'week', 'month'] as Granularity[]).map(g => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={`px-3 py-1 rounded text-sm font-medium capitalize transition-colors ${
                    granularity === g
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-xs font-medium text-gray-400 mb-1">Total Hours</h3>
          <p className="text-2xl font-bold text-white">{summaryStats.totalHours.toFixed(1)}</p>
          {summaryStats.hoursTrend !== 0 && (
            <p className={`text-xs mt-1 ${summaryStats.hoursTrend > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {summaryStats.hoursTrend > 0 ? '↑' : '↓'} {Math.abs(summaryStats.hoursTrend).toFixed(0)}% vs prev
            </p>
          )}
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-xs font-medium text-gray-400 mb-1">Billable Hours</h3>
          <p className="text-2xl font-bold text-green-400">{summaryStats.billableHours.toFixed(1)}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-xs font-medium text-gray-400 mb-1">Billable %</h3>
          <p className="text-2xl font-bold text-blue-400">{summaryStats.billablePercent.toFixed(0)}%</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-xs font-medium text-gray-400 mb-1">Entries</h3>
          <p className="text-2xl font-bold text-white">{summaryStats.entryCount}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-xs font-medium text-gray-400 mb-1">With Notes</h3>
          <p className="text-2xl font-bold text-purple-400">{summaryStats.notesPercent.toFixed(0)}%</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-xs font-medium text-gray-400 mb-1">Avg/Day</h3>
          <p className="text-2xl font-bold text-yellow-400">{summaryStats.avgHoursPerDay.toFixed(1)}h</p>
        </div>
      </div>

      {/* Hours Over Time Chart */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">Hours Over Time</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorBillable" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorNonBillable" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="date" 
                stroke="#9ca3af" 
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                tickLine={{ stroke: '#4b5563' }}
              />
              <YAxis 
                stroke="#9ca3af" 
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                tickLine={{ stroke: '#4b5563' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff' 
                }}
              />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="billableHours" 
                name="Billable"
                stroke="#22c55e" 
                fillOpacity={1}
                fill="url(#colorBillable)"
                stackId="1"
              />
              <Area 
                type="monotone" 
                dataKey="nonBillableHours" 
                name="Non-Billable"
                stroke="#6366f1" 
                fillOpacity={1}
                fill="url(#colorNonBillable)"
                stackId="1"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Billable vs Non-Billable Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Billable Distribution</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="date" 
                  stroke="#9ca3af" 
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis 
                  stroke="#9ca3af" 
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff' 
                  }}
                />
                <Bar dataKey="billableHours" name="Billable" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="nonBillableHours" name="Non-Billable" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Billable % Trend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="date" 
                  stroke="#9ca3af" 
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis 
                  stroke="#9ca3af" 
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff' 
                  }}
                  formatter={(value: number) => [`${value}%`, 'Billable %']}
                />
                <Line 
                  type="monotone" 
                  dataKey="billablePercent" 
                  name="Billable %"
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Notes Quality Trend */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Notes Quality Trend</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="date" 
                stroke="#9ca3af" 
                tick={{ fill: '#9ca3af', fontSize: 12 }}
              />
              <YAxis 
                stroke="#9ca3af" 
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                domain={[0, 100]}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff' 
                }}
                formatter={(value: number) => [`${value}%`, 'Entries with Notes']}
              />
              <Line 
                type="monotone" 
                dataKey="notesPercent" 
                name="% with Notes"
                stroke="#a855f7" 
                strokeWidth={2}
                dot={{ fill: '#a855f7', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
