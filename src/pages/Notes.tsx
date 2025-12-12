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
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
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
    result.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime()
          break
        case 'quality':
          comparison = a.qualityScore - b.qualityScore
          break
        case 'hours':
          comparison = a.hours - b.hours
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [enrichedEntries, filterQuality, sortBy, sortDirection])

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

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Main Content (3 Columns) */}
        <div className="lg:col-span-3 space-y-6">
          {/* Stats Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-xs font-medium text-gray-400 mb-1">Need Improvement</h3>
              <p className="text-2xl font-bold text-orange-400">{stats.poorQuality + stats.withoutNotes}</p>
            </div>
          </div>

          {/* Quality Distribution Bar (Simplified) */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Quality Distribution</h3>
            <div className="flex items-center gap-2 h-8 rounded-lg overflow-hidden mb-3">
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
          </div>

          {/* Filters */}
          <div className="bg-gray-800 rounded-lg p-4 flex flex-wrap gap-4 items-center">
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
                    <th onClick={() => { setSortBy('date'); setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc'); }} className="text-left py-3 px-4 text-gray-300 text-sm font-medium cursor-pointer hover:text-white transition-colors select-none">Date {sortBy === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                    <th className="text-left py-3 px-4 text-gray-300 text-sm font-medium">Source</th>
                    <th onClick={() => { setSortBy('hours'); setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc'); }} className="text-left py-3 px-4 text-gray-300 text-sm font-medium cursor-pointer hover:text-white transition-colors select-none">Hours {sortBy === 'hours' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
                    <th onClick={() => { setSortBy('quality'); setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc'); }} className="text-left py-3 px-4 text-gray-300 text-sm font-medium cursor-pointer hover:text-white transition-colors select-none">Quality {sortBy === 'quality' && (sortDirection === 'asc' ? '↑' : '↓')}</th>
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
                            <div className="truncate" title={entry.notes}>{entry.notes || <span className="text-red-400 italic">No notes</span>}</div>
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

        {/* Sidebar (Legend) */}
        <div className="space-y-6 sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto pr-2">
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">Quality Legend</h3>

            <div className="space-y-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-3 h-3 rounded-full bg-green-500 mt-1.5 shrink-0" />
                <div>
                  <div className="font-semibold text-green-400">Excellent (80-100)</div>
                  <p className="text-xs text-gray-400">Detailed, actionable notes with clear context and resolution.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-3 h-3 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                <div>
                  <div className="font-semibold text-blue-400">Good (60-79)</div>
                  <p className="text-xs text-gray-400">Adequate length (&gt;50 chars), includes action verbs and basic context.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-3 h-3 rounded-full bg-yellow-500 mt-1.5 shrink-0" />
                <div>
                  <div className="font-semibold text-yellow-400">Fair (40-59)</div>
                  <p className="text-xs text-gray-400">Short or lacking detail. May be missing problem or resolution.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500 mt-1.5 shrink-0" />
                <div>
                  <div className="font-semibold text-red-400">Poor (&lt;40)</div>
                  <p className="text-xs text-gray-400">Very short, missing key actions, or no notes at all.</p>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-700 pt-6">
              <h4 className="font-semibold text-white mb-3 text-sm">How Scoring Works</h4>
              <ul className="space-y-3">
                <li className="text-xs text-gray-400">
                  <strong className="text-gray-300 block mb-0.5">Completeness (30%)</strong>
                  Did you state the <span className="text-blue-300">Problem</span> and the <span className="text-green-300">Resolution</span>?
                </li>
                <li className="text-xs text-gray-400">
                  <strong className="text-gray-300 block mb-0.5">Actionability (25%)</strong>
                  Did you use verbs like <em>Installed, Fixed, Updated, Created</em>?
                </li>
                <li className="text-xs text-gray-400">
                  <strong className="text-gray-300 block mb-0.5">Context (25%)</strong>
                  Did you mention <em>Servers, Users, Ticket IDs</em>?
                </li>
                <li className="text-xs text-gray-400">
                  <strong className="text-gray-300 block mb-0.5">Length (20%)</strong>
                  Is the note detailed enough? (&gt;50 chars recommended)
                </li>
              </ul>
            </div>
          </div>

          {/* Employee History Legend */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">Employee History</h3>

            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-green-400 uppercase tracking-wider mb-3">Active Team</h4>
                <div className="space-y-2">
                  {[
                    { name: 'Bryan Wolff', range: '2009 - Present' },
                    { name: 'Shyanne Cano', range: '2020 - Present' },
                    { name: 'Ezekiel Hammond', range: '2023 - Present' },
                    { name: 'Philip Counts', range: '2023 - Present' },
                    { name: 'Daniel Solomon', range: '2023 - Present' },
                    { name: 'Kevin Moreno', range: '2024 - Present' },
                    { name: 'Daniel Cooper', range: '2024 - Present' },
                  ].map(emp => (
                    <div key={emp.name} className="flex justify-between items-baseline text-xs">
                      <span className="text-gray-300 font-medium">{emp.name}</span>
                      <span className="text-gray-500">{emp.range}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Past Employees</h4>
                <div className="space-y-2">
                  {[
                    { name: 'Cheyanne Corder', range: 'Aug 2023 - Dec 2025' },
                    { name: 'Phillip Ernst', range: 'Nov 2022 - Oct 2025' },
                    { name: 'Joy Flynn', range: 'Jul 2019 - Sep 2025' },
                    { name: 'Brent Smith', range: 'Sep 2015 - Sep 2025' },
                    { name: 'Srujan Jalagam', range: 'May 2025 - Jul 2025' },
                    { name: 'Austin Day', range: 'Nov 2024 - Apr 2025' },
                    { name: 'Jason Flynn', range: 'Apr 2021 - Sep 2022' },
                    { name: 'Jeremy Knee', range: 'Sep 2021 - Jul 2022' },
                    { name: 'Jonothon Vercher', range: 'May 2020 - Feb 2022' },
                    { name: 'Margaret Jacobson', range: 'Aug 2021 - Jan 2022' },
                    { name: 'Ryan Pinto', range: 'Aug 2019 - Oct 2021' },
                    { name: 'Frank Flores', range: 'Feb 2021 - Oct 2021' },
                    { name: 'Ethan Montgomery', range: 'May 2021 - Dec 2021' },
                    { name: 'Erin Korzeniewski', range: 'Sep 2020 - May 2021' },
                    { name: 'John Britt', range: 'May 2018 - Jul 2019' },
                    { name: 'Kyle Roberson', range: 'Oct 2022 - Aug 2024' },
                    { name: 'Gloria Walker', range: 'Jan 2024 - Apr 2024' },
                  ].map(emp => (
                    <div key={emp.name} className="flex justify-between items-baseline text-xs">
                      <span className="text-gray-400 font-medium">{emp.name}</span>
                      <span className="text-gray-600">{emp.range}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
