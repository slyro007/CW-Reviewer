import { useEffect, useMemo, useState } from 'react'
import { useSelectedEngineerStore, TEAM_DEFINITIONS } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'
import { useTicketsStore, SERVICE_BOARD_NAMES } from '@/stores/ticketsStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useTimePeriodStore } from '@/stores/timePeriodStore'
import TimePeriodSelector from '@/components/TimePeriodSelector'
import { differenceInHours } from 'date-fns'
import { api } from '@/lib/api'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

const STATUS_COLORS: Record<string, string> = {
  'New': '#3b82f6',
  'Open': '#3b82f6',
  'In Progress': '#f59e0b',
  'Scheduled': '#8b5cf6',
  'Remote': '#06b6d4',
  'Completed': '#22c55e',
  'Closed': '#22c55e',
  'On-Hold': '#ef4444',
  'Waiting - Client': '#f97316',
  'Waiting - 3rd Party': '#f97316',
  'Waiting Customer Response': '#f97316',
  'Resolved': '#10b981',
}

const BOARD_COLORS: Record<string, string> = {
  'Escalations(MS)': '#ef4444',
  'Helpdesk(MS)': '#3b82f6',
  'Helpdesk(TS)': '#8b5cf6',
  'Triage': '#f59e0b',
  'RMM-Continuum': '#06b6d4',
  'WL Internal': '#22c55e',
}

