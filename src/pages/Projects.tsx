import { useEffect, useMemo, useState } from 'react'
import { useSelectedEngineerStore, TEAM_DEFINITIONS } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'
import { useProjectsStore } from '@/stores/projectsStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useTimePeriodStore } from '@/stores/timePeriodStore'
import { format, differenceInDays } from 'date-fns'
import { api } from '@/lib/api'
import { isStandardProject } from '@/lib/projectUtils'
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
  'Open': '#3b82f6',
  'In Progress': '#f59e0b',
  'Scoping': '#3b82f6',
  'On-Hold': '#ef4444',
  'Ready to Close': '#8b5cf6',
  'Closed': '#22c55e',
  'New': '#06b6d4',
  'Scheduled': '#8b5cf6',
  'Completed': '#22c55e',
  'Completed AI': '#10b981',
  'Waiting - Client': '#f97316',
  'Waiting - 3rd Party': '#f97316',
}

const TICKET_STATUS_COLORS: Record<string, string> = {
  'New': '#3b82f6',
  'Open': '#3b82f6',
  'In Progress': '#f59e0b',
  'Scheduled': '#8b5cf6',
  'Remote': '#06b6d4',
  'Completed': '#22c55e',
  'Completed AI': '#10b981',
  'Closed': '#22c55e',
  'On-Hold': '#ef4444',
  'Waiting - Client': '#f97316',
  'Waiting - 3rd Party': '#f97316',
  'Offline/RMM Repair': '#ef4444',
}

