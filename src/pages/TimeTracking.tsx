import { useEffect, useState, useMemo } from 'react'
import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useTicketsStore } from '@/stores/ticketsStore'
import { useProjectsStore } from '@/stores/projectsStore'
import { useTimePeriodStore } from '@/stores/timePeriodStore'
import DataSourceFilter, { useDataSources } from '@/components/DataSourceFilter'
import { format } from 'date-fns'
import { api } from '@/lib/api'

interface EngineerAnalytics {
  memberId: number
  name: string
  identifier: string
  totalHours: number
  billableHours: number
  billablePercent: number
  notesPercent: number
  avgHoursPerDay: number
  entriesCount: number
  daysWorked: number
  serviceTicketsWorked: number
  serviceTicketsClosed: number
  projectTicketsWorked: number
  projectTicketsClosed: number
}

export default function TimeTracking() {
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { members } = useMembersStore()
  const { entries, isLoading, fetchTimeEntries } = useTimeEntriesStore()
  const { serviceTickets, fetchServiceBoardTickets } = useTicketsStore()
  const { projects, projectTickets, fetchProjects, fetchProjectTickets } = useProjectsStore()
  const { getDateRange, getPeriodLabel } = useTimePeriodStore()
  
  const { dataSources, setDataSources, includesServiceDesk, includesProjects } = useDataSources()
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  const dateRange = getDateRange()
  const periodLabel = getPeriodLabel()
  const selectedEngineer = selectedEngineerId ? members.find(m => m.id === selectedEngineerId) : null

  // Fetch static data once on mount (tickets and projects don't depend on date range)
  useEffect(() => {
    fetchServiceBoardTickets()
    fetchProjects()
    fetchProjectTickets()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch time entries when date range changes
  useEffect(() => {
    fetchTimeEntries({ startDate: format(dateRange.start, 'yyyy-MM-dd'), endDate: format(dateRange.end, 'yyyy-MM-dd') })
  }, [dateRange.start.getTime(), dateRange.end.getTime(), fetchTimeEntries])

  // Filter entries
  const filteredEntries = useMemo(() => {
    let result = entries.filter(e => {
      const entryDate = new Date(e.dateStart)
      return entryDate >= dateRange.start && entryDate <= dateRange.end
    })
    if (selectedEngineerId !== null) result = result.filter(e => e.memberId === selectedEngineerId)
    return result
  }, [entries, selectedEngineerId, dateRange])

  // Calculate analytics for each engineer
  const engineerAnalytics = useMemo((): EngineerAnalytics[] => {
    const targetMembers = selectedEngineerId ? members.filter(m => m.id === selectedEngineerId) : members

    return targetMembers.map(member => {
      const memberEntries = filteredEntries.filter(e => e.memberId === member.id)
      const totalHours = memberEntries.reduce((sum, e) => sum + e.hours, 0)
      const billableHours = memberEntries.filter(e => e.billableOption === 'Billable').reduce((sum, e) => sum + e.hours, 0)
      const withNotes = memberEntries.filter(e => e.notes && e.notes.trim().length > 0).length
      const uniqueDays = new Set(memberEntries.map(e => new Date(e.dateStart).toDateString())).size
      const identifier = member.identifier.toLowerCase()

      // Service desk stats - filter by date range and engineer
      const memberServiceTickets = includesServiceDesk ? serviceTickets.filter(t => {
        // Filter by date range
        if (t.dateEntered) {
          const entered = new Date(t.dateEntered)
          if (entered < dateRange.start || entered > dateRange.end) return false
        }
        // Filter by engineer
        return t.owner?.toLowerCase() === identifier || t.resources?.toLowerCase().includes(identifier)
      }) : []
      
      // Project stats - filter by date range and engineer
      const memberProjects = includesProjects ? projects.filter(p => p.managerIdentifier?.toLowerCase() === identifier) : []
      const memberProjectIds = memberProjects.map(p => p.id)
      const memberProjectTickets = includesProjects ? projectTickets.filter(t => {
        // Filter by date range
        if (t.dateEntered) {
          const entered = new Date(t.dateEntered)
          if (entered < dateRange.start || entered > dateRange.end) return false
        }
        // Filter by engineer
        return memberProjectIds.includes(t.projectId) || t.resources?.toLowerCase().includes(identifier)
      }) : []

      return {
        memberId: member.id,
        name: `${member.firstName} ${member.lastName}`,
        identifier,
        totalHours,
        billableHours,
        billablePercent: totalHours > 0 ? (billableHours / totalHours) * 100 : 0,
        notesPercent: memberEntries.length > 0 ? (withNotes / memberEntries.length) * 100 : 0,
        avgHoursPerDay: uniqueDays > 0 ? totalHours / uniqueDays : 0,
        entriesCount: memberEntries.length,
        daysWorked: uniqueDays,
        serviceTicketsWorked: memberServiceTickets.length,
        serviceTicketsClosed: memberServiceTickets.filter(t => t.closedFlag).length,
        projectTicketsWorked: memberProjectTickets.length,
        projectTicketsClosed: memberProjectTickets.filter(t => t.closedFlag).length,
      }
    }).sort((a, b) => b.totalHours - a.totalHours)
  }, [members, filteredEntries, serviceTickets, projects, projectTickets, selectedEngineerId, includesServiceDesk, includesProjects, dateRange])

  // Aggregate stats
  const aggregateStats = useMemo(() => {
    const totalHours = engineerAnalytics.reduce((sum, e) => sum + e.totalHours, 0)
    const billableHours = engineerAnalytics.reduce((sum, e) => sum + e.billableHours, 0)
    const totalEntries = engineerAnalytics.reduce((sum, e) => sum + e.entriesCount, 0)
    const withNotes = filteredEntries.filter(e => e.notes && e.notes.trim().length > 0).length

    return {
      totalHours, billableHours,
      billablePercent: totalHours > 0 ? (billableHours / totalHours) * 100 : 0,
      totalEntries,
      notesPercent: totalEntries > 0 ? (withNotes / totalEntries) * 100 : 0,
      engineerCount: engineerAnalytics.length,
      serviceTickets: engineerAnalytics.reduce((sum, e) => sum + e.serviceTicketsWorked, 0),
      projectTickets: engineerAnalytics.reduce((sum, e) => sum + e.projectTicketsWorked, 0),
    }
  }, [engineerAnalytics, filteredEntries])

  const generateAIAnalysis = async () => {
    setIsGeneratingAnalysis(true)
    setAnalysisError(null)
    try {
      const response = await api.generateAnalysis('engineerAnalysis', {
        prompt: `Analyze time tracking performance for ${selectedEngineer ? selectedEngineer.firstName : 'the team'} during ${periodLabel}.`,
        data: { aggregateStats, engineerAnalytics, dataSources },
      })
      setAiAnalysis(response.analysis)
    } catch (error: any) {
      setAnalysisError(error.message || 'Failed to generate analysis')
    } finally {
      setIsGeneratingAnalysis(false)
    }
  }

  const getPerformanceRating = (analytics: EngineerAnalytics): { label: string; color: string } => {
    const score = (analytics.billablePercent * 0.4) + (analytics.notesPercent * 0.3) + (Math.min(analytics.avgHoursPerDay / 8, 1) * 100 * 0.3)
    if (score >= 80) return { label: 'Excellent', color: 'text-green-400 bg-green-500/20' }
    if (score >= 65) return { label: 'Good', color: 'text-blue-400 bg-blue-500/20' }
    if (score >= 50) return { label: 'Fair', color: 'text-yellow-400 bg-yellow-500/20' }
    return { label: 'Needs Improvement', color: 'text-orange-400 bg-orange-500/20' }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Engineer Analytics</h2>
          <p className="text-gray-400">
            {selectedEngineer ? `Performance analysis for ${selectedEngineer.firstName} ${selectedEngineer.lastName}` : 'Team performance analytics'}
            {' • '}<span className="text-blue-400">{periodLabel}</span>
          </p>
        </div>
        <DataSourceFilter selected={dataSources} onChange={setDataSources} />
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading analytics...</p>
        </div>
      ) : (
        <>
          {/* Aggregate Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5">
              <h3 className="text-xs font-medium text-blue-100 mb-1">Total Hours</h3>
              <p className="text-3xl font-bold text-white">{aggregateStats.totalHours.toFixed(0)}</p>
            </div>
            <div className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-xl p-5">
              <h3 className="text-xs font-medium text-green-100 mb-1">Billable %</h3>
              <p className="text-3xl font-bold text-white">{aggregateStats.billablePercent.toFixed(0)}%</p>
            </div>
            {includesServiceDesk && (
              <div className="bg-gradient-to-br from-cyan-600 to-cyan-700 rounded-xl p-5">
                <h3 className="text-xs font-medium text-cyan-100 mb-1">Service Tickets</h3>
                <p className="text-3xl font-bold text-white">{aggregateStats.serviceTickets}</p>
              </div>
            )}
            {includesProjects && (
              <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-5">
                <h3 className="text-xs font-medium text-purple-100 mb-1">Project Tickets</h3>
                <p className="text-3xl font-bold text-white">{aggregateStats.projectTickets}</p>
              </div>
            )}
          </div>

          {/* Engineer Performance Cards */}
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h3 className="text-xl font-semibold text-white mb-4">
              {selectedEngineer ? 'Performance Summary' : 'Engineer Performance'}
            </h3>
            {engineerAnalytics.length === 0 ? (
              <p className="text-gray-400">No data available</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {engineerAnalytics.map((engineer) => {
                  const rating = getPerformanceRating(engineer)
                  return (
                    <div key={engineer.memberId} className="bg-gray-700/50 rounded-lg p-5 border border-gray-600">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-semibold text-white">{engineer.name}</h4>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${rating.color}`}>{rating.label}</span>
                      </div>
                      
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-400">Total Hours</span>
                            <span className="text-white font-medium">{engineer.totalHours.toFixed(1)}h</span>
                          </div>
                          <div className="h-2 bg-gray-600 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${engineerAnalytics.length > 0 ? Math.min((engineer.totalHours / Math.max(...engineerAnalytics.map(e => e.totalHours), 1)) * 100, 100) : 0}%` }} />
                          </div>
                        </div>
                        
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-400">Billable %</span>
                            <span className="text-white font-medium">{engineer.billablePercent.toFixed(0)}%</span>
                          </div>
                          <div className="h-2 bg-gray-600 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${engineer.billablePercent >= 70 ? 'bg-green-500' : engineer.billablePercent >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${engineer.billablePercent}%` }} />
                          </div>
                        </div>

                        {includesServiceDesk && (
                          <div className="flex justify-between text-sm pt-2 border-t border-gray-600">
                            <span className="text-cyan-400">Service Tickets</span>
                            <span className="text-white">{engineer.serviceTicketsWorked} ({engineer.serviceTicketsClosed} closed)</span>
                          </div>
                        )}
                        
                        {includesProjects && (
                          <div className="flex justify-between text-sm">
                            <span className="text-purple-400">Project Tickets</span>
                            <span className="text-white">{engineer.projectTicketsWorked} ({engineer.projectTicketsClosed} closed)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* AI Analysis */}
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-white">AI Performance Insights</h3>
              <button onClick={generateAIAnalysis} disabled={isGeneratingAnalysis || engineerAnalytics.length === 0}
                className={`px-5 py-2.5 rounded-lg font-medium transition-all ${isGeneratingAnalysis || engineerAnalytics.length === 0 ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
                {isGeneratingAnalysis ? <span className="flex items-center gap-2"><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>Analyzing...</span> : 'Generate AI Analysis'}
              </button>
            </div>
            {analysisError && <div className="bg-red-600/20 border border-red-500 rounded-lg p-4 mb-4"><p className="text-red-400">{analysisError}</p></div>}
            {aiAnalysis ? (
              <div className="bg-gradient-to-br from-gray-700 to-gray-750 rounded-lg p-6 border border-gray-600">
                <div className="whitespace-pre-wrap text-gray-200 leading-relaxed">{aiAnalysis}</div>
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-700/30 rounded-lg border border-dashed border-gray-600">
                <p className="text-gray-400 text-lg mb-2">Get AI-powered insights about {selectedEngineer ? `${selectedEngineer.firstName}'s` : 'team'} performance</p>
                <p className="text-gray-500 text-sm">Click "Generate AI Analysis" for personalized recommendations</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
