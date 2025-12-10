import { useEffect, useMemo } from 'react'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useTicketsStore } from '@/stores/ticketsStore'
import { useProjectsStore } from '@/stores/projectsStore'
import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useTimePeriodStore } from '@/stores/timePeriodStore'
import DataSourceFilter, { useDataSources } from '@/components/DataSourceFilter'
import { format } from 'date-fns'

export default function Dashboard() {
  const { members, isLoading: membersLoading, fetchMembers } = useMembersStore()
  const { entries, isLoading: entriesLoading, fetchTimeEntries } = useTimeEntriesStore()
  const { serviceTickets, isLoadingService, fetchServiceBoardTickets, fetchBoards, getTicketStats } = useTicketsStore()
  const { projects, projectTickets, fetchProjects, fetchProjectTickets } = useProjectsStore()
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { getDateRange, getPeriodLabel } = useTimePeriodStore()
  
  const { dataSources, setDataSources, includesServiceDesk, includesProjects } = useDataSources()
  const dateRange = getDateRange()

  useEffect(() => {
    fetchMembers()
    fetchBoards()
    fetchServiceBoardTickets()
    fetchProjects()
    fetchProjectTickets()
  }, [])

  useEffect(() => {
    fetchTimeEntries({
      startDate: format(dateRange.start, 'yyyy-MM-dd'),
      endDate: format(dateRange.end, 'yyyy-MM-dd'),
    })
  }, [dateRange.start.getTime(), dateRange.end.getTime()])

  const selectedEngineer = selectedEngineerId 
    ? members.find(m => m.id === selectedEngineerId)
    : null

  // Filter entries based on selected engineer and date range
  const filteredEntries = useMemo(() => {
    let result = entries.filter(e => {
      const entryDate = new Date(e.dateStart)
      return entryDate >= dateRange.start && entryDate <= dateRange.end
    })
    
    if (selectedEngineerId !== null) {
      result = result.filter(entry => entry.memberId === selectedEngineerId)
    }
    return result
  }, [entries, selectedEngineerId, dateRange])

  // Filter service tickets based on date range and engineer
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
      result.filter(t => 
        t.owner?.toLowerCase() === selectedEngineer.identifier.toLowerCase() ||
        t.resources?.toLowerCase().includes(selectedEngineer.identifier.toLowerCase())
      ).forEach(t => ticketIds.add(t.id))
      result = result.filter(t => ticketIds.has(t.id))
    }

    return result
  }, [serviceTickets, selectedEngineer, filteredEntries, dateRange, includesServiceDesk])

  // Filter projects and project tickets
  const filteredProjects = useMemo(() => {
    if (!includesProjects) return []
    if (selectedEngineer) {
      return projects.filter(p => p.managerIdentifier?.toLowerCase() === selectedEngineer.identifier.toLowerCase())
    }
    return projects
  }, [projects, selectedEngineer, includesProjects])

  const filteredProjectTickets = useMemo(() => {
    if (!includesProjects) return []
    const projectIds = filteredProjects.map(p => p.id)
    return projectTickets.filter(t => {
      if (!t.dateEntered) return projectIds.includes(t.projectId)
      const entered = new Date(t.dateEntered)
      return entered >= dateRange.start && entered <= dateRange.end && projectIds.includes(t.projectId)
    })
  }, [projectTickets, filteredProjects, dateRange, includesProjects])

  // Calculate stats
  const ticketStats = useMemo(() => getTicketStats(filteredServiceTickets), [filteredServiceTickets, getTicketStats])
  
  const projectStats = useMemo(() => ({
    total: filteredProjects.length,
    open: filteredProjects.filter(p => !p.closedFlag).length,
    closed: filteredProjects.filter(p => p.closedFlag).length,
    ticketsTotal: filteredProjectTickets.length,
    ticketsClosed: filteredProjectTickets.filter(t => t.closedFlag).length,
  }), [filteredProjects, filteredProjectTickets])

  const filteredMembers = useMemo(() => {
    if (selectedEngineerId === null) return members
    return members.filter(member => member.id === selectedEngineerId)
  }, [members, selectedEngineerId])

  const membersWithHours = useMemo(() => {
    return filteredMembers.map(member => {
      const memberEntries = filteredEntries.filter(e => e.memberId === member.id)
      const totalHours = memberEntries.reduce((sum, e) => sum + e.hours, 0)
      return { ...member, totalHours }
    })
  }, [filteredMembers, filteredEntries])

  const totalHours = filteredEntries.reduce((sum, entry) => sum + entry.hours, 0)
  const billableHours = filteredEntries.filter(e => e.billableOption === 'Billable')
    .reduce((sum, entry) => sum + entry.hours, 0)

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Overview</h2>
          <p className="text-gray-400">
            {selectedEngineer 
              ? `Overview for ${selectedEngineer.firstName} ${selectedEngineer.lastName}`
              : 'Overview of all engineers'}
            {' • '}<span className="text-blue-400">{getPeriodLabel()}</span>
          </p>
        </div>
        <DataSourceFilter selected={dataSources} onChange={setDataSources} />
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
            <p className="text-3xl font-bold text-white">{projectStats.ticketsTotal}</p>
          </div>
          <div className="bg-gradient-to-br from-purple-600 to-violet-700 rounded-lg p-5">
            <h3 className="text-xs font-medium text-purple-100 mb-1">Tickets Closed</h3>
            <p className="text-3xl font-bold text-white">{projectStats.ticketsClosed}</p>
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
