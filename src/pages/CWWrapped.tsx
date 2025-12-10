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
  const [progress, setProgress] = useState<{
    step: string
    current: number
    total: number
    data?: Record<string, any>
  } | null>(null)

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
    setProgress({ step: 'Starting analysis...', current: 0, total: 6 })
    
    try {
      // Step 1: Analyzing time entries
      setProgress({ 
        step: 'Analyzing time entries', 
        current: 1, 
        total: 6,
        data: { entries: yearEntries.length, hours: stats.totalHours.toFixed(0) }
      })
      await new Promise(resolve => setTimeout(resolve, 500))

      // Step 2: Processing tickets
      setProgress({ 
        step: 'Processing tickets', 
        current: 2, 
        total: 6,
        data: { worked: stats.ticketsWorked, closed: stats.ticketsClosed }
      })
      await new Promise(resolve => setTimeout(resolve, 500))

      // Step 3: Analyzing projects
      setProgress({ 
        step: 'Analyzing projects', 
        current: 3, 
        total: 6,
        data: { projects: stats.projectsWorked }
      })
      await new Promise(resolve => setTimeout(resolve, 500))

      // Step 4: Calculating statistics
      setProgress({ 
        step: 'Calculating statistics', 
        current: 4, 
        total: 6,
        data: { 
          billable: `${stats.billablePercent.toFixed(0)}%`,
          notes: `${stats.notesPercent.toFixed(0)}%`,
          streak: stats.longestStreak
        }
      })
      await new Promise(resolve => setTimeout(resolve, 500))

      // Step 5: Generating insights
      setProgress({ 
        step: 'Generating insights', 
        current: 5, 
        total: 6,
        data: { topMonth: stats.topMonth.month }
      })
      await new Promise(resolve => setTimeout(resolve, 500))

      // Step 6: Creating AI summary
      setProgress({ 
        step: 'Creating AI summary', 
        current: 6, 
        total: 6 
      })

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
      setProgress(null)
    } catch (error: any) {
      console.error('Error generating wrapped:', error)
      setWrappedError(error.message || 'Failed to generate wrapped')
      setProgress(null)
    } finally {
      setIsGenerating(false)
    }
  }

  const isLoading = entries.length === 0

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">CW Wrapped {currentYear}</h2>
        <p className="text-gray-400">
          {selectedEngineer 
            ? `${selectedEngineer.firstName} ${selectedEngineer.lastName}'s year in review`
            : 'Your team\'s year in review'}
        </p>
      </div>

      {!showWrapped ? (
        // Initial hero section with generate button
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 mb-6">
          <div className="text-center py-12">
            <h3 className="text-4xl font-bold text-white mb-4">
              Your {currentYear} CW Wrapped
            </h3>
            <p className="text-xl text-gray-300 mb-8 max-w-xl mx-auto">
              Discover your year in ConnectWise! See your accomplishments, stats, and get an AI-powered summary of your work.
            </p>
            <button 
              onClick={generateWrapped}
              disabled={isLoading}
              className={`px-10 py-4 rounded-lg font-bold text-lg transition-all ${
                isLoading 
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl'
              }`}
            >
              {isLoading ? 'Loading data...' : 'Generate Your Wrapped'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Year in Numbers - Fun Stats */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 mb-6">
            <h3 className="text-2xl font-bold text-white mb-6 text-center">Your {currentYear} in Numbers</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-5xl font-bold text-white">{stats.totalHours.toFixed(0)}</p>
                <p className="text-gray-300 mt-2">Hours Logged</p>
              </div>
              <div className="text-center">
                <p className="text-5xl font-bold text-white">{stats.coffees}</p>
                <p className="text-gray-300 mt-2">Days of Work</p>
              </div>
              <div className="text-center">
                <p className="text-5xl font-bold text-white">{stats.ticketsWorked}</p>
                <p className="text-gray-300 mt-2">Tickets Worked</p>
              </div>
              <div className="text-center">
                <p className="text-5xl font-bold text-white">{stats.longestStreak}</p>
                <p className="text-gray-300 mt-2">Day Streak</p>
              </div>
            </div>
          </div>

          {/* Key Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-end">
                <span className="text-4xl font-bold text-white">{stats.totalHours.toFixed(0)}h</span>
              </div>
              <h3 className="text-xl font-bold text-white mt-4">Total Hours</h3>
              <p className="text-blue-100 text-sm">Logged this year</p>
            </div>

            <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-end">
                <span className="text-4xl font-bold text-white">{stats.billablePercent.toFixed(0)}%</span>
              </div>
              <h3 className="text-xl font-bold text-white mt-4">Billable Rate</h3>
              <p className="text-green-100 text-sm">{stats.billableHours.toFixed(0)}h billable</p>
            </div>

            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-end">
                <span className="text-4xl font-bold text-white">{stats.ticketsClosed}</span>
              </div>
              <h3 className="text-xl font-bold text-white mt-4">Tickets Closed</h3>
              <p className="text-blue-100 text-sm">Problems solved</p>
            </div>

            <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-end">
                <span className="text-4xl font-bold text-white">{stats.projectsWorked}</span>
              </div>
              <h3 className="text-xl font-bold text-white mt-4">Projects</h3>
              <p className="text-orange-100 text-sm">Worked on this year</p>
            </div>
          </div>

          {/* More Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Top Month</h3>
              <p className="text-3xl font-bold text-blue-400">{stats.topMonth.month}</p>
              <p className="text-gray-400">{stats.topMonth.hours.toFixed(0)} hours logged</p>
            </div>

            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Documentation</h3>
              <p className="text-3xl font-bold text-blue-400">{stats.notesPercent.toFixed(0)}%</p>
              <p className="text-gray-400">Entries with notes</p>
            </div>

            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Avg Per Day</h3>
              <p className="text-3xl font-bold text-green-400">{stats.avgHoursPerDay.toFixed(1)}h</p>
              <p className="text-gray-400">On working days</p>
            </div>
          </div>

          {/* Progress Dialog */}
          {isGenerating && progress && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 max-w-md w-full mx-4">
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-bold text-white">Crunching Your Data...</h3>
                    <span className="text-sm text-gray-400">{progress.current}/{progress.total}</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      progress.current >= 1 ? 'bg-blue-500' : 'bg-gray-600'
                    }`} />
                    <div className="flex-1">
                      <p className={`font-medium ${
                        progress.current >= 1 ? 'text-white' : 'text-gray-400'
                      }`}>
                        Analyzing time entries
                      </p>
                      {progress.current >= 1 && progress.data?.entries !== undefined && (
                        <p className="text-sm text-gray-400 mt-1">
                          {progress.data.entries} entries • {progress.data.hours}h total
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      progress.current >= 2 ? 'bg-blue-500' : 'bg-gray-600'
                    }`} />
                    <div className="flex-1">
                      <p className={`font-medium ${
                        progress.current >= 2 ? 'text-white' : 'text-gray-400'
                      }`}>
                        Processing tickets
                      </p>
                      {progress.current >= 2 && progress.data?.worked !== undefined && (
                        <p className="text-sm text-gray-400 mt-1">
                          {progress.data.worked} worked • {progress.data.closed} closed
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      progress.current >= 3 ? 'bg-blue-500' : 'bg-gray-600'
                    }`} />
                    <div className="flex-1">
                      <p className={`font-medium ${
                        progress.current >= 3 ? 'text-white' : 'text-gray-400'
                      }`}>
                        Analyzing projects
                      </p>
                      {progress.current >= 3 && progress.data?.projects !== undefined && (
                        <p className="text-sm text-gray-400 mt-1">
                          {progress.data.projects} projects worked on
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      progress.current >= 4 ? 'bg-blue-500' : 'bg-gray-600'
                    }`} />
                    <div className="flex-1">
                      <p className={`font-medium ${
                        progress.current >= 4 ? 'text-white' : 'text-gray-400'
                      }`}>
                        Calculating statistics
                      </p>
                      {progress.current >= 4 && progress.data?.billable !== undefined && (
                        <p className="text-sm text-gray-400 mt-1">
                          {progress.data.billable} billable • {progress.data.notes} notes • {progress.data.streak} day streak
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      progress.current >= 5 ? 'bg-blue-500' : 'bg-gray-600'
                    }`} />
                    <div className="flex-1">
                      <p className={`font-medium ${
                        progress.current >= 5 ? 'text-white' : 'text-gray-400'
                      }`}>
                        Generating insights
                      </p>
                      {progress.current >= 5 && progress.data?.topMonth !== undefined && (
                        <p className="text-sm text-gray-400 mt-1">
                          Top month: {progress.data.topMonth}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      progress.current >= 6 ? 'bg-blue-500' : 'bg-gray-600'
                    }`} />
                    <div className="flex-1">
                      <p className={`font-medium ${
                        progress.current >= 6 ? 'text-white' : 'text-gray-400'
                      }`}>
                        Creating AI summary
                      </p>
                      {progress.current >= 6 && (
                        <p className="text-sm text-gray-400 mt-1">
                          Almost done...
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI Generated Wrapped */}
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-white">AI Year in Review</h3>
              <button
                onClick={generateWrapped}
                disabled={isGenerating}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  isGenerating
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {isGenerating ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                    Creating...
                  </span>
                ) : (
                  'Regenerate'
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
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
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
