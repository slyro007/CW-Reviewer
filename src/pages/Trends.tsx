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
import ChartExplanation from '@/components/ChartExplanation'

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

  // Helper to get format string based on granularity
  const formatStr = useMemo(() => {
    switch (granularity) {
      case 'day': return 'MMM d'
      case 'week': return 'MMM d'
      case 'month': return 'MMM yyyy'
      default: return 'MMM d'
    }
  }, [granularity])

  // Generate chart data
  const chartData = useMemo(() => {
    let periods: Date[]
    // reused formatStr via closure

    switch (granularity) {
      case 'day': periods = eachDayOfInterval(dateRange); break
      case 'week': periods = eachWeekOfInterval(dateRange); break
      case 'month': periods = eachMonthOfInterval(dateRange); break
      default: periods = eachDayOfInterval(dateRange)
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
        const inPeriod = entryDate >= period && entryDate <= periodEnd
        if (!inPeriod) return false

        // Filter by Data Source
        // If entry has ticketId, it's Service (usually). If projectId, it's Project.
        // Some entries might be purely internal (no ticket/project) - we tend to treat those as 'Service' or 'Other' depending on intent.
        // For now, strict:
        // if !includesServiceDesk, exclude if it HAS a ticketId OR is internal (no project)? 
        // Let's assume:
        // Project Work = has projectId
        // Service Work = has ticketId (or no project and no ticket? - "General Admin")

        // Actually, logic is simpler:
        // if it matches a project, mapped to project.
        // if it matches a ticket, mapped to service.

        let isProject = !!e.projectId
        let isService = !!e.ticketId
        // Refined: Workstation projects behave like service? existing logic handles that in ticket counts, but for hours:
        // If it's a workstation project, is it Project or Service hour?
        // Usually Project hours unless explicitly re-mapped. Use standard 'projectId' check.

        if (includesProjects && isProject) return true
        if (includesServiceDesk && isService) return true
        // If specific logic for "Internal/Standard" entries without IDs:
        if (includesServiceDesk && !isProject && !isService) return true

        return false
      })

      const totalHours = periodEntries.reduce((sum, e) => sum + e.hours, 0)
      const billableHours = periodEntries.filter(e => e.billableOption === 'Billable').reduce((sum, e) => sum + e.hours, 0)
      const withNotes = periodEntries.filter(e => e.notes && e.notes.trim().length > 0).length
      const notesPercent = periodEntries.length > 0 ? (withNotes / periodEntries.length) * 100 : 0

      // Calculate hours by engineer for this period
      const hoursByEngineer: Record<string, number> = {}
      periodEntries.forEach(e => {
        const member = members.find(m => m.id === e.memberId)
        if (member) {
          let name = member.firstName || member.identifier || 'Unknown'
          // specific overrides
          if (member.identifier.toLowerCase() === 'dsolomon') name = 'Danny Solomon'
          if (member.identifier.toLowerCase() === 'dcooper') name = 'Daniel Cooper'
          // Use full name if plain "Daniel" to avoid collision if necessary, but the override handles the specific request
          if (name === 'Daniel' && member.lastName) name = `Daniel ${member.lastName}`

          hoursByEngineer[name] = (hoursByEngineer[name] || 0) + e.hours
        }
      })

      // Service tickets - CORRECTED LOGIC
      // Opened: dateEntered is in period
      const serviceOpened = filteredServiceTickets.filter(t => {
        if (!t.dateEntered) return false
        const entered = new Date(t.dateEntered)
        return entered >= period && entered <= periodEnd
      }).length

      // Closed: closedDate is in period
      const serviceClosed = filteredServiceTickets.filter(t => {
        if (!t.closedFlag || !t.closedDate) return false
        const closed = new Date(t.closedDate)
        return closed >= period && closed <= periodEnd
      }).length

      // Workstation Project Tickets (treated as Service)
      const workstationProjectIds = new Set(projects.filter(isWorkstationProject).map(p => p.id))
      const workstationTickets = projectTickets.filter(t => workstationProjectIds.has(t.projectId))

      const workstationOpened = workstationTickets.filter(t => {
        if (!t.dateEntered) return false
        const entered = new Date(t.dateEntered)
        return entered >= period && entered <= periodEnd
      }).length

      const workstationClosed = workstationTickets.filter(t => {
        if (!t.closedFlag || !t.closedDate) return false
        const closed = new Date(t.closedDate)
        return closed >= period && closed <= periodEnd
      }).length

      const totalServiceOpened = serviceOpened + workstationOpened
      const totalServiceClosed = serviceClosed + workstationClosed

      // Resolution time (avg hours for tickets closed in this period)
      const closedInPeriod = filteredServiceTickets.filter(t => {
        if (!t.closedFlag || !t.closedDate) return false
        const closed = new Date(t.closedDate)
        return closed >= period && closed <= periodEnd
      })

      const avgResolution = closedInPeriod.length > 0
        ? closedInPeriod.reduce((sum, t) => sum + (t.resolutionTime || 0), 0) / closedInPeriod.length
        : 0

      // Project tickets (standard only)
      const projectOpened = filteredProjectTickets.filter(t => {
        if (!t.dateEntered) return false
        const entered = new Date(t.dateEntered)
        return entered >= period && entered <= periodEnd
      }).length

      const projectClosed = filteredProjectTickets.filter(t => {
        if (!t.closedFlag || !t.closedDate) return false
        const closed = new Date(t.closedDate)
        return closed >= period && closed <= periodEnd
      }).length

      // Projects (Entities)
      const projectsStarted = filteredProjects.filter(p => {
        const start = p.actualStart || p.estimatedStart
        if (!start) return false
        return start >= period && start <= periodEnd
      }).length

      const projectsCompleted = filteredProjects.filter(p => {
        const end = p.auditClosedDate || p.actualEnd || (p.closedFlag ? p.estimatedEnd : undefined)
        if (!end) return false
        return end >= period && end <= periodEnd
      }).length

      return {
        date: format(period, formatStr),
        totalHours: Number(totalHours.toFixed(1)),
        billableHours: Number(billableHours.toFixed(1)),
        nonBillableHours: Number((totalHours - billableHours).toFixed(1)),
        notesPercent: Number(notesPercent.toFixed(0)),
        billablePercent: totalHours > 0 ? Number(((billableHours / totalHours) * 100).toFixed(0)) : 0,
        serviceOpened: totalServiceOpened, serviceClosed: totalServiceClosed,
        projectOpened, projectClosed,
        projectsStarted, projectsCompleted,
        avgResolution: Number(avgResolution.toFixed(1)),
        totalTickets: totalServiceOpened + projectOpened,
        totalClosed: totalServiceClosed + projectClosed,
        ...hoursByEngineer // Spread engineer hours for stacked chart
      }
    })
  }, [filteredEntries, filteredServiceTickets, filteredProjectTickets, projects, projectTickets, dateRange, granularity, members])

  // Prepare Engineer Stack specific keys
  const engineerKeys = useMemo(() => {
    // Collect all unique engineer names from chartData
    const keys = new Set<string>()
    chartData.forEach(d => {
      Object.keys(d).forEach(k => {
        if (k !== 'totalHours' && typeof (d as any)[k] === 'number' && !['billableHours', 'nonBillableHours', 'notesPercent', 'billablePercent', 'serviceOpened', 'serviceClosed', 'projectOpened', 'projectClosed', 'projectsStarted', 'projectsCompleted', 'avgResolution', 'totalTickets', 'totalClosed'].includes(k)) {
          keys.add(k)
        }
      })
    })
    return Array.from(keys)
  }, [chartData])


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
        <ChartExplanation
          title="Hours Trend"
          description="Visualizes the total hours logged over time, split by Billable vs. Non-Billable. Helps track productivity and billing efficiency."
          axisDetails={[
            { label: "Y-Axis", description: "Total Hours" },
            { label: "X-Axis", description: "Time Period (Day/Week/Month)" }
          ]}
        />
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
          <ChartExplanation
            title="Ticket Flow"
            description="Tracks the volume of NEW vs CLOSED tickets. This includes both Service Desk tickets and individual Project Tasks/Tickets. Use this to spot accumulation (Opened > Closed)."
            axisDetails={[
              { label: "Y-Axis", description: "Number of Tickets" },
              { label: "Bars", description: "Opened (Left) vs Closed (Right)" }
            ]}
          />
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }}
                  cursor={{ fill: 'rgba(55, 65, 81, 0.4)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Brush
                  dataKey="date"
                  height={30}
                  stroke="#4b5563"
                  fill="#111827"
                  tickFormatter={() => ''}
                  travellerWidth={10}
                />
                {includesServiceDesk && (
                  <>
                    <Bar dataKey="serviceOpened" name="Service Opened" fill="#06b6d4" radius={[4, 4, 0, 0]} stackId="a" />
                    <Bar dataKey="serviceClosed" name="Service Closed" fill="#14b8a6" radius={[4, 4, 0, 0]} stackId="b" />
                  </>
                )}
                {includesProjects && (
                  <>
                    <Bar dataKey="projectOpened" name="Project Tickets Opened" fill="#a855f7" radius={[4, 4, 0, 0]} stackId="a" />
                    <Bar dataKey="projectClosed" name="Project Tickets Closed" fill="#8b5cf6" radius={[4, 4, 0, 0]} stackId="b" />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* NEW: Project Entity Volume */}
      {includesProjects && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">Project Completions</h3>
          <ChartExplanation
            title="Project Throughput"
            description="Tracks ACTUAL Project entities (not tickets). Shows how many full projects started vs finished."
            axisDetails={[{ label: "Y-Axis", description: "Count of Projects" }]}
          />
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }}
                  cursor={{ fill: 'rgba(55, 65, 81, 0.4)' }}
                />
                <Legend iconType="circle" />
                <Brush
                  dataKey="date"
                  height={20}
                  stroke="#4b5563"
                  fill="#111827"
                  tickFormatter={() => ''}
                  travellerWidth={10}
                />
                <Bar dataKey="projectsStarted" name="Projects Started" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="projectsCompleted" name="Projects Completed" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* NEW: Comparison Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Workload Distribution */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Workload Distribution</h3>
          <ChartExplanation
            title="Team Workload"
            description="Shows how total hours are distributed across the team. Each colored band represents an engineer's contribution."
            axisDetails={[{ label: "Y-Axis", description: "Hours Logged" }]}
          />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
                  itemStyle={{ color: '#d1d5db' }}
                  labelFormatter={(label) => format(new Date(label), formatStr)}
                  formatter={(value: number, name: string) => [
                    value.toFixed(1),
                    name
                  ]}
                />
                <Legend />
                {engineerKeys.length > 0 ? (
                  engineerKeys.map((key, index) => (
                    <Area
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={key}
                      stroke={`hsl(${index * 40}, 70%, 60%)`}
                      fill={`hsl(${index * 40}, 70%, 60%)`}
                      fillOpacity={0.6}
                      stackId="1"
                    />
                  ))
                ) : (
                  <Area type="monotone" dataKey="totalHours" name="Total Hours" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Avg Resolution Time</h3>
          <ChartExplanation
            title="Resolution Speed"
            description="Tracks the average time (Calendar Hours) from creation to closure for tickets closed in this period. Large spikes often indicate cleanup of old tickets."
            axisDetails={[{ label: "Y-Axis", description: "Avg. Hours to Close" }]}
          />
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#9ca3af"
                  tick={{ fill: '#9ca3af' }}
                  tickMargin={10}
                  minTickGap={30}
                />
                <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
                  itemStyle={{ color: '#d1d5db' }}
                  labelFormatter={(label) => format(new Date(label), formatStr)}
                  formatter={(value: number) => [`${value.toFixed(1)}h`, 'Avg Time']}
                />      <Line type="monotone" dataKey="avgResolution" name="Avg Hours" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-500 mt-2 text-center">Avg duration of tickets closed on that day</p>
        </div>
      </div>

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
