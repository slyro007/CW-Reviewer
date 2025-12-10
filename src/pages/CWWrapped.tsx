import { useEffect, useMemo, useState } from 'react'
import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useTicketsStore } from '@/stores/ticketsStore'
import { useProjectsStore } from '@/stores/projectsStore'
import { api } from '@/lib/api'
import { format, startOfYear, endOfYear } from 'date-fns'

interface WrappedStats {
  totalHours: number
  billableHours: number
  billablePercent: number
  ticketsWorked: number
  ticketsClosed: number
  projectsWorked: number
  entryCount: number
  notesPercent: number
  avgHoursPerDay: number
  topMonth: { month: string; hours: number }
  longestStreak: number
  coffees: number
}

export default function CWWrapped() {
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { members } = useMembersStore()
  const { entries, fetchTimeEntries } = useTimeEntriesStore()
  const { tickets, fetchTickets } = useTicketsStore()
  const { projects, fetchProjects } = useProjectsStore()
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiWrapped, setAiWrapped] = useState<string | null>(null)
  const [wrappedError, setWrappedError] = useState<string | null>(null)
  const [showWrapped, setShowWrapped] = useState(false)

  const currentYear = new Date().getFullYear()
  const yearStart = startOfYear(new Date())
  const yearEnd = endOfYear(new Date())

  const selectedEngineer = selectedEngineerId 
    ? members.find(m => m.id === selectedEngineerId)
    : null

  // Fetch data for the entire year
  useEffect(() => {
    fetchTimeEntries({
      startDate: format(yearStart, 'yyyy-MM-dd'),
      endDate: format(yearEnd, 'yyyy-MM-dd'),
    })
    fetchTickets()
    fetchProjects()
  }, [])

  // Filter entries for the current year and selected engineer
  const yearEntries = useMemo(() => {
    let result = entries.filter(e => {
      const entryDate = new Date(e.dateStart)
      return entryDate >= yearStart && entryDate <= yearEnd
    })
    
    if (selectedEngineerId !== null) {
      result = result.filter(e => e.memberId === selectedEngineerId)
    }
    return result
  }, [entries, selectedEngineerId, yearStart, yearEnd])

  // Calculate wrapped stats
  const stats = useMemo((): WrappedStats => {
    const totalHours = yearEntries.reduce((sum, e) => sum + e.hours, 0)
    const billableHours = yearEntries
      .filter(e => e.billableOption === 'Billable')
      .reduce((sum, e) => sum + e.hours, 0)
    const billablePercent = totalHours > 0 ? (billableHours / totalHours) * 100 : 0
    
    const uniqueTicketIds = new Set(yearEntries.filter(e => e.ticketId).map(e => e.ticketId))
    const workedTickets = tickets.filter(t => uniqueTicketIds.has(t.id))
    const closedTickets = workedTickets.filter(t => t.closedFlag)
    
    const withNotes = yearEntries.filter(e => e.notes && e.notes.trim().length > 0)
    const notesPercent = yearEntries.length > 0 
      ? (withNotes.length / yearEntries.length) * 100 
      : 0

    // Calculate hours by month to find top month
    const hoursByMonth: Record<string, number> = {}
    yearEntries.forEach(e => {
      const month = format(new Date(e.dateStart), 'MMMM')
      hoursByMonth[month] = (hoursByMonth[month] || 0) + e.hours
    })
    const topMonth = Object.entries(hoursByMonth).reduce(
      (max, [month, hours]) => hours > max.hours ? { month, hours } : max,
      { month: 'N/A', hours: 0 }
    )

    // Calculate unique working days
    const uniqueDays = new Set(yearEntries.map(e => 
      new Date(e.dateStart).toDateString()
    )).size
    const avgHoursPerDay = uniqueDays > 0 ? totalHours / uniqueDays : 0

    // Calculate longest streak
    const sortedDates = [...new Set(yearEntries.map(e => 
      new Date(e.dateStart).toDateString()
    ))].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    
    let maxStreak = 0
    let currentStreak = 1
    for (let i = 1; i < sortedDates.length; i++) {
      const prevDate = new Date(sortedDates[i - 1])
      const currDate = new Date(sortedDates[i])
      const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      if (diffDays === 1) {
        currentStreak++
        maxStreak = Math.max(maxStreak, currentStreak)
      } else {
        currentStreak = 1
      }
    }
    maxStreak = Math.max(maxStreak, currentStreak)

    // Count projects worked on (from project tickets)
    const projectsWorked = selectedEngineer 
      ? projects.filter(p => p.managerIdentifier?.toLowerCase() === selectedEngineer.identifier.toLowerCase()).length
      : projects.length

    return {
      totalHours,
      billableHours,
      billablePercent,
      ticketsWorked: uniqueTicketIds.size,
      ticketsClosed: closedTickets.length,
      projectsWorked,
      entryCount: yearEntries.length,
      notesPercent,
      avgHoursPerDay,
      topMonth,
      longestStreak: maxStreak,
      coffees: Math.round(totalHours / 2),
    }
  }, [yearEntries, tickets, projects, selectedEngineer])

  // Generate AI Wrapped
  const generateWrapped = async () => {
    setIsGenerating(true)
    setWrappedError(null)
    setShowWrapped(true)
    
    try {
      const wrappedData = {
        period: `${currentYear}`,
        totalHours: stats.totalHours,
        billableHours: stats.billableHours,
        billablePercent: stats.billablePercent.toFixed(0),
        ticketsWorked: stats.ticketsWorked,
        ticketsClosed: stats.ticketsClosed,
        projectsWorked: stats.projectsWorked,
        entryCount: stats.entryCount,
        notesPercent: stats.notesPercent.toFixed(0),
        avgHoursPerDay: stats.avgHoursPerDay.toFixed(1),
        topMonth: stats.topMonth,
        longestStreak: stats.longestStreak,
      }

      const member = selectedEngineer || { firstName: 'Team', lastName: '' }
      
      const response = await api.generateAnalysis('cwWrapped', {
        member,
        stats: wrappedData,
        year: currentYear,
      })
      
      setAiWrapped(response.analysis)
    } catch (error: any) {
      console.error('Error generating wrapped:', error)
      setWrappedError(error.message || 'Failed to generate wrapped')
    } finally {
      setIsGenerating(false)
    }
  }

  const isLoading = entries.length === 0

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">🎁 CW Wrapped {currentYear}</h2>
        <p className="text-gray-400">
          {selectedEngineer 
            ? `${selectedEngineer.firstName} ${selectedEngineer.lastName}'s year in review`
            : 'Your team\'s year in review'}
        </p>
      </div>

      {!showWrapped ? (
        // Initial hero section with generate button
        <div className="bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 rounded-xl p-8 mb-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2240%22%20height%3D%2240%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Ccircle%20cx%3D%222%22%20cy%3D%222%22%20r%3D%222%22%20fill%3D%22rgba(255%2C255%2C255%2C0.1)%22%2F%3E%3C%2Fsvg%3E')] opacity-30"></div>
          <div className="relative z-10 text-center py-12">
            <div className="text-8xl mb-6">🎉</div>
            <h3 className="text-4xl font-bold text-white mb-4">
              Your {currentYear} CW Wrapped
            </h3>
            <p className="text-xl text-gray-300 mb-8 max-w-xl mx-auto">
              Discover your year in ConnectWise! See your accomplishments, stats, and get an AI-powered summary of your work.
            </p>
            <button 
              onClick={generateWrapped}
              disabled={isLoading}
              className={`px-10 py-4 rounded-full font-bold text-lg transition-all transform hover:scale-105 ${
                isLoading 
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-purple-900 hover:bg-gray-100 shadow-lg hover:shadow-xl'
              }`}
            >
              {isLoading ? 'Loading data...' : '✨ Generate Your Wrapped'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Year in Numbers - Fun Stats */}
          <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-blue-900 rounded-xl p-6 mb-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Ccircle%20cx%3D%221%22%20cy%3D%221%22%20r%3D%221%22%20fill%3D%22rgba(255%2C255%2C255%2C0.1)%22%2F%3E%3C%2Fsvg%3E')] opacity-30"></div>
            <div className="relative z-10">
              <h3 className="text-2xl font-bold text-white mb-6 text-center">🎉 Your {currentYear} in Numbers</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <p className="text-5xl font-bold text-white">{stats.totalHours.toFixed(0)}</p>
                  <p className="text-purple-200 mt-2">Hours Logged ⏰</p>
                </div>
                <div className="text-center">
                  <p className="text-5xl font-bold text-white">{stats.coffees}</p>
                  <p className="text-purple-200 mt-2">Coffees Consumed ☕</p>
                </div>
                <div className="text-center">
                  <p className="text-5xl font-bold text-white">{stats.ticketsWorked}</p>
                  <p className="text-purple-200 mt-2">Tickets Worked 🎫</p>
                </div>
                <div className="text-center">
                  <p className="text-5xl font-bold text-white">{stats.longestStreak}</p>
                  <p className="text-purple-200 mt-2">Day Streak 🔥</p>
                </div>
              </div>
            </div>
          </div>

          {/* Key Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-4xl">⏱️</span>
                <span className="text-4xl font-bold text-white">{stats.totalHours.toFixed(0)}h</span>
              </div>
              <h3 className="text-xl font-bold text-white mt-4">Total Hours</h3>
              <p className="text-blue-100 text-sm">Logged this year</p>
            </div>

            <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-4xl">💰</span>
                <span className="text-4xl font-bold text-white">{stats.billablePercent.toFixed(0)}%</span>
              </div>
              <h3 className="text-xl font-bold text-white mt-4">Billable Rate</h3>
              <p className="text-green-100 text-sm">{stats.billableHours.toFixed(0)}h billable</p>
            </div>

            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-4xl">✅</span>
                <span className="text-4xl font-bold text-white">{stats.ticketsClosed}</span>
              </div>
              <h3 className="text-xl font-bold text-white mt-4">Tickets Closed</h3>
              <p className="text-purple-100 text-sm">Problems solved</p>
            </div>

            <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-4xl">📁</span>
                <span className="text-4xl font-bold text-white">{stats.projectsWorked}</span>
              </div>
              <h3 className="text-xl font-bold text-white mt-4">Projects</h3>
              <p className="text-orange-100 text-sm">Worked on this year</p>
            </div>
          </div>

          {/* More Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-800 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">📊</span>
                <h3 className="text-lg font-semibold text-white">Top Month</h3>
              </div>
              <p className="text-3xl font-bold text-blue-400">{stats.topMonth.month}</p>
              <p className="text-gray-400">{stats.topMonth.hours.toFixed(0)} hours logged</p>
            </div>

            <div className="bg-gray-800 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">📝</span>
                <h3 className="text-lg font-semibold text-white">Documentation</h3>
              </div>
              <p className="text-3xl font-bold text-purple-400">{stats.notesPercent.toFixed(0)}%</p>
              <p className="text-gray-400">Entries with notes</p>
            </div>

            <div className="bg-gray-800 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">📈</span>
                <h3 className="text-lg font-semibold text-white">Avg Per Day</h3>
              </div>
              <p className="text-3xl font-bold text-green-400">{stats.avgHoursPerDay.toFixed(1)}h</p>
              <p className="text-gray-400">On working days</p>
            </div>
          </div>

          {/* AI Generated Wrapped */}
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-white">🤖 AI Year in Review</h3>
              <button
                onClick={generateWrapped}
                disabled={isGenerating}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  isGenerating
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white'
                }`}
              >
                {isGenerating ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">✨</span> Creating...
                  </span>
                ) : (
                  '✨ Regenerate'
                )}
              </button>
            </div>
            
            {wrappedError && (
              <div className="bg-red-600/20 border border-red-500 rounded-lg p-4 mb-4">
                <p className="text-red-400">{wrappedError}</p>
              </div>
            )}
            
            {isGenerating ? (
              <div className="text-center py-12">
                <div className="animate-spin text-6xl mb-4">✨</div>
                <p className="text-gray-400 text-lg">Creating your personalized year in review...</p>
              </div>
            ) : aiWrapped ? (
              <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-lg p-6 border border-gray-600">
                <div className="whitespace-pre-wrap text-gray-200 leading-relaxed text-lg">
                  {aiWrapped}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-700/30 rounded-lg border border-dashed border-gray-600">
                <p className="text-gray-400">
                  Your AI-generated year in review will appear here...
                </p>
              </div>
            )}
          </div>

          {/* Back button */}
          <div className="mt-6 text-center">
            <button
              onClick={() => setShowWrapped(false)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ← Back to intro
            </button>
          </div>
        </>
      )}
    </div>
  )
}