export default function ServiceTickets() {
  const { selectedEngineerId, selectedTeam } = useSelectedEngineerStore()
  const { members } = useMembersStore()
  const {
    serviceTickets, boards, serviceBoardIds,
    isLoadingService, error,
    fetchServiceBoardTickets, fetchBoards,
    getTicketStats, getServiceBoardName
  } = useTicketsStore()
  const { entries } = useTimeEntriesStore()
  const { getPeriodLabel, getDateRange } = useTimePeriodStore()

  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [boardFilter, setBoardFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  const periodLabel = getPeriodLabel()
  const dateRange = getDateRange()

  const selectedEngineer = selectedEngineerId
    ? members.find(m => m.id === selectedEngineerId)
    : null

  useEffect(() => {
    fetchBoards()
    fetchServiceBoardTickets()
  }, [])

  // Get unique statuses for filter
  const uniqueStatuses = useMemo(() => {
    const statuses = new Set(serviceTickets.map(t => t.status || 'Unknown'))
    return Array.from(statuses).sort()
  }, [serviceTickets])

  // Get tickets worked by selected engineer (based on time entries, owner, or resources)
  const engineerTicketIds = useMemo(() => {
    if (!selectedEngineerId || !selectedEngineer) return null
    const ticketIds = new Set<number>()

    // Add tickets with time entries
    entries
      .filter(e => e.memberId === selectedEngineerId && e.ticketId)
      .forEach(e => {
        if (e.ticketId) ticketIds.add(e.ticketId)
      })

    // Add tickets where engineer is owner
    serviceTickets
      .filter(t => t.owner && t.owner.toLowerCase() === selectedEngineer.identifier.toLowerCase())
      .forEach(t => ticketIds.add(t.id))

    // Add tickets where engineer is a resource/team member
    serviceTickets
      .filter(t => {
        if (!t.resources) return false
        const resourceIds = t.resources.split(',').map(r => r.trim().toLowerCase())
        return resourceIds.includes(selectedEngineer.identifier.toLowerCase())
      })
      .forEach(t => ticketIds.add(t.id))

    return ticketIds
  }, [entries, selectedEngineerId, selectedEngineer, serviceTickets])

  // Filter tickets
  const filteredTickets = useMemo(() => {
    let result = serviceTickets

    // Filter by selected engineer's tickets (owner, resources, OR time entries)
    if (selectedEngineer && engineerTicketIds) {
      result = result.filter(t => engineerTicketIds.has(t.id))
    } else if (selectedTeam !== 'All Company') {
      const teamIdentifiers = TEAM_DEFINITIONS[selectedTeam] || []

      // Get tickets where any team member has logged time
      const teamTimeTicketIds = new Set(
        entries
          .filter(e => {
            const entryMember = members.find(m => m.id === e.memberId)
            return entryMember && teamIdentifiers.includes(entryMember.identifier) && e.ticketId
          })
          .map(e => e.ticketId!)
      )

      result = result.filter(t => {
        const isOwnerInTeam = teamIdentifiers.some((id: string) => id.toLowerCase() === t.owner?.toLowerCase())
        const isResourceInTeam = t.resources && teamIdentifiers.some((id: string) => t.resources?.toLowerCase().includes(id.toLowerCase()))
        return isOwnerInTeam || isResourceInTeam || teamTimeTicketIds.has(t.id)
      })
    }

    // Filter by date range (dateEntered) - include full end day
    result = result.filter(t => {
      if (!t.dateEntered) return true
      const entered = new Date(t.dateEntered)
      const endOfDay = new Date(dateRange.end)
      endOfDay.setHours(23, 59, 59, 999)
      return entered >= dateRange.start && entered <= endOfDay
    })

    if (boardFilter !== 'all') {
      const boardId = parseInt(boardFilter)
      result = result.filter(t => t.boardId === boardId)
    }

    if (statusFilter !== 'all') {
      result = result.filter(t => t.status === statusFilter)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(t =>
        t.summary?.toLowerCase().includes(query) ||
        t.id.toString().includes(query) ||
        t.company?.toLowerCase().includes(query)
      )
    }

    return result
  }, [serviceTickets, selectedEngineer, engineerTicketIds, boardFilter, statusFilter, searchQuery, dateRange])

  // Calculate stats
  const stats = useMemo(() => getTicketStats(filteredTickets), [filteredTickets, getTicketStats])

  // Status distribution for pie chart
  const statusDistribution = useMemo(() => {
    const byStatus: Record<string, number> = {}
    filteredTickets.forEach(t => {
      const status = t.status || 'Unknown'
      byStatus[status] = (byStatus[status] || 0) + 1
    })
    return Object.entries(byStatus).map(([name, value]) => ({
      name,
      value,
      color: STATUS_COLORS[name] || '#6b7280',
    }))
  }, [filteredTickets])

  // Board distribution for bar chart
  const boardDistribution = useMemo(() => {
    const byBoard: Record<string, number> = {}
    filteredTickets.forEach(t => {
      const boardName = getServiceBoardName(t.boardId)
      byBoard[boardName] = (byBoard[boardName] || 0) + 1
    })
    return Object.entries(byBoard)
      .map(([name, value]) => ({
        name: name.replace('(MS)', '').replace('(TS)', '').trim(),
        fullName: name,
        value,
        color: BOARD_COLORS[name] || '#6b7280',
      }))
      .sort((a, b) => b.value - a.value)
  }, [filteredTickets, getServiceBoardName])

  // Calculate ticket age distribution
  const ageStats = useMemo(() => {
    const now = new Date()
    let under24h = 0
    let under48h = 0
    let under7d = 0
    let over7d = 0

    filteredTickets.filter(t => !t.closedFlag && t.dateEntered).forEach(t => {
      const hours = differenceInHours(now, new Date(t.dateEntered!))
      if (hours < 24) under24h++
      else if (hours < 48) under48h++
      else if (hours < 168) under7d++
      else over7d++
    })

    return { under24h, under48h, under7d, over7d }
  }, [filteredTickets])

  // Generate AI Analysis
  const generateAIAnalysis = async () => {
    setIsGeneratingAnalysis(true)
    setAnalysisError(null)

    try {
      const ticketData = {
        period: periodLabel,
        engineer: selectedEngineer ? `${selectedEngineer.firstName} ${selectedEngineer.lastName}` : 'All Engineers',
        totalTickets: filteredTickets.length,
        openTickets: stats.open,
        closedTickets: stats.closed,
        avgResolutionTime: stats.avgResolutionTime.toFixed(1),
        statusBreakdown: statusDistribution.map(s => `${s.name}: ${s.value}`).join(', '),
        boardBreakdown: boardDistribution.map(b => `${b.fullName}: ${b.value}`).join(', '),
        ageDistribution: `Under 24h: ${ageStats.under24h}, 24-48h: ${ageStats.under48h}, 2-7 days: ${ageStats.under7d}, Over 7 days: ${ageStats.over7d}`,
      }

      const prompt = `Analyze the following service desk ticket data for ${ticketData.engineer}:

Total Tickets: ${ticketData.totalTickets}
Open: ${ticketData.openTickets} | Closed: ${ticketData.closedTickets}
Average Resolution Time: ${ticketData.avgResolutionTime} hours

Status Distribution: ${ticketData.statusBreakdown}
Board Distribution: ${ticketData.boardBreakdown}
Ticket Age (Open): ${ticketData.ageDistribution}

Provide a comprehensive service desk analysis including:
1. Overall assessment of ticket handling efficiency
2. Observations about workload distribution across boards
3. Ticket aging analysis and SLA concerns
4. Recommendations for improving response times
5. Priority areas for attention

Keep the tone professional and actionable.`

      const response = await api.generateAnalysis('engineerAnalysis', {
        prompt,
        data: ticketData,
      })

      setAiAnalysis(response.analysis)
    } catch (error: any) {
      console.error('Error generating analysis:', error)
      setAnalysisError(error.message || 'Failed to generate analysis')
    } finally {
      setIsGeneratingAnalysis(false)
    }
  }

  // Get available service boards from the loaded boards
  const availableServiceBoards = useMemo(() => {
    return boards.filter(b => serviceBoardIds.includes(b.id))
  }, [boards, serviceBoardIds])

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Service Tickets</h2>
          <p className="text-gray-400">
            {selectedEngineer
              ? `Tickets worked by ${selectedEngineer.firstName} ${selectedEngineer.lastName}`
              : 'All service desk tickets'}
            {' • '}<span className="text-blue-400">{periodLabel}</span>
          </p>
          <p className="text-gray-500 text-sm mt-1">
            Boards: {SERVICE_BOARD_NAMES.join(' • ')}
          </p>
        </div>
        <TimePeriodSelector />
      </div>

      {error && (
        <div className="bg-red-600/20 border border-red-500 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5">
          <h3 className="text-xs font-medium text-blue-100 mb-1">Total Tickets</h3>
          <p className="text-3xl font-bold text-white">{stats.total}</p>
        </div>
        <div className="bg-gradient-to-br from-cyan-600 to-cyan-700 rounded-xl p-5">
          <h3 className="text-xs font-medium text-cyan-100 mb-1">Open</h3>
          <p className="text-3xl font-bold text-white">{stats.open}</p>
        </div>
        <div className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-xl p-5">
          <h3 className="text-xs font-medium text-green-100 mb-1">Closed</h3>
          <p className="text-3xl font-bold text-white">{stats.closed}</p>
        </div>
        <div className="bg-gradient-to-br from-yellow-600 to-amber-700 rounded-xl p-5">
          <h3 className="text-xs font-medium text-yellow-100 mb-1">Avg Resolution</h3>
          <p className="text-3xl font-bold text-white">{stats.avgResolutionTime.toFixed(0)}h</p>
        </div>
        <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-xl p-5">
          <h3 className="text-xs font-medium text-red-100 mb-1">Aging 7d+</h3>
          <p className="text-3xl font-bold text-white">{ageStats.over7d}</p>
        </div>
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5">
          <h3 className="text-xs font-medium text-blue-100 mb-1">Boards</h3>
          <p className="text-3xl font-bold text-white">{availableServiceBoards.length}</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Status Distribution */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Status Distribution</h3>
          {statusDistribution.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {statusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#fff'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              No data available
            </div>
          )}
        </div>

        {/* Board Distribution */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Tickets by Board</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={boardDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" stroke="#9ca3af" />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#9ca3af"
                  width={100}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  formatter={(value: number, _name: string, props: any) => [value, props.payload.fullName]}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Ticket Age Breakdown */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">Open Ticket Age</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-green-600/20 border border-green-600 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-green-400">{ageStats.under24h}</p>
            <p className="text-sm text-gray-400">Under 24h</p>
          </div>
          <div className="bg-yellow-600/20 border border-yellow-600 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-yellow-400">{ageStats.under48h}</p>
            <p className="text-sm text-gray-400">24-48 hours</p>
          </div>
          <div className="bg-orange-600/20 border border-orange-600 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-orange-400">{ageStats.under7d}</p>
            <p className="text-sm text-gray-400">2-7 days</p>
          </div>
          <div className="bg-red-600/20 border border-red-600 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-red-400">{ageStats.over7d}</p>
            <p className="text-sm text-gray-400">Over 7 days</p>
          </div>
        </div>
      </div>

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
              placeholder="Search by summary, ID, or company..."
              className="w-full bg-gray-700 text-white rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Board
            </label>
            <select
              value={boardFilter}
              onChange={(e) => setBoardFilter(e.target.value)}
              className="bg-gray-700 text-white rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="all">All Boards</option>
              {availableServiceBoards.map(board => (
                <option key={board.id} value={board.id}>{board.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-gray-700 text-white rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="all">All Statuses</option>
              {uniqueStatuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Tickets ({filteredTickets.length})
        </h3>

        {isLoadingService ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-400">Loading tickets...</p>
          </div>
        ) : filteredTickets.length === 0 ? (
          <p className="text-gray-400 text-center py-8">
            {searchQuery || statusFilter !== 'all' || boardFilter !== 'all'
              ? 'No tickets match your filters'
              : 'No tickets found'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">ID</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Summary</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Board</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Company</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Age</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.slice(0, 50).map((ticket) => {
                  const age = ticket.dateEntered
                    ? differenceInHours(new Date(), new Date(ticket.dateEntered))
                    : null
                  const ageText = age !== null
                    ? age < 24 ? `${age}h`
                      : age < 168 ? `${Math.floor(age / 24)}d`
                        : `${Math.floor(age / 168)}w`
                    : 'N/A'
                  const ageColor = age !== null
                    ? age < 24 ? 'text-green-400'
                      : age < 48 ? 'text-yellow-400'
                        : age < 168 ? 'text-orange-400'
                          : 'text-red-400'
                    : 'text-gray-400'

                  return (
                    <tr key={ticket.id} className="border-b border-gray-700 hover:bg-gray-750">
                      <td className="py-3 px-4">
                        <span className="text-gray-400 font-mono">#{ticket.id}</span>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-white truncate max-w-md" title={ticket.summary}>
                          {ticket.summary}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className="px-2 py-1 rounded text-xs font-medium"
                          style={{
                            backgroundColor: `${BOARD_COLORS[getServiceBoardName(ticket.boardId)] || '#6b7280'}20`,
                            color: BOARD_COLORS[getServiceBoardName(ticket.boardId)] || '#9ca3af'
                          }}
                        >
                          {getServiceBoardName(ticket.boardId)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className="px-2 py-1 rounded text-xs font-medium"
                          style={{
                            backgroundColor: `${STATUS_COLORS[ticket.status || ''] || '#6b7280'}20`,
                            color: STATUS_COLORS[ticket.status || ''] || '#9ca3af'
                          }}
                        >
                          {ticket.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-300">{ticket.company || 'N/A'}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`font-medium ${ticket.closedFlag ? 'text-gray-500' : ageColor}`}>
                          {ticket.closedFlag ? 'Closed' : ageText}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filteredTickets.length > 50 && (
              <p className="text-center text-gray-500 mt-4">
                Showing 50 of {filteredTickets.length} tickets
              </p>
            )}
          </div>
        )}
      </div>

      {/* AI Analysis */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-white">
            AI Service Desk Analysis
          </h3>
          <button
            onClick={generateAIAnalysis}
            disabled={isGeneratingAnalysis || filteredTickets.length === 0}
            className={`px-5 py-2.5 rounded-lg font-medium transition-all ${isGeneratingAnalysis || filteredTickets.length === 0
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl'
              }`}
          >
            {isGeneratingAnalysis ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                Analyzing...
              </span>
            ) : (
              'Generate Analysis'
            )}
          </button>
        </div>

        {analysisError && (
          <div className="bg-red-600/20 border border-red-500 rounded-lg p-4 mb-4">
            <p className="text-red-400">{analysisError}</p>
          </div>
        )}

        {aiAnalysis ? (
          <div className="bg-gradient-to-br from-gray-700 to-gray-750 rounded-lg p-6 border border-gray-600">
            <div className="whitespace-pre-wrap text-gray-200 leading-relaxed">
              {aiAnalysis}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-700/30 rounded-lg border border-dashed border-gray-600">
            <p className="text-gray-400 text-lg mb-2">
              Get AI-powered insights about service desk performance
            </p>
            <p className="text-gray-500 text-sm">
              Click "Generate Analysis" for workload and efficiency recommendations
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

