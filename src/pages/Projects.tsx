import { useEffect, useMemo, useState } from 'react'
import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useTicketsStore } from '@/stores/ticketsStore'

export default function Projects() {
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { members } = useMembersStore()
  const { entries } = useTimeEntriesStore()
  const { tickets, boards, isLoading, fetchTickets, fetchBoards, getTicketStats } = useTicketsStore()
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const selectedEngineer = selectedEngineerId 
    ? members.find(m => m.id === selectedEngineerId)
    : null

  useEffect(() => {
    fetchTickets()
    fetchBoards()
  }, [fetchTickets, fetchBoards])

  // Get ticket IDs that the selected engineer worked on
  const engineerTicketIds = useMemo(() => {
    if (selectedEngineerId === null) return null
    return new Set(
      entries
        .filter(e => e.memberId === selectedEngineerId && e.ticketId)
        .map(e => e.ticketId)
    )
  }, [entries, selectedEngineerId])

  // Filter tickets based on engineer and status
  const filteredTickets = useMemo(() => {
    let result = tickets

    // Filter by engineer if selected
    if (engineerTicketIds !== null) {
      result = result.filter(t => engineerTicketIds.has(t.id))
    }

    // Filter by status
    if (statusFilter === 'open') {
      result = result.filter(t => !t.closedFlag)
    } else if (statusFilter === 'closed') {
      result = result.filter(t => t.closedFlag)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(t => 
        t.summary?.toLowerCase().includes(query) ||
        t.id.toString().includes(query)
      )
    }

    return result
  }, [tickets, engineerTicketIds, statusFilter, searchQuery])

  const stats = useMemo(() => getTicketStats(filteredTickets), [filteredTickets, getTicketStats])

  // Calculate hours per ticket
  const ticketHours = useMemo(() => {
    const hours: Record<number, number> = {}
    const relevantEntries = selectedEngineerId === null 
      ? entries 
      : entries.filter(e => e.memberId === selectedEngineerId)
    
    relevantEntries.forEach(entry => {
      if (entry.ticketId) {
        hours[entry.ticketId] = (hours[entry.ticketId] || 0) + entry.hours
      }
    })
    return hours
  }, [entries, selectedEngineerId])

  // Get board name by ID
  const getBoardName = (boardId: number) => {
    const board = boards.find(b => b.id === boardId)
    return board?.name || `Board ${boardId}`
  }

  // Format resolution time
  const formatResolutionTime = (hours?: number) => {
    if (!hours) return 'N/A'
    if (hours < 24) return `${hours.toFixed(1)}h`
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    return `${days}d ${remainingHours.toFixed(0)}h`
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">Projects & Tickets</h2>
        <p className="text-gray-400">
          {selectedEngineer 
            ? `Tickets worked on by ${selectedEngineer.firstName} ${selectedEngineer.lastName}`
            : 'All tickets across all engineers'}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Total Tickets</h3>
          <p className="text-3xl font-bold text-white">{stats.total}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Open</h3>
          <p className="text-3xl font-bold text-yellow-400">{stats.open}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Closed</h3>
          <p className="text-3xl font-bold text-green-400">{stats.closed}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Avg Resolution</h3>
          <p className="text-3xl font-bold text-blue-400">
            {formatResolutionTime(stats.avgResolutionTime)}
          </p>
        </div>
      </div>

      {/* Board Distribution */}
      {Object.keys(stats.byBoard).length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">Tickets by Board</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(stats.byBoard).map(([boardId, count]) => (
              <div key={boardId} className="bg-gray-700 rounded-lg p-4">
                <p className="text-sm text-gray-400 truncate">{getBoardName(Number(boardId))}</p>
                <p className="text-2xl font-bold text-white">{count}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Search
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ticket # or summary..."
              className="w-full bg-gray-700 text-white rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-gray-700 text-white rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tickets List */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Tickets ({filteredTickets.length})
        </h3>
        
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-400">Loading tickets...</p>
          </div>
        ) : filteredTickets.length === 0 ? (
          <p className="text-gray-400 text-center py-8">
            {searchQuery || statusFilter !== 'all' 
              ? 'No tickets match your filters'
              : 'No tickets found'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Ticket #</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Summary</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Board</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Hours</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Created</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Resolution</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.slice(0, 100).map((ticket) => (
                  <tr key={ticket.id} className="border-b border-gray-700 hover:bg-gray-750">
                    <td className="py-3 px-4">
                      <span className="font-mono text-blue-400">#{ticket.id}</span>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-white truncate max-w-md" title={ticket.summary}>
                        {ticket.summary || 'No summary'}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-400">
                        {getBoardName(ticket.boardId)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        ticket.closedFlag 
                          ? 'bg-green-600/20 text-green-400' 
                          : 'bg-yellow-600/20 text-yellow-400'
                      }`}>
                        {ticket.status || (ticket.closedFlag ? 'Closed' : 'Open')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-white font-medium">
                        {ticketHours[ticket.id]?.toFixed(1) || '0.0'}h
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-400">
                      {ticket.dateEntered 
                        ? new Date(ticket.dateEntered).toLocaleDateString()
                        : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-400">
                      {formatResolutionTime(ticket.resolutionTime)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredTickets.length > 100 && (
              <p className="text-center text-gray-400 py-4">
                Showing first 100 of {filteredTickets.length} tickets
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
