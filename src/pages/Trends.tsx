import { useMemo, useEffect } from 'react'
import { useSelectedEngineerStore, TEAM_DEFINITIONS } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useTicketsStore } from '@/stores/ticketsStore'
import { useProjectsStore } from '@/stores/projectsStore'
import { useTimePeriodStore } from '@/stores/timePeriodStore'
import DataSourceFilter, { useDataSources } from '@/components/DataSourceFilter'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, AreaChart, Area, Brush,
} from 'recharts'
import { format, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval } from 'date-fns'
import { isStandardProject, isWorkstationProject } from '@/lib/projectUtils'

type Granularity = 'day' | 'week' | 'month'

export default function Trends() {
  const { selectedEngineerId, selectedTeam } = useSelectedEngineerStore()
  const { members } = useMembersStore()
  const { entries, fetchTimeEntries } = useTimeEntriesStore()
  const { serviceTickets, fetchServiceBoardTickets } = useTicketsStore()
  const { projects, projectTickets, fetchProjects, fetchProjectTickets } = useProjectsStore()
  const { getDateRange, getPeriodLabel, timePeriod } = useTimePeriodStore()

  const { dataSources, setDataSources, includesServiceDesk, includesProjects } = useDataSources()
  const dateRange = getDateRange()
  const periodLabel = getPeriodLabel()

  const granularity: Granularity = useMemo(() => {
    switch (timePeriod) {
      case 'weekly': return 'day'
      case 'monthly': return 'day'
      case 'quarterly': return 'week'
      case 'yearly': return 'month'
      case 'all': return 'month'
      default: return 'day'
    }
  }, [timePeriod])

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

  const selectedEngineer = selectedEngineerId ? members.find(m => m.id === selectedEngineerId) : null

  // Filter entries
  const filteredEntries = useMemo(() => {
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
    return result
  }, [entries, selectedEngineerId, selectedTeam, dateRange, members])

  // Filter service tickets
  const filteredServiceTickets = useMemo(() => {
    if (!includesServiceDesk) return []
    let result = serviceTickets.filter(t => {
      if (!t.dateEntered) return true
      const entered = new Date(t.dateEntered)
      return entered >= dateRange.start && entered <= dateRange.end
    })
    if (selectedEngineer) {
      const ticketIds = new Set<number>()
      filteredEntries.filter(e => e.ticketId).forEach(e => { if (e.ticketId) ticketIds.add(e.ticketId) })
      result.filter(t => t.owner?.toLowerCase() === selectedEngineer.identifier.toLowerCase() ||
        t.resources?.toLowerCase().includes(selectedEngineer.identifier.toLowerCase())
      ).forEach(t => ticketIds.add(t.id))
      result = result.filter(t => ticketIds.has(t.id))
    } else if (selectedTeam !== 'All Company') {
      const teamIdentifiers = TEAM_DEFINITIONS[selectedTeam] || []
      result = result.filter(t => {
        const isOwnerInTeam = teamIdentifiers.some(id => id.toLowerCase() === t.owner?.toLowerCase())
        const isResourceInTeam = t.resources && teamIdentifiers.some(id => t.resources?.toLowerCase().includes(id.toLowerCase()))
        // Also include if in filteredEntries (which are team filtered)
        const hasEntry = filteredEntries.some(e => e.ticketId === t.id)
        return isOwnerInTeam || isResourceInTeam || hasEntry
      })
    }
    return result
  }, [serviceTickets, selectedEngineer, selectedTeam, filteredEntries, dateRange, includesServiceDesk])

  // Filter projects and project tickets - include projects where engineer is manager OR has time entries
  const filteredProjects = useMemo(() => {
    if (!includesProjects) return []
    if (selectedEngineer) {
      const identifier = selectedEngineer.identifier.toLowerCase()
      // Get project IDs from time entries
      const timeEntryProjectIds = new Set(
        filteredEntries
          .filter(e => e.memberId === selectedEngineer.id && e.projectId !== null && e.projectId !== undefined)
          .map(e => e.projectId!)
      )

      // Get project IDs where engineer is a resource
      const resourceProjectIds = new Set(
        projectTickets
          .filter(t => t.resources?.toLowerCase().includes(identifier))
          .map(t => t.projectId)
      )

      return projects.filter(p =>
        p.managerIdentifier?.toLowerCase() === identifier ||
        timeEntryProjectIds.has(p.id) ||
        resourceProjectIds.has(p.id)
      )
    } else if (selectedTeam !== 'All Company') {
      const teamIdentifiers = TEAM_DEFINITIONS[selectedTeam] || []
      // Get project IDs from time entries (team filtered)
      const timeEntryProjectIds = new Set(
        filteredEntries
          .filter(e => e.projectId !== null && e.projectId !== undefined)
          .map(e => e.projectId!)
      )
      // Get projects where any team member is a resource
      const teamResourceProjectIds = new Set(
        projectTickets
          .filter(t => t.resources && teamIdentifiers.some(id => t.resources?.toLowerCase().includes(id.toLowerCase())))
          .map(t => t.projectId)
      )

      return projects.filter(p =>
        (p.managerIdentifier && teamIdentifiers.includes(p.managerIdentifier.toLowerCase())) ||
        timeEntryProjectIds.has(p.id) ||
        teamResourceProjectIds.has(p.id)
      ).filter(p => isStandardProject(p))
    }
    return projects.filter(p => isStandardProject(p))
  }, [projects, selectedEngineer, selectedTeam, includesProjects, filteredEntries])

  const filteredProjectTickets = useMemo(() => {
    if (!includesProjects) return []
    const projectIds = filteredProjects.map(p => p.id)
    return projectTickets.filter(t => {
      if (!t.dateEntered) return projectIds.includes(t.projectId)
      const entered = new Date(t.dateEntered)
      return entered >= dateRange.start && entered <= dateRange.end && projectIds.includes(t.projectId)
    })
  }, [projectTickets, filteredProjects, dateRange, includesProjects])

  // Generate chart data
  const chartData = useMemo(() => {
    let periods: Date[]
    let formatStr: string
    switch (granularity) {
      case 'day': periods = eachDayOfInterval(dateRange); formatStr = 'MMM d'; break
      case 'week': periods = eachWeekOfInterval(dateRange); formatStr = 'MMM d'; break
      case 'month': periods = eachMonthOfInterval(dateRange); formatStr = 'MMM yyyy'; break
      default: periods = eachDayOfInterval(dateRange); formatStr = 'MMM d'
    }

    return periods.map(period => {
      let periodEnd: Date
      switch (granularity) {
        case 'day': periodEnd = new Date(period); periodEnd.setHours(23, 59, 59, 999); break
        case 'week': periodEnd = new Date(period); periodEnd.setDate(periodEnd.getDate() + 6); periodEnd.setHours(23, 59, 59, 999); break
        case 'month': periodEnd = new Date(period.getFullYear(), period.getMonth() + 1, 0, 23, 59, 59, 999); break
        default: periodEnd = new Date(period); periodEnd.setHours(23, 59, 59, 999)
      }

      const periodEntries = filteredEntries.filter(e => {
        const entryDate = new Date(e.dateStart)
        return entryDate >= period && entryDate <= periodEnd
      })

      const totalHours = periodEntries.reduce((sum, e) => sum + e.hours, 0)
      const billableHours = periodEntries.filter(e => e.billableOption === 'Billable').reduce((sum, e) => sum + e.hours, 0)
      const withNotes = periodEntries.filter(e => e.notes && e.notes.trim().length > 0).length
      const notesPercent = periodEntries.length > 0 ? (withNotes / periodEntries.length) * 100 : 0

      // Service tickets
      const periodServiceTickets = filteredServiceTickets.filter(t => {
        if (!t.dateEntered) return false
        const entered = new Date(t.dateEntered)
        return entered >= period && entered <= periodEnd
      })
      const serviceOpened = periodServiceTickets.length
      const serviceClosed = periodServiceTickets.filter(t => t.closedFlag).length

      // Add Workstation Project Tickets to Service Stats
      // Workstation projects are NOT in filteredProjects, but we need their tickets
      // We can find them from projectTickets + isWorkstationProject(project)
      const workstationProjectIds = new Set(projects.filter(isWorkstationProject).map(p => p.id))
      const periodWorkstationTickets = projectTickets.filter(t => {
        if (!workstationProjectIds.has(t.projectId)) return false
        if (!t.dateEntered) return false
        const entered = new Date(t.dateEntered)
        return entered >= period && entered <= periodEnd
      })

      const workstationOpened = periodWorkstationTickets.length
      const workstationClosed = periodWorkstationTickets.filter(t => t.closedFlag).length

      const totalServiceOpened = serviceOpened + workstationOpened
      const totalServiceClosed = serviceClosed + workstationClosed

      // Project tickets (standard only, since filteredProjects excludes workstations)
      const periodProjectTickets = filteredProjectTickets.filter(t => {
        if (!t.dateEntered) return false
        const entered = new Date(t.dateEntered)
        return entered >= period && entered <= periodEnd
      })
      const projectOpened = periodProjectTickets.length
      const projectClosed = periodProjectTickets.filter(t => t.closedFlag).length

      return {
        date: format(period, formatStr),
        totalHours: Number(totalHours.toFixed(1)),
        billableHours: Number(billableHours.toFixed(1)),
        nonBillableHours: Number((totalHours - billableHours).toFixed(1)),
        notesPercent: Number(notesPercent.toFixed(0)),
        billablePercent: totalHours > 0 ? Number(((billableHours / totalHours) * 100).toFixed(0)) : 0,
        serviceOpened: totalServiceOpened, serviceClosed: totalServiceClosed,
        projectOpened, projectClosed,
        totalTickets: totalServiceOpened + projectOpened,
        totalClosed: totalServiceClosed + projectClosed,
      }
    })
  }, [filteredEntries, filteredServiceTickets, filteredProjectTickets, dateRange, granularity])

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalHours = filteredEntries.reduce((sum, e) => sum + e.hours, 0)
    const billableHours = filteredEntries.filter(e => e.billableOption === 'Billable').reduce((sum, e) => sum + e.hours, 0)
    const withNotes = filteredEntries.filter(e => e.notes && e.notes.trim().length > 0).length

    return {
      totalHours, billableHours,
      billablePercent: totalHours > 0 ? (billableHours / totalHours) * 100 : 0,
      entryCount: filteredEntries.length,
      notesPercent: filteredEntries.length > 0 ? (withNotes / filteredEntries.length) * 100 : 0,
      avgHoursPerDay: chartData.length > 0 ? totalHours / chartData.length : 0,
      serviceTickets: filteredServiceTickets.length,
      serviceClosed: filteredServiceTickets.filter(t => t.closedFlag).length,
      projectTickets: filteredProjectTickets.length,
      projectClosed: filteredProjectTickets.filter(t => t.closedFlag).length,
    }
  }, [filteredEntries, filteredServiceTickets, filteredProjectTickets, chartData])

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Trends</h2>
          <p className="text-gray-400">
            {selectedEngineer ? `Trend analysis for ${selectedEngineer.firstName} ${selectedEngineer.lastName}` : 'Trend analysis for all engineers'}
            {' • '}<span className="text-blue-400">{periodLabel}</span>
          </p>
        </div>
        <DataSourceFilter selected={dataSources} onChange={setDataSources} />
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-xs font-medium text-gray-400 mb-1">Total Hours</h3>
          <p className="text-2xl font-bold text-white">{summaryStats.totalHours.toFixed(1)}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-xs font-medium text-gray-400 mb-1">Billable %</h3>
          <p className="text-2xl font-bold text-green-400">{summaryStats.billablePercent.toFixed(0)}%</p>
        </div>
        {includesServiceDesk && (
          <>
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-xs font-medium text-gray-400 mb-1">Service Tickets</h3>
              <p className="text-2xl font-bold text-cyan-400">{summaryStats.serviceTickets}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-xs font-medium text-gray-400 mb-1">Service Closed</h3>
              <p className="text-2xl font-bold text-teal-400">{summaryStats.serviceClosed}</p>
            </div>
          </>
        )}
        {includesProjects && (
          <>
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-xs font-medium text-gray-400 mb-1">Project Tickets</h3>
              <p className="text-2xl font-bold text-purple-400">{summaryStats.projectTickets}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-xs font-medium text-gray-400 mb-1">Project Closed</h3>
              <p className="text-2xl font-bold text-violet-400">{summaryStats.projectClosed}</p>
            </div>
          </>
        )}
      </div>

      {/* Hours Over Time */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">Hours Over Time</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorBillable" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} /><stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorNonBillable" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} />
              <Legend />
              <Area type="monotone" dataKey="billableHours" name="Billable" stroke="#22c55e" fillOpacity={1} fill="url(#colorBillable)" stackId="1" />
              <Area type="monotone" dataKey="nonBillableHours" name="Non-Billable" stroke="#6366f1" fillOpacity={1} fill="url(#colorNonBillable)" stackId="1" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Ticket Volume Trends */}
      {(includesServiceDesk || includesProjects) && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">Ticket Volume Trends</h3>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Brush dataKey="date" height={30} stroke="#8884d8" fill="#1f2937" tickFormatter={() => ''} />
                {includesServiceDesk && (
                  <>
                    <Bar dataKey="serviceOpened" name="Service Opened" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="serviceClosed" name="Service Closed" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                  </>
                )}
                {includesProjects && (
                  <>
                    <Bar dataKey="projectOpened" name="Project Opened" fill="#a855f7" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="projectClosed" name="Project Closed" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Billable % and Notes Quality */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Billable % Trend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} formatter={(v: number) => [`${v}%`, 'Billable %']} />
                <Line type="monotone" dataKey="billablePercent" name="Billable %" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Notes Quality Trend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} formatter={(v: number) => [`${v}%`, 'With Notes']} />
                <Line type="monotone" dataKey="notesPercent" name="% with Notes" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
