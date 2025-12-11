import { useMemo, useEffect, useState } from 'react'
import { useSelectedEngineerStore, TEAM_DEFINITIONS } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useTicketsStore } from '@/stores/ticketsStore'
import { useProjectsStore } from '@/stores/projectsStore'
import { useTimePeriodStore } from '@/stores/timePeriodStore'
import DataSourceFilter, { useDataSources } from '@/components/DataSourceFilter'
import { calculateNoteQuality } from '@/lib/noteQuality'
import { format } from 'date-fns'

interface NoteEntry {
  id: number
  date: string
  hours: number
  notes: string
  billableOption: string
  ticketId?: number
  ticketSummary?: string
  source: 'serviceDesk' | 'projects' | 'unknown'
  qualityScore: number
}

export default function Notes() {
  const { selectedEngineerId, selectedTeam } = useSelectedEngineerStore()
  const { members } = useMembersStore()
  const { entries, fetchTimeEntries } = useTimeEntriesStore()
  const { serviceTickets, fetchServiceBoardTickets } = useTicketsStore()
  const { projectTickets, fetchProjects, fetchProjectTickets } = useProjectsStore()
  const { getDateRange, getPeriodLabel } = useTimePeriodStore()

  const { dataSources, setDataSources, includesServiceDesk, includesProjects } = useDataSources()
  const [sortBy, setSortBy] = useState<'date' | 'quality' | 'hours'>('date')
  const [filterQuality, setFilterQuality] = useState<'all' | 'good' | 'poor'>('all')

  const dateRange = getDateRange()
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

  // Build lookup maps
  const serviceTicketMap = useMemo(() => new Map(serviceTickets.map(t => [t.id, t])), [serviceTickets])
  const projectTicketMap = useMemo(() => new Map(projectTickets.map(t => [t.id, t])), [projectTickets])

  // Filter entries and enrich with ticket info
  const enrichedEntries = useMemo((): NoteEntry[] => {
    let result = entries.filter(e => {
      const entryDate = new Date(e.dateStart)
      return entryDate >= dateRange.start && entryDate <= dateRange.end
    })

    if (selectedEngineerId !== null) {
      result = result.filter(e => e.memberId === selectedEngineerId)
    } else if (selectedTeam !== 'All Company') {
      const teamIdentifiers = TEAM_DEFINITIONS[selectedTeam] || []
      result = result.filter(e => {
        const member = members.find(m => m.id === e.memberId)
        return member && teamIdentifiers.includes(member.identifier.toLowerCase())
      })
    }

    // Filter by data source
    if (!includesServiceDesk && !includesProjects) return []

    const mapped: NoteEntry[] = []

    for (const entry of result) {
      const ticketId = entry.ticketId
      let source: 'serviceDesk' | 'projects' | 'unknown' = 'unknown'
      let ticketSummary: string | undefined

      if (ticketId && serviceTicketMap.has(ticketId)) {
        source = 'serviceDesk'
        ticketSummary = serviceTicketMap.get(ticketId)?.summary
      } else if (ticketId && projectTicketMap.has(ticketId)) {
        source = 'projects'
        ticketSummary = projectTicketMap.get(ticketId)?.summary
      }

      // Filter based on selected data source
      if (source === 'serviceDesk' && !includesServiceDesk) continue
      if (source === 'projects' && !includesProjects) continue
      if (source === 'unknown' && !(includesServiceDesk || includesProjects)) continue

      const qualityResult = calculateNoteQuality(entry.notes, ticketSummary)

      const date = entry.dateStart instanceof Date ? entry.dateStart.toISOString() : entry.dateStart

      mapped.push({
        id: entry.id,
        date,
        hours: entry.hours,
        notes: entry.notes || '',
        billableOption: entry.billableOption || 'N/A',
        ticketId,
        ticketSummary,
        source,
        qualityScore: qualityResult.overall,
      })
    }

    return mapped
  }, [entries, selectedEngineerId, dateRange, includesServiceDesk, includesProjects, serviceTicketMap, projectTicketMap])

  // Apply filters and sorting
  const displayEntries = useMemo(() => {
    let result = [...enrichedEntries]

    // Quality filter
    if (filterQuality === 'good') {
      result = result.filter(e => e.qualityScore >= 60)
    } else if (filterQuality === 'poor') {
      result = result.filter(e => e.qualityScore < 60)
    }

    // Sorting
    switch (sortBy) {
      case 'date':
        result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        break
      case 'quality':
        result.sort((a, b) => b.qualityScore - a.qualityScore)
        break
      case 'hours':
        result.sort((a, b) => b.hours - a.hours)
        break
    }

    return result
  }, [enrichedEntries, filterQuality, sortBy])

  // Stats
  const stats = useMemo(() => {
    const withNotes = enrichedEntries.filter(e => e.notes && e.notes.trim().length > 0)
    const avgQuality = withNotes.length > 0
      ? withNotes.reduce((sum, e) => sum + e.qualityScore, 0) / withNotes.length
      : 0
    const serviceDeskCount = enrichedEntries.filter(e => e.source === 'serviceDesk').length
    const projectsCount = enrichedEntries.filter(e => e.source === 'projects').length
    const goodQuality = enrichedEntries.filter(e => e.qualityScore >= 60).length
    const poorQuality = enrichedEntries.filter(e => e.qualityScore < 60 && e.notes).length
    const noNotes = enrichedEntries.filter(e => !e.notes || e.notes.trim().length === 0).length

    return {
      total: enrichedEntries.length,
      withNotes: withNotes.length,
      withoutNotes: noNotes,
      notesPercent: enrichedEntries.length > 0 ? (withNotes.length / enrichedEntries.length) * 100 : 0,
      avgQuality,
      serviceDeskCount,
      projectsCount,
      goodQuality,
      poorQuality,
    }
  }, [enrichedEntries])

  const getQualityColor = (score: number) => {
    if (score >= 80) return 'text-green-400 bg-green-500/20'
    if (score >= 60) return 'text-blue-400 bg-blue-500/20'
    if (score >= 40) return 'text-yellow-400 bg-yellow-500/20'
    return 'text-red-400 bg-red-500/20'
  }

  const getSourceBadge = (source: 'serviceDesk' | 'projects' | 'unknown') => {
    switch (source) {
      case 'serviceDesk': return { label: 'Service Desk', class: 'bg-cyan-600/20 text-cyan-400' }
      case 'projects': return { label: 'Project', class: 'bg-purple-600/20 text-purple-400' }
      default: return { label: 'Other', class: 'bg-gray-600/20 text-gray-400' }
    }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Notes Quality Analysis</h2>
          <p className="text-gray-400">
            {selectedEngineer ? `Analyzing notes for ${selectedEngineer.firstName} ${selectedEngineer.lastName}` : 'Notes quality analysis for all engineers'}
            {' • '}<span className="text-blue-400">{getPeriodLabel()}</span>
          </p>
        </div>
        <DataSourceFilter selected={dataSources} onChange={setDataSources} />
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-xs font-medium text-gray-400 mb-1">Total Entries</h3>
          <p className="text-2xl font-bold text-white">{stats.total}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-xs font-medium text-gray-400 mb-1">With Notes</h3>
          <p className="text-2xl font-bold text-green-400">{stats.notesPercent.toFixed(0)}%</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-xs font-medium text-gray-400 mb-1">Avg Quality</h3>
          <p className={`text-2xl font-bold ${stats.avgQuality >= 60 ? 'text-green-400' : stats.avgQuality >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
            {stats.avgQuality.toFixed(0)}
          </p>
        </div>
        {includesServiceDesk && (
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-xs font-medium text-gray-400 mb-1">Service Desk</h3>
            <p className="text-2xl font-bold text-cyan-400">{stats.serviceDeskCount}</p>
          </div>
        )}
        {includesProjects && (
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-xs font-medium text-gray-400 mb-1">Projects</h3>
            <p className="text-2xl font-bold text-purple-400">{stats.projectsCount}</p>
          </div>
        )}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-xs font-medium text-gray-400 mb-1">Need Improvement</h3>
          <p className="text-2xl font-bold text-orange-400">{stats.poorQuality + stats.withoutNotes}</p>
        </div>
      </div>

      {/* Quality Distribution */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">Quality Distribution</h3>
        <div className="flex items-center gap-2 h-8 rounded-lg overflow-hidden">
          {stats.goodQuality > 0 && (
            <div className="h-full bg-green-500" style={{ width: `${(stats.goodQuality / stats.total) * 100}%` }} title={`Good: ${stats.goodQuality}`} />
          )}
          {stats.poorQuality > 0 && (
            <div className="h-full bg-yellow-500" style={{ width: `${(stats.poorQuality / stats.total) * 100}%` }} title={`Needs work: ${stats.poorQuality}`} />
          )}
          {stats.withoutNotes > 0 && (
            <div className="h-full bg-red-500" style={{ width: `${(stats.withoutNotes / stats.total) * 100}%` }} title={`No notes: ${stats.withoutNotes}`} />
          )}
        </div>
        <div className="flex flex-wrap gap-4 mt-3 text-sm">
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-green-500"></span>Good ({stats.goodQuality})</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-yellow-500"></span>Needs Work ({stats.poorQuality})</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-red-500"></span>No Notes ({stats.withoutNotes})</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Sort by:</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm border border-gray-600 focus:border-blue-500 focus:outline-none">
            <option value="date">Date</option>
            <option value="quality">Quality Score</option>
            <option value="hours">Hours</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Quality:</span>
          <select value={filterQuality} onChange={(e) => setFilterQuality(e.target.value as any)}
            className="bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm border border-gray-600 focus:border-blue-500 focus:outline-none">
            <option value="all">All</option>
            <option value="good">Good (60+)</option>
            <option value="poor">Needs Improvement (&lt;60)</option>
          </select>
        </div>
        <span className="text-sm text-gray-400 ml-auto">Showing {displayEntries.length} of {enrichedEntries.length}</span>
      </div>

      {/* Entries List */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left py-3 px-4 text-gray-300 text-sm font-medium">Date</th>
                <th className="text-left py-3 px-4 text-gray-300 text-sm font-medium">Source</th>
                <th className="text-left py-3 px-4 text-gray-300 text-sm font-medium">Hours</th>
                <th className="text-left py-3 px-4 text-gray-300 text-sm font-medium">Quality</th>
                <th className="text-left py-3 px-4 text-gray-300 text-sm font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {displayEntries.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-gray-400">No entries found</td></tr>
              ) : (
                displayEntries.slice(0, 50).map((entry) => {
                  const sourceBadge = getSourceBadge(entry.source)
                  return (
                    <tr key={entry.id} className="hover:bg-gray-700/50">
                      <td className="py-3 px-4 text-sm text-gray-300">{format(new Date(entry.date), 'MMM d, yyyy')}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${sourceBadge.class}`}>{sourceBadge.label}</span>
                      </td>
                      <td className="py-3 px-4 text-sm text-white font-medium">{entry.hours}h</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getQualityColor(entry.qualityScore)}`}>
                          {entry.qualityScore}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-300 max-w-md">
                        {entry.ticketSummary && (
                          <div className="text-xs text-gray-500 mb-1">Ticket: {entry.ticketSummary.substring(0, 50)}...</div>
                        )}
                        <div className="truncate">{entry.notes || <span className="text-red-400 italic">No notes</span>}</div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {displayEntries.length > 50 && (
          <div className="p-4 text-center text-gray-400 text-sm border-t border-gray-700">
            Showing 50 of {displayEntries.length} entries
          </div>
        )}
      </div>
    </div>
  )
}
