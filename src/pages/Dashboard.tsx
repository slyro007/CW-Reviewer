import { useEffect, useMemo, useState } from 'react'
import DataSourceFilter, { type DataSource } from '@/components/DataSourceFilter'
import { useMembersStore } from '@/stores/membersStore'
import { useTicketsStore } from '@/stores/ticketsStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useProjectsStore } from '@/stores/projectsStore'
import { useTimePeriodStore } from '@/stores/timePeriodStore'
import { useSelectedEngineerStore, TEAM_DEFINITIONS } from '@/stores/selectedEngineerStore'

export default function Dashboard() {
  const { members, isLoading: membersLoading, fetchMembers } = useMembersStore()
  const { selectedEngineerId, selectedTeam } = useSelectedEngineerStore()

  const {
    entries,
    isLoading: entriesLoading,
    fetchTimeEntries,
    syncTimeEntries
  } = useTimeEntriesStore()

  const {
    serviceTickets,
    isLoadingService,
    fetchServiceBoardTickets,
    syncServiceTickets,
    getTicketStats
  } = useTicketsStore()

  const {
    projects,
    projectTickets,
    fetchProjects,
    fetchProjectTickets,
    syncProjects,
    syncProjectTickets,
    getProjectStats,
    getProjectTicketStats
  } = useProjectsStore()

  const { getDateRange, getPeriodLabel } = useTimePeriodStore()
  // selectedEngineerId already destructured above

  // Local state for toggles
  const [dataSources, setDataSources] = useState<DataSource[]>(['serviceDesk', 'projects'])
  const includesServiceDesk = dataSources.includes('serviceDesk')
  const includesProjects = dataSources.includes('projects')

  // Load Initial Data (Once)
  useEffect(() => {
    const loadAllData = async () => {
      // Parallel fetch for speed
      await Promise.all([
        fetchMembers(),
        fetchTimeEntries(), // Fetch ALL time entries (5 years)
        fetchServiceBoardTickets(),
        fetchProjects(),
        fetchProjectTickets() // Fetch ALL project tickets
      ])
    }

    loadAllData()

    // Setup 15-minute polling
    const intervalId = setInterval(() => {
      console.log('[Dashboard] Polling for updates...')
      syncTimeEntries()
      syncServiceTickets()
      syncProjects()
      syncProjectTickets()
    }, 15 * 60 * 1000)

    return () => clearInterval(intervalId)
  }, []) // Empty dependency array = persistent data, no re-fetching on filter change

  // Filtering Logic
  const dateRange = getDateRange() // { start, end }

  // Filter Time Entries (by Date & Engineer)
  const filteredEntries = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return []

    return entries.filter(e => {
      // 1. Date Filter
      const d = new Date(e.dateStart)
      const inDateRange = d >= dateRange.start! && d <= dateRange.end!
      if (!inDateRange) return false

      // 2. Team Filter
      if (selectedTeam !== 'All Company') {
        const teamMembers = TEAM_DEFINITIONS[selectedTeam]
        // Find member to check identifier
        const member = members.find(m => m.id === e.memberId)
        if (!member || !teamMembers?.includes(member.identifier.toLowerCase())) return false
      }

      // 3. Engineer Filter
      if (selectedEngineerId && e.memberId !== selectedEngineerId) return false

      return true
    }).sort((a, b) => new Date(b.dateStart).getTime() - new Date(a.dateStart).getTime())
  }, [entries, dateRange, selectedEngineerId, selectedTeam, members])

  // Filter Service Tickets
  const filteredServiceTickets = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return serviceTickets

    return serviceTickets.filter(t => {
      // Team Filter
      if (selectedTeam !== 'All Company') {
        const teamMembers = TEAM_DEFINITIONS[selectedTeam] || []
        const isOwnerInTeam = teamMembers.some(id => id.toLowerCase() === t.owner?.toLowerCase())
        const isResourceInTeam = t.resources && teamMembers.some(id => t.resources?.toLowerCase().includes(id.toLowerCase()))
        if (!isOwnerInTeam && !isResourceInTeam) return false
      }

      // Engineer Filter
      if (selectedEngineerId) {
        const member = members.find(m => m.id === selectedEngineerId)
        if (member) {
          const isOwner = t.owner === member.identifier
          const isResource = t.resources?.includes(member.identifier)
          if (!isOwner && !isResource) return false
        }
      }

      // Date Filter (Closed in range or Open)
      if (t.closedFlag) {
        if (!t.closedDate) return false
        const closedAt = new Date(t.closedDate)
        return closedAt >= dateRange.start! && closedAt <= dateRange.end!
      }
      return true
    })
  }, [serviceTickets, dateRange, selectedEngineerId, selectedTeam, members])

  // Filter Projects
  const filteredProjects = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return projects

    return projects.filter(p => {
      // Team Filter
      if (selectedTeam !== 'All Company') {
        const teamMembers = TEAM_DEFINITIONS[selectedTeam] || []
        if (p.managerIdentifier && !teamMembers.includes(p.managerIdentifier.toLowerCase())) return false
      }

      // Engineer Filter (Manager)
      if (selectedEngineerId) {
        const member = members.find(m => m.id === selectedEngineerId)
        if (member && p.managerIdentifier?.toLowerCase() !== member.identifier.toLowerCase()) {
          return false
        }
      }
      return true
    })
  }, [projects, selectedEngineerId, selectedTeam, members, dateRange])

  // Filter Project Tickets
  const filteredProjectTickets = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return projectTickets

    return projectTickets.filter(t => {
      // Team Filter
      if (selectedTeam !== 'All Company') {
        const teamMembers = TEAM_DEFINITIONS[selectedTeam] || []
        const isResourceInTeam = t.resources && teamMembers.some(id => t.resources?.toLowerCase().includes(id.toLowerCase()))
        if (!isResourceInTeam) return false
      }

      // Engineer Filter (Resources)
      if (selectedEngineerId) {
        const member = members.find(m => m.id === selectedEngineerId)
        if (member) {
          const isResource = t.resources?.toLowerCase().includes(member.identifier.toLowerCase())
          if (!isResource) return false
        }
      }

      // Date Filter
      if (t.closedFlag) {
        if (!t.closedDate) return false
        const closedAt = new Date(t.closedDate)
        return closedAt >= dateRange.start! && closedAt <= dateRange.end!
      }
      return true
    })
  }, [projectTickets, selectedEngineerId, selectedTeam, members, dateRange])


  // Calculate Stats
  const ticketStats = useMemo(() => getTicketStats(filteredServiceTickets), [filteredServiceTickets, getTicketStats])

  const projectStats = useMemo(() => getProjectStats(filteredProjects), [filteredProjects, getProjectStats])

  const projectTicketStats = useMemo(() => {
    // Use helper or derived locally
    return getProjectTicketStats(filteredProjectTickets)
  }, [filteredProjectTickets, getProjectTicketStats])

  // Manual calculation for Project Tickets Closed (since helper returns statuses, not "closed" boolean count specifically)
  // Actually helper likely maps statuses. But we can use loop for safety or check closedFlag.
  const projectTicketsClosedCount = useMemo(() =>
    filteredProjectTickets.filter(t => t.closedFlag).length
    , [filteredProjectTickets])


  // Aggregate Member Stats
  const membersWithHours = useMemo(() => {
    return members.map(m => {
      const memberEntries = filteredEntries.filter(e => e.memberId === m.id)
      const total = memberEntries.reduce((sum, e) => sum + e.hours, 0)
      return { ...m, totalHours: total }
    })
      .filter(m => {
        if (selectedEngineerId && m.id !== selectedEngineerId) return false
        if (m.totalHours === 0 && !selectedEngineerId) return false
        return m.totalHours > 0 || (selectedEngineerId ? m.id === selectedEngineerId : false)
      })
      .sort((a, b) => b.totalHours - a.totalHours)
  }, [members, filteredEntries, selectedEngineerId])

  const filteredMembers = membersWithHours

  const totalHours = useMemo(() => filteredEntries.reduce((sum, e) => sum + e.hours, 0), [filteredEntries])
  const billableHours = useMemo(() => filteredEntries.reduce((sum, e) => e.billableOption === 'Billable' ? sum + e.hours : sum, 0), [filteredEntries])

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Overview</h2>
          <p className="text-gray-400">
            Performance metrics and KPI tracking
            {' • '}<span className="text-blue-400">{getPeriodLabel()}</span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
          <DataSourceFilter selected={dataSources} onChange={setDataSources} className="sm:self-end" />
        </div>
      </div>

      {/* Time Entry Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-5">
          <h3 className="text-xs font-medium text-gray-400 mb-1">Engineers</h3>
          <p className="text-3xl font-bold text-white">{membersLoading ? '...' : filteredMembers.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-5">
          <h3 className="text-xs font-medium text-gray-400 mb-1">Total Hours</h3>
          <p className="text-3xl font-bold text-white">{entriesLoading ? '...' : totalHours.toFixed(1)}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-5">
          <h3 className="text-xs font-medium text-gray-400 mb-1">Billable Hours</h3>
          <p className="text-3xl font-bold text-green-400">{entriesLoading ? '...' : billableHours.toFixed(1)}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-5">
          <h3 className="text-xs font-medium text-gray-400 mb-1">Time Entries</h3>
          <p className="text-3xl font-bold text-white">{entriesLoading ? '...' : filteredEntries.length}</p>
        </div>
      </div>

      {/* Service Desk Stats */}
      {includesServiceDesk && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-cyan-600 to-cyan-700 rounded-lg p-5">
            <h3 className="text-xs font-medium text-cyan-100 mb-1">Service Tickets</h3>
            <p className="text-3xl font-bold text-white">{isLoadingService ? '...' : ticketStats.total}</p>
          </div>
          <div className="bg-gradient-to-br from-cyan-700 to-cyan-800 rounded-lg p-5">
            <h3 className="text-xs font-medium text-cyan-100 mb-1">Open Tickets</h3>
            <p className="text-3xl font-bold text-white">{isLoadingService ? '...' : ticketStats.open}</p>
          </div>
          <div className="bg-gradient-to-br from-teal-600 to-teal-700 rounded-lg p-5">
            <h3 className="text-xs font-medium text-teal-100 mb-1">Closed Tickets</h3>
            <p className="text-3xl font-bold text-white">{isLoadingService ? '...' : ticketStats.closed}</p>
          </div>
          <div className="bg-gradient-to-br from-cyan-600 to-teal-700 rounded-lg p-5">
            <h3 className="text-xs font-medium text-cyan-100 mb-1">Avg Resolution</h3>
            <p className="text-3xl font-bold text-white">{isLoadingService ? '...' : `${ticketStats.avgResolutionTime.toFixed(0)}h`}</p>
          </div>
        </div>
      )}

      {/* Project Stats */}
      {includesProjects && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-lg p-5">
            <h3 className="text-xs font-medium text-purple-100 mb-1">Projects</h3>
            <p className="text-3xl font-bold text-white">{projectStats.total}</p>
          </div>
          <div className="bg-gradient-to-br from-purple-700 to-purple-800 rounded-lg p-5">
            <h3 className="text-xs font-medium text-purple-100 mb-1">Active Projects</h3>
            <p className="text-3xl font-bold text-white">{projectStats.open}</p>
          </div>
          <div className="bg-gradient-to-br from-violet-600 to-violet-700 rounded-lg p-5">
            <h3 className="text-xs font-medium text-violet-100 mb-1">Project Tickets</h3>
            <p className="text-3xl font-bold text-white">{projectTicketStats.total}</p>
          </div>
          <div className="bg-gradient-to-br from-purple-600 to-violet-700 rounded-lg p-5">
            <h3 className="text-xs font-medium text-purple-100 mb-1">Tickets Closed</h3>
            <p className="text-3xl font-bold text-white">{projectTicketsClosedCount}</p>
          </div>
        </div>
      )}

      {/* Engineers Overview */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h3 className="text-xl font-semibold mb-4">Engineers Overview</h3>
        <div className="space-y-2">
          {membersLoading ? (
            <p className="text-gray-400">Loading engineers...</p>
          ) : membersWithHours.length === 0 ? (
            <p className="text-gray-400">No engineers found</p>
          ) : (
            membersWithHours.map((member) => (
              <div key={member.id} className="bg-gray-700 rounded p-4 flex justify-between items-center">
                <div>
                  <p className="font-medium">{member.firstName} {member.lastName}</p>
                  <p className="text-sm text-gray-400">{member.identifier}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-white">{member.totalHours.toFixed(1)}h</p>
                  <p className="text-xs text-gray-400">{getPeriodLabel()}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent Items - Service Tickets or Project Tickets based on filter */}
      {includesServiceDesk && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
            Recent Service Tickets
          </h3>
          {isLoadingService ? (
            <p className="text-gray-400">Loading tickets...</p>
          ) : filteredServiceTickets.length === 0 ? (
            <p className="text-gray-400">No service tickets found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 px-4 text-gray-400 text-sm">ID</th>
                    <th className="text-left py-2 px-4 text-gray-400 text-sm">Summary</th>
                    <th className="text-left py-2 px-4 text-gray-400 text-sm">Status</th>
                    <th className="text-left py-2 px-4 text-gray-400 text-sm">Company</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredServiceTickets.slice(0, 5).map((ticket) => (
                    <tr key={ticket.id} className="border-b border-gray-700">
                      <td className="py-2 px-4 text-gray-400 font-mono text-sm">#{ticket.id}</td>
                      <td className="py-2 px-4 text-white text-sm truncate max-w-xs">{ticket.summary}</td>
                      <td className="py-2 px-4">
                        <span className={`px-2 py-1 rounded text-xs ${ticket.closedFlag ? 'bg-green-600/20 text-green-400' : 'bg-cyan-600/20 text-cyan-400'}`}>
                          {ticket.status || (ticket.closedFlag ? 'Closed' : 'Open')}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-sm text-gray-300">{ticket.company || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {includesProjects && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
            Recent Projects
          </h3>
          {filteredProjects.length === 0 ? (
            <p className="text-gray-400">No projects found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 px-4 text-gray-400 text-sm">Project</th>
                    <th className="text-left py-2 px-4 text-gray-400 text-sm">Client</th>
                    <th className="text-left py-2 px-4 text-gray-400 text-sm">Status</th>
                    <th className="text-left py-2 px-4 text-gray-400 text-sm">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.slice(0, 5).map((project) => (
                    <tr key={project.id} className="border-b border-gray-700">
                      <td className="py-2 px-4 text-white text-sm truncate max-w-xs">{project.name}</td>
                      <td className="py-2 px-4 text-sm text-gray-300">{project.company || 'N/A'}</td>
                      <td className="py-2 px-4">
                        <span className={`px-2 py-1 rounded text-xs ${project.closedFlag ? 'bg-green-600/20 text-green-400' : 'bg-purple-600/20 text-purple-400'}`}>
                          {project.status || (project.closedFlag ? 'Closed' : 'Open')}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-sm text-gray-300">{project.percentComplete?.toFixed(0) || 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Recent Time Entries */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-semibold mb-4">Recent Time Entries</h3>
        {entriesLoading ? (
          <p className="text-gray-400">Loading time entries...</p>
        ) : filteredEntries.length === 0 ? (
          <p className="text-gray-400">No time entries found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 px-4 text-gray-400 text-sm">Date</th>
                  {selectedEngineerId === null && <th className="text-left py-2 px-4 text-gray-400 text-sm">Engineer</th>}
                  <th className="text-left py-2 px-4 text-gray-400 text-sm">Hours</th>
                  <th className="text-left py-2 px-4 text-gray-400 text-sm">Billable</th>
                  <th className="text-left py-2 px-4 text-gray-400 text-sm">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.slice(0, 10).map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-700">
                    <td className="py-2 px-4 text-sm">{new Date(entry.dateStart).toLocaleDateString()}</td>
                    {selectedEngineerId === null && (
                      <td className="py-2 px-4 text-sm">{members.find(m => m.id === entry.memberId)?.firstName || 'Unknown'}</td>
                    )}
                    <td className="py-2 px-4 text-sm">{entry.hours}</td>
                    <td className="py-2 px-4">
                      <span className={`px-2 py-1 rounded text-xs ${entry.billableOption === 'Billable' ? 'bg-green-600/20 text-green-400' : 'bg-gray-600/20 text-gray-400'}`}>
                        {entry.billableOption || 'N/A'}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-sm text-gray-400 truncate max-w-xs">
                      {entry.notes ? (entry.notes.length > 50 ? entry.notes.substring(0, 50) + '...' : entry.notes) : 'No notes'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