export default function Projects() {
  const { selectedEngineerId, selectedTeam } = useSelectedEngineerStore()
  const { members } = useMembersStore()
  const {
    projects, projectTickets,
    isLoading, isLoadingTickets, error,
    fetchProjects, fetchProjectTickets,
    getProjectStats, getProjectTicketStats
  } = useProjectsStore()
  const { entries } = useTimeEntriesStore()
  const { getPeriodLabel, getDateRange } = useTimePeriodStore()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showActiveOnly, setShowActiveOnly] = useState(false)
  const [viewMode, setViewMode] = useState<'projects' | 'tickets'>('projects')
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  const periodLabel = getPeriodLabel()
  const dateRange = getDateRange()

  const selectedEngineer = selectedEngineerId
    ? members.find(m => m.id === selectedEngineerId)
    : null

  useEffect(() => {
    fetchProjects()
    fetchProjectTickets()
  }, [])

  // Get unique statuses for filter
  const uniqueStatuses = useMemo(() => {
    if (viewMode === 'projects') {
      const statuses = new Set(projects.map(p => p.status))
      return Array.from(statuses).sort()
    } else {
      const statuses = new Set(projectTickets.map(t => t.status))
      return Array.from(statuses).sort()
    }
  }, [projects, projectTickets, viewMode])

  // Filter projects based on engineer, status, and search
  const filteredProjects = useMemo(() => {
    let result = projects

    // Filter by selected engineer (manager OR has time entries)
    if (selectedEngineer) {
      const identifier = selectedEngineer.identifier.toLowerCase()
      // Get project IDs from time entries
      const timeEntryProjectIds = new Set(
        entries
          .filter(e => e.memberId === selectedEngineer.id && e.projectId !== null && e.projectId !== undefined)
          .map(e => e.projectId!)
      )

      // Get project IDs where engineer is a resource
      const resourceProjectIds = new Set(
        projectTickets
          .filter(t => t.resources?.toLowerCase().includes(identifier))
          .map(t => t.projectId)
      )

      result = result.filter(p =>
        p.managerIdentifier?.toLowerCase() === identifier ||
        timeEntryProjectIds.has(p.id) ||
        resourceProjectIds.has(p.id)
      )
    } else if (selectedTeam !== 'All Company') {
      const teamIdentifiers = TEAM_DEFINITIONS[selectedTeam] || []

      // Get projects where any team member has logged time
      const teamTimeProjectIds = new Set(
        entries
          .filter(e => {
            // Find member for this entry
            const entryMember = members.find(m => m.id === e.memberId)
            return entryMember && teamIdentifiers.includes(entryMember.identifier) && e.projectId
          })
          .map(e => e.projectId!)
      )

      // Get projects where any team member is a resource
      const teamResourceProjectIds = new Set(
        projectTickets
          .filter(t => t.resources && teamIdentifiers.some(id => t.resources?.toLowerCase().includes(id.toLowerCase())))
          .map(t => t.projectId)
      )

      result = result.filter(p =>
        (p.managerIdentifier && teamIdentifiers.includes(p.managerIdentifier.toLowerCase())) ||
        teamTimeProjectIds.has(p.id) ||
        teamResourceProjectIds.has(p.id)
      )
    }

    // Filter out Workstation Projects (they are treated as Service Desk)
    result = result.filter(isStandardProject)

    if (statusFilter !== 'all') {
      result = result.filter(p => p.status === statusFilter)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(p =>
        p.name?.toLowerCase().includes(query) ||
        p.id.toString().includes(query) ||
        p.company?.toLowerCase().includes(query)
      )
    }

    return result
  }, [projects, selectedEngineer, selectedTeam, statusFilter, searchQuery, entries])

  // Filter project tickets based on engineer, date range, and filters
  const filteredTickets = useMemo(() => {
    let result = projectTickets

    // Filter by date range (dateEntered)
    result = result.filter(t => {
      if (!t.dateEntered) return true
      const entered = new Date(t.dateEntered)
      return entered >= dateRange.start && entered <= dateRange.end
    })

    // Filter by selected project
    if (selectedProjectId) {
      result = result.filter(t => t.projectId === selectedProjectId)
    }

    // Filter by selected engineer (resources)
    if (selectedEngineer) {
      result = result.filter(t =>
        t.resources?.toLowerCase().includes(selectedEngineer.identifier.toLowerCase())
      )
    } else if (selectedTeam !== 'All Company') {
      const teamIdentifiers = TEAM_DEFINITIONS[selectedTeam] || []
      result = result.filter(t =>
        t.resources && teamIdentifiers.some(id => t.resources?.toLowerCase().includes(id.toLowerCase()))
      )
    }

    if (statusFilter !== 'all') {
      result = result.filter(t => t.status === statusFilter)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(t =>
        t.summary?.toLowerCase().includes(query) ||
        t.id.toString().includes(query) ||
        t.projectName?.toLowerCase().includes(query) ||
        t.phaseName?.toLowerCase().includes(query)
      )
    }

    return result
  }, [projectTickets, selectedEngineer, selectedProjectId, statusFilter, searchQuery, dateRange])

  // Group tickets by phase
  const ticketsByPhase = useMemo(() => {
    const grouped: Record<string, typeof filteredTickets> = {}
    filteredTickets.forEach(t => {
      const phase = t.phaseName || 'No Phase'
      if (!grouped[phase]) grouped[phase] = []
      grouped[phase].push(t)
    })
    return grouped
  }, [filteredTickets])

  const stats = useMemo(() => getProjectStats(filteredProjects), [filteredProjects, getProjectStats])
  const ticketStats = useMemo(() => getProjectTicketStats(filteredTickets), [filteredTickets, getProjectTicketStats])

  // Calculate status distribution for pie chart
  const statusDistribution = useMemo(() => {
    const data = viewMode === 'projects' ? stats.byStatus : ticketStats.byStatus
    return Object.entries(data).map(([name, value]) => ({
      name,
      value,
      color: (viewMode === 'projects' ? STATUS_COLORS : TICKET_STATUS_COLORS)[name] || '#6b7280',
    }))
  }, [stats.byStatus, ticketStats.byStatus, viewMode])

  // Calculate phase distribution (for tickets)
  const phaseDistribution = useMemo(() => {
    return Object.entries(ticketStats.byPhase)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [ticketStats.byPhase])

  // Calculate manager/engineer distribution
  const engineerDistribution = useMemo(() => {
    if (viewMode === 'projects') {
      return Object.entries(stats.byManager)
        .map(([name, value]) => ({ name: name.split(' ')[0], fullName: name, value }))
        .sort((a, b) => b.value - a.value)
    } else {
      return Object.entries(ticketStats.byEngineer)
        .map(([name, value]) => ({ name, fullName: name, value }))
        .sort((a, b) => b.value - a.value)
    }
  }, [stats.byManager, ticketStats.byEngineer, viewMode])

  // Calculate company distribution
  const companyDistribution = useMemo(() => {
    return Object.entries(stats.byCompany)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [stats.byCompany])

  // Calculate project duration stats
  const durationStats = useMemo(() => {
    const projectsWithDates = filteredProjects.filter(p => p.estimatedStart && p.estimatedEnd)
    if (projectsWithDates.length === 0) return null

    const durations = projectsWithDates.map(p => {
      const start = p.estimatedStart!
      const end = p.estimatedEnd!
      return differenceInDays(end, start)
    })

    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length
    return { avgDuration }
  }, [filteredProjects])

  // Generate AI Analysis
  const generateAIAnalysis = async () => {
    setIsGeneratingAnalysis(true)
    setAnalysisError(null)

    try {
      const projectData = {
        period: periodLabel,
        engineer: selectedEngineer ? `${selectedEngineer.firstName} ${selectedEngineer.lastName}` : 'All Engineers',
        totalProjects: filteredProjects.length,
        totalTickets: filteredTickets.length,
        openProjects: stats.open,
        inProgressProjects: stats.inProgress,
        onHoldProjects: stats.onHold,
        closedProjects: stats.closed,
        avgCompletion: stats.avgPercentComplete.toFixed(0),
        totalActualHours: stats.totalActualHours.toFixed(1),
        statusBreakdown: statusDistribution.map(s => `${s.name}: ${s.value}`).join(', '),
        phaseBreakdown: phaseDistribution.slice(0, 5).map(p => `${p.name}: ${p.value} tickets`).join(', '),
        topClients: companyDistribution.slice(0, 5).map(c => `${c.name}: ${c.value} projects`).join(', '),
        avgDuration: durationStats ? `${durationStats.avgDuration.toFixed(0)} days` : 'N/A',
      }

      const prompt = `Analyze the following project portfolio data for ${projectData.engineer}:

Total Projects: ${projectData.totalProjects}
Total Project Tickets: ${projectData.totalTickets}
Open: ${projectData.openProjects} | In Progress: ${projectData.inProgressProjects} | On-Hold: ${projectData.onHoldProjects} | Closed: ${projectData.closedProjects}
Average Completion: ${projectData.avgCompletion}%
Total Hours Logged: ${projectData.totalActualHours}
Average Project Duration: ${projectData.avgDuration}

Status Distribution: ${projectData.statusBreakdown}
Phase Breakdown: ${projectData.phaseBreakdown}
Top Clients: ${projectData.topClients}

Provide a comprehensive project performance analysis including:
1. Overall assessment of project management effectiveness
2. Observations about workload distribution and capacity
3. Phase progress analysis and bottlenecks
4. Risk assessment (on-hold projects, completion rates)
5. Recommendations for improving project delivery

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

  const isPageLoading = isLoading || isLoadingTickets

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">Project Analytics</h2>
        <p className="text-gray-400">
          {selectedEngineer
            ? `Projects ${viewMode === 'projects' ? 'managed by' : 'with tickets assigned to'} ${selectedEngineer.firstName} ${selectedEngineer.lastName}`
            : 'All projects across engineers'}
        </p>
      </div>

      {error && (
        <div className="bg-red-600/20 border border-red-500 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* View Mode Toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setViewMode('projects'); setStatusFilter('all'); setSelectedProjectId(null); }}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${viewMode === 'projects'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
        >
          Projects ({projects.length})
        </button>
        <button
          onClick={() => { setViewMode('tickets'); setStatusFilter('all'); }}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${viewMode === 'tickets'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
        >
          Project Tickets ({projectTickets.length})
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        {viewMode === 'projects' ? (
          <>
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5">
              <h3 className="text-xs font-medium text-blue-100 mb-1">Total Projects</h3>
              <p className="text-3xl font-bold text-white">{stats.total}</p>
            </div>
            <div className="bg-gradient-to-br from-cyan-600 to-cyan-700 rounded-xl p-5">
              <h3 className="text-xs font-medium text-cyan-100 mb-1">Open</h3>
              <p className="text-3xl font-bold text-white">{stats.open}</p>
            </div>
            <div className="bg-gradient-to-br from-yellow-600 to-amber-700 rounded-xl p-5">
              <h3 className="text-xs font-medium text-yellow-100 mb-1">In Progress</h3>
              <p className="text-3xl font-bold text-white">{stats.inProgress}</p>
            </div>
            <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-xl p-5">
              <h3 className="text-xs font-medium text-red-100 mb-1">On Hold</h3>
              <p className="text-3xl font-bold text-white">{stats.onHold}</p>
            </div>
            <div className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-xl p-5">
              <h3 className="text-xs font-medium text-green-100 mb-1">Closed</h3>
              <p className="text-3xl font-bold text-white">{stats.closed}</p>
            </div>
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5">
              <h3 className="text-xs font-medium text-blue-100 mb-1">Avg Complete</h3>
              <p className="text-3xl font-bold text-white">{stats.avgPercentComplete.toFixed(0)}%</p>
            </div>
          </>
        ) : (
          <>
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5">
              <h3 className="text-xs font-medium text-blue-100 mb-1">Total Tickets</h3>
              <p className="text-3xl font-bold text-white">{ticketStats.total}</p>
            </div>
            <div className="bg-gradient-to-br from-cyan-600 to-cyan-700 rounded-xl p-5">
              <h3 className="text-xs font-medium text-cyan-100 mb-1">Phases</h3>
              <p className="text-3xl font-bold text-white">{Object.keys(ticketStats.byPhase).length}</p>
            </div>
            <div className="bg-gradient-to-br from-yellow-600 to-amber-700 rounded-xl p-5">
              <h3 className="text-xs font-medium text-yellow-100 mb-1">Projects</h3>
              <p className="text-3xl font-bold text-white">{Object.keys(ticketStats.byProject).length}</p>
            </div>
            <div className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-xl p-5">
              <h3 className="text-xs font-medium text-green-100 mb-1">Engineers</h3>
              <p className="text-3xl font-bold text-white">{Object.keys(ticketStats.byEngineer).length}</p>
            </div>
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5">
              <h3 className="text-xs font-medium text-blue-100 mb-1">Statuses</h3>
              <p className="text-3xl font-bold text-white">{Object.keys(ticketStats.byStatus).length}</p>
            </div>
            <div className="bg-gradient-to-br from-orange-600 to-orange-700 rounded-xl p-5">
              <h3 className="text-xs font-medium text-orange-100 mb-1">Filtered</h3>
              <p className="text-3xl font-bold text-white">{filteredTickets.length}</p>
            </div>
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Status Distribution */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            {viewMode === 'projects' ? 'Project Status' : 'Ticket Status'} Distribution
          </h3>
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

        {/* Engineer/Phase Distribution */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            {viewMode === 'projects' ? 'Projects by Manager' : 'Tickets by Phase'}
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={viewMode === 'projects' ? engineerDistribution : phaseDistribution.slice(0, 8)}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" stroke="#9ca3af" />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#9ca3af"
                  width={120}
                  tick={{ fontSize: 11 }}
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

      {/* Top Clients (Projects view only) */}
      {viewMode === 'projects' && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">Top Clients by Project Count</h3>
          {companyDistribution.length > 0 ? (
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
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-500">
              No client data available
            </div>
          )}
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
              placeholder={viewMode === 'projects'
                ? "Search by project name, ID, or client..."
                : "Search by ticket summary, ID, project, or phase..."}
              className="w-full bg-gray-700 text-white rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Status
            </label>
            {/* Active Only Toggle */}
            <button
              onClick={() => setShowActiveOnly(!showActiveOnly)}
              className={`px-3 py-2 rounded text-sm font-medium transition-colors ${showActiveOnly
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
            >
              Active Projects (14d)
            </button>
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
          {viewMode === 'tickets' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Project
              </label>
              <select
                value={selectedProjectId || ''}
                onChange={(e) => setSelectedProjectId(e.target.value ? parseInt(e.target.value) : null)}
                className="bg-gray-700 text-white rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">All Projects</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Projects List */}
      {viewMode === 'projects' && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Projects ({filteredProjects.length})
          </h3>

          {isPageLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-400">Loading projects...</p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <p className="text-gray-400 text-center py-8">
              {searchQuery || statusFilter !== 'all'
                ? 'No projects match your filters'
                : 'No projects found'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Project</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Client</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Manager</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Progress</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Hours</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Timeline</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map((project) => (
                    <tr key={project.id} className="border-b border-gray-700 hover:bg-gray-750">
                      <td className="py-3 px-4">
                        <p className="text-white font-medium truncate max-w-xs" title={project.name}>
                          {project.name}
                          {entries.some(e => e.projectId === project.id && new Date(e.dateStart) >= new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)) && (
                            <span className="ml-2 px-1.5 py-0.5 bg-green-900 text-green-300 text-[10px] rounded border border-green-700">Active</span>
                          )}
                        </p>
                        {project.type && (
                          <span className="text-xs text-gray-500">{project.type}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-300">{project.company || 'N/A'}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className="px-2 py-1 rounded text-xs font-medium"
                          style={{
                            backgroundColor: `${STATUS_COLORS[project.status] || '#6b7280'}20`,
                            color: STATUS_COLORS[project.status] || '#9ca3af'
                          }}
                        >
                          {project.status}
                        </span>
                        {(project.auditClosedBy || project.auditClosedDate) && (project.status === 'Closed' || project.status === 'Ready to Close') && (
                          <div className="text-[10px] text-gray-400 mt-1 leading-tight">
                            {project.auditClosedBy && <div>by {project.auditClosedBy}</div>}
                            {project.auditClosedDate && <div>on {format(project.auditClosedDate, 'MMM d')}</div>}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-300">
                          {project.managerName?.split(' ')[0] || project.managerIdentifier || 'N/A'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-700 rounded-full h-2">
                            <div
                              className="bg-blue-500 h-2 rounded-full"
                              style={{ width: `${Math.min(project.percentComplete || 0, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400">
                            {project.percentComplete || 0}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-white font-medium">
                          {(project.actualHours || 0).toFixed(1)}h
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-400">
                        {project.estimatedStart && project.estimatedEnd ? (
                          <>
                            {format(project.estimatedStart, 'MMM d')} - {format(project.estimatedEnd, 'MMM d')}
                          </>
                        ) : 'No dates'}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => { setViewMode('tickets'); setSelectedProjectId(project.id); }}
                          className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                          View Tickets →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Project Tickets List (grouped by phase) */}
      {viewMode === 'tickets' && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Project Tickets ({filteredTickets.length})
            {selectedProjectId && (
              <span className="text-sm font-normal text-gray-400 ml-2">
                - {projects.find(p => p.id === selectedProjectId)?.name}
              </span>
            )}
          </h3>

          {isPageLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-400">Loading tickets...</p>
            </div>
          ) : filteredTickets.length === 0 ? (
            <p className="text-gray-400 text-center py-8">
              {searchQuery || statusFilter !== 'all' || selectedProjectId
                ? 'No tickets match your filters'
                : 'No project tickets found'}
            </p>
          ) : (
            <div className="space-y-6">
              {Object.entries(ticketsByPhase).map(([phase, tickets]) => (
                <div key={phase} className="border border-gray-700 rounded-lg overflow-hidden">
                  <div className="bg-gray-700 px-4 py-2 flex justify-between items-center">
                    <h4 className="font-medium text-white">{phase}</h4>
                    <span className="text-sm text-gray-400">{tickets.length} tickets</span>
                  </div>
                  <div className="divide-y divide-gray-700">
                    {tickets.slice(0, 20).map((ticket) => (
                      <div key={ticket.id} className="px-4 py-3 hover:bg-gray-750">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="text-white font-medium">
                              <span className="text-gray-500 font-mono text-sm mr-2">#{ticket.id}</span>
                              {ticket.summary}
                            </p>
                            <div className="flex gap-4 mt-1 text-sm text-gray-400">
                              {!selectedProjectId && ticket.projectName && (
                                <span>{ticket.projectName}</span>
                              )}
                              {ticket.resources && (
                                <span className="ml-4">{ticket.resources}</span>
                              )}
                            </div>
                          </div>
                          <span
                            className="px-2 py-1 rounded text-xs font-medium ml-4"
                            style={{
                              backgroundColor: `${TICKET_STATUS_COLORS[ticket.status] || '#6b7280'}20`,
                              color: TICKET_STATUS_COLORS[ticket.status] || '#9ca3af'
                            }}
                          >
                            {ticket.status}
                          </span>
                        </div>
                      </div>
                    ))}
                    {tickets.length > 20 && (
                      <p className="text-center text-gray-500 py-2 text-sm">
                        + {tickets.length - 20} more tickets
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI Analysis */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-white">
            AI Project Analysis
          </h3>
          <button
            onClick={generateAIAnalysis}
            disabled={isGeneratingAnalysis || (filteredProjects.length === 0 && filteredTickets.length === 0)}
            className={`px-5 py-2.5 rounded-lg font-medium transition-all ${isGeneratingAnalysis || (filteredProjects.length === 0 && filteredTickets.length === 0)
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
              Get AI-powered insights about project portfolio performance
            </p>
            <p className="text-gray-500 text-sm">
              Click "Generate Analysis" for workload and delivery recommendations
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
