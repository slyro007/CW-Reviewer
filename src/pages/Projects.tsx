import { useEffect, useMemo, useState } from 'react'
import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useTicketsStore } from '@/stores/ticketsStore'
import { useTimePeriodStore } from '@/stores/timePeriodStore'
import { format } from 'date-fns'
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
  'In Progress': '#f59e0b',
  'Scheduled': '#8b5cf6',
  'Waiting': '#6b7280',
  'Completed': '#22c55e',
  'Closed': '#10b981',
  'On Hold': '#ef4444',
}

export default function Projects() {
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { members } = useMembersStore()
  const { entries, fetchTimeEntries } = useTimeEntriesStore()
  const { tickets, isLoading, fetchProjectBoardTickets, getTicketStats } = useTicketsStore()
  const { getDateRange, getPeriodLabel } = useTimePeriodStore()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  const dateRange = getDateRange()
  const periodLabel = getPeriodLabel()

  const selectedEngineer = selectedEngineerId 
    ? members.find(m => m.id === selectedEngineerId)
    : null

  useEffect(() => {
    fetchProjectBoardTickets()
    fetchTimeEntries({
      startDate: format(dateRange.start, 'yyyy-MM-dd'),
      endDate: format(dateRange.end, 'yyyy-MM-dd'),
    })
  }, [dateRange.start.getTime(), dateRange.end.getTime()])

  // Filter entries by date range
  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      const entryDate = new Date(e.dateStart)
      return entryDate >= dateRange.start && entryDate <= dateRange.end
    })
  }, [entries, dateRange])

  // Get ticket IDs that the selected engineer worked on
  const engineerTicketIds = useMemo(() => {
    if (selectedEngineerId === null) return null
    return new Set(
      filteredEntries
        .filter(e => e.memberId === selectedEngineerId && e.ticketId)
        .map(e => e.ticketId)
    )
  }, [filteredEntries, selectedEngineerId])

  // Get unique statuses for filter
  const uniqueStatuses = useMemo(() => {
    const statuses = new Set(tickets.map(t => t.status || 'Unknown'))
    return Array.from(statuses).sort()
  }, [tickets])

  // Filter tickets based on engineer, status, and search
  const filteredTickets = useMemo(() => {
    let result = tickets

    if (engineerTicketIds !== null) {
      result = result.filter(t => engineerTicketIds.has(t.id))
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
  }, [tickets, engineerTicketIds, statusFilter, searchQuery])

  const stats = useMemo(() => getTicketStats(filteredTickets), [filteredTickets, getTicketStats])

  // Calculate hours per ticket
  const ticketHours = useMemo(() => {
    const hours: Record<number, number> = {}
    const relevantEntries = selectedEngineerId === null 
      ? filteredEntries 
      : filteredEntries.filter(e => e.memberId === selectedEngineerId)
    
    relevantEntries.forEach(entry => {
      if (entry.ticketId) {
        hours[entry.ticketId] = (hours[entry.ticketId] || 0) + entry.hours
      }
    })
    return hours
  }, [filteredEntries, selectedEngineerId])

  // Calculate status distribution
  const statusDistribution = useMemo(() => {
    const dist: Record<string, number> = {}
    filteredTickets.forEach(t => {
      const status = t.status || 'Unknown'
      dist[status] = (dist[status] || 0) + 1
    })
    return Object.entries(dist).map(([name, value]) => ({
      name,
      value,
      color: STATUS_COLORS[name] || '#6b7280',
    }))
  }, [filteredTickets])

  // Calculate type distribution
  const typeDistribution = useMemo(() => {
    const dist: Record<string, number> = {}
    filteredTickets.forEach(t => {
      const type = t.type || 'Unclassified'
      dist[type] = (dist[type] || 0) + 1
    })
    return Object.entries(dist)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [filteredTickets])

  // Calculate company distribution
  const companyDistribution = useMemo(() => {
    const dist: Record<string, number> = {}
    filteredTickets.forEach(t => {
      const company = t.company || 'Unknown'
      dist[company] = (dist[company] || 0) + 1
    })
    return Object.entries(dist)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [filteredTickets])

  // Calculate completion metrics
  const completionMetrics = useMemo(() => {
    const completed = filteredTickets.filter(t => t.closedFlag)
    const withResolution = completed.filter(t => t.resolutionTime && t.resolutionTime > 0)
    
    const avgResolutionDays = withResolution.length > 0
      ? withResolution.reduce((sum, t) => sum + (t.resolutionTime || 0), 0) / withResolution.length / 24
      : 0
    
    const totalEstimated = filteredTickets.reduce((sum, t) => sum + (t.estimatedHours || 0), 0)
    const totalActual = filteredTickets.reduce((sum, t) => sum + (t.actualHours || 0), 0)
    
    return {
      completionRate: filteredTickets.length > 0 ? (completed.length / filteredTickets.length) * 100 : 0,
      avgResolutionDays,
      totalEstimated,
      totalActual,
      variance: totalEstimated > 0 ? ((totalActual - totalEstimated) / totalEstimated) * 100 : 0,
    }
  }, [filteredTickets])

  // Generate AI Analysis
  const generateAIAnalysis = async () => {
    setIsGeneratingAnalysis(true)
    setAnalysisError(null)
    
    try {
      const projectData = {
        period: periodLabel,
        engineer: selectedEngineer ? `${selectedEngineer.firstName} ${selectedEngineer.lastName}` : 'All Engineers',
        totalProjects: filteredTickets.length,
        openProjects: stats.open,
        closedProjects: stats.closed,
        completionRate: completionMetrics.completionRate.toFixed(0),
        avgResolutionDays: completionMetrics.avgResolutionDays.toFixed(1),
        statusBreakdown: statusDistribution.map(s => `${s.name}: ${s.value}`).join(', '),
        typeBreakdown: typeDistribution.slice(0, 5).map(t => `${t.name}: ${t.value}`).join(', '),
        topClients: companyDistribution.slice(0, 5).map(c => `${c.name}: ${c.value} projects`).join(', '),
      }

      const prompt = `Analyze the following project portfolio data for ${projectData.engineer} during ${projectData.period}:

Total Projects: ${projectData.totalProjects}
Open: ${projectData.openProjects} | Closed: ${projectData.closedProjects}
Completion Rate: ${projectData.completionRate}%
Average Resolution: ${projectData.avgResolutionDays} days

Status Distribution: ${projectData.statusBreakdown}
Project Types: ${projectData.typeBreakdown}
Top Clients: ${projectData.topClients}

Provide a comprehensive project performance analysis including:
1. Overall assessment of project management effectiveness
2. Observations about workload distribution and priorities
3. Client relationship insights based on project distribution
4. Recommendations for improving project delivery
5. Areas of concern or attention needed

Keep the tone professional and actionable.`

      const response = await api.generateAnalysis('engineerAnalysis', {
        prompt,
        data: projectData,
      })
      
      setAiAnalysis(response.analysis)
    } catch (error: any) {
      console.error('Error generating analysis:', error)
      setAnalysisError(error.message || 'Failed to generate analysis')
    } finally {
      setIsGeneratingAnalysis(false)
    }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">Project Analytics</h2>
        <p className="text-gray-400">
          {selectedEngineer 
            ? `Project analysis for ${selectedEngineer.firstName} ${selectedEngineer.lastName}`
            : 'Project analysis for all engineers'}
          {' • '}<span className="text-blue-400">{periodLabel}</span>
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5">
          <h3 className="text-xs font-medium text-blue-100 mb-1">Total Projects</h3>
          <p className="text-3xl font-bold text-white">{stats.total}</p>
        </div>
        <div className="bg-gradient-to-br from-yellow-600 to-amber-700 rounded-xl p-5">
          <h3 className="text-xs font-medium text-yellow-100 mb-1">Open</h3>
          <p className="text-3xl font-bold text-white">{stats.open}</p>
        </div>
        <div className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-xl p-5">
          <h3 className="text-xs font-medium text-green-100 mb-1">Closed</h3>
          <p className="text-3xl font-bold text-white">{stats.closed}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-5">
          <h3 className="text-xs font-medium text-purple-100 mb-1">Completion</h3>
          <p className="text-3xl font-bold text-white">{completionMetrics.completionRate.toFixed(0)}%</p>
        </div>
        <div className="bg-gradient-to-br from-orange-600 to-orange-700 rounded-xl p-5">
          <h3 className="text-xs font-medium text-orange-100 mb-1">Avg Resolution</h3>
          <p className="text-3xl font-bold text-white">{completionMetrics.avgResolutionDays.toFixed(1)}d</p>
        </div>
        <div className="bg-gradient-to-br from-cyan-600 to-cyan-700 rounded-xl p-5">
          <h3 className="text-xs font-medium text-cyan-100 mb-1">Clients</h3>
          <p className="text-3xl font-bold text-white">{companyDistribution.length}</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Status Distribution */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Project Status Distribution</h3>
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
        </div>

        {/* Project Types */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Project Types</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" stroke="#9ca3af" />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  stroke="#9ca3af" 
                  width={120}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff' 
                  }}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top Clients */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">Top Clients by Project Count</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={companyDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="name" 
                stroke="#9ca3af" 
                tick={{ fontSize: 10 }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff' 
                }}
              />
              <Bar dataKey="value" name="Projects" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
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
              placeholder="Search by ticket #, summary, or client..."
              className="w-full bg-gray-700 text-white rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            />
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

      {/* Projects List */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Projects ({filteredTickets.length})
        </h3>
        
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-400">Loading projects...</p>
          </div>
        ) : filteredTickets.length === 0 ? (
          <p className="text-gray-400 text-center py-8">
            {searchQuery || statusFilter !== 'all' 
              ? 'No projects match your filters'
              : `No projects found for ${periodLabel.toLowerCase()}`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">ID</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Summary</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Client</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Priority</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Hours</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.slice(0, 50).map((ticket) => (
                  <tr key={ticket.id} className="border-b border-gray-700 hover:bg-gray-750">
                    <td className="py-3 px-4">
                      <span className="font-mono text-blue-400">#{ticket.id}</span>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-white truncate max-w-sm" title={ticket.summary}>
                        {ticket.summary || 'No summary'}
                      </p>
                      {ticket.type && (
                        <span className="text-xs text-gray-500">{ticket.type}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-300">{ticket.company || 'N/A'}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span 
                        className="px-2 py-1 rounded text-xs font-medium"
                        style={{ 
                          backgroundColor: `${STATUS_COLORS[ticket.status || ''] || '#6b7280'}20`,
                          color: STATUS_COLORS[ticket.status || ''] || '#9ca3af'
                        }}
                      >
                        {ticket.status || 'Unknown'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-400">
                        {ticket.priority?.split(' - ')[0] || 'N/A'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-white font-medium">
                        {ticketHours[ticket.id]?.toFixed(1) || '0.0'}h
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-400">
                      {ticket.dateEntered 
                        ? format(new Date(ticket.dateEntered), 'MMM d, yyyy')
                        : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredTickets.length > 50 && (
              <p className="text-center text-gray-400 py-4">
                Showing first 50 of {filteredTickets.length} projects
              </p>
            )}
          </div>
        )}
      </div>

      {/* AI Analysis */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-white">
            🤖 AI Project Analysis
          </h3>
          <button
            onClick={generateAIAnalysis}
            disabled={isGeneratingAnalysis || filteredTickets.length === 0}
            className={`px-5 py-2.5 rounded-lg font-medium transition-all ${
              isGeneratingAnalysis || filteredTickets.length === 0
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl'
            }`}
          >
            {isGeneratingAnalysis ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span> Analyzing...
              </span>
            ) : (
              '✨ Generate Analysis'
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
              Get AI-powered insights about project performance and workload
            </p>
            <p className="text-gray-500 text-sm">
              Click "Generate Analysis" for recommendations on project management
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
