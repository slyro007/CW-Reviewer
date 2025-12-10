import { useMemo, useState, useEffect } from 'react'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useTicketsStore } from '@/stores/ticketsStore'
import { useProjectsStore } from '@/stores/projectsStore'
import { useTimePeriodStore } from '@/stores/timePeriodStore'
import DataSourceFilter, { useDataSources, type DataSource } from '@/components/DataSourceFilter'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts'

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

interface EngineerStats {
  id: number
  name: string
  identifier: string
  // Time entry stats
  totalHours: number
  billableHours: number
  billablePercent: number
  entryCount: number
  notesPercent: number
  avgHoursPerEntry: number
  // Service desk stats
  serviceTicketsWorked: number
  serviceTicketsClosed: number
  avgResolutionTime: number
  // Project stats
  projectsManaged: number
  projectTicketsWorked: number
  projectTicketsClosed: number
}

export default function Compare() {
  const { members, selectedMembers, toggleMemberSelection, clearSelection } = useMembersStore()
  const { entries, fetchTimeEntries } = useTimeEntriesStore()
  const { serviceTickets, fetchServiceBoardTickets } = useTicketsStore()
  const { projects, projectTickets, fetchProjects, fetchProjectTickets } = useProjectsStore()
  const { getDateRange, getPeriodLabel } = useTimePeriodStore()
  
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false)
  const [aiInsights, setAiInsights] = useState<string | null>(null)
  const [insightError, setInsightError] = useState<string | null>(null)
  
  // Data source filters
  const { dataSources, setDataSources, includesServiceDesk, includesProjects } = useDataSources()

  const dateRange = getDateRange()
  const periodLabel = getPeriodLabel()

  // Fetch all data
  useEffect(() => {
    fetchTimeEntries({
      startDate: format(dateRange.start, 'yyyy-MM-dd'),
      endDate: format(dateRange.end, 'yyyy-MM-dd'),
    })
    fetchServiceBoardTickets()
    fetchProjects()
    fetchProjectTickets()
  }, [dateRange.start.getTime(), dateRange.end.getTime()])

  // Filter entries by date range
  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      const entryDate = new Date(e.dateStart)
      return entryDate >= dateRange.start && entryDate <= dateRange.end
    })
  }, [entries, dateRange])

  // Filter service tickets by date range
  const filteredServiceTickets = useMemo(() => {
    return serviceTickets.filter(t => {
      if (!t.dateEntered) return true
      const entered = new Date(t.dateEntered)
      return entered >= dateRange.start && entered <= dateRange.end
    })
  }, [serviceTickets, dateRange])

  // Filter project tickets by date range
  const filteredProjectTickets = useMemo(() => {
    return projectTickets.filter(t => {
      if (!t.dateEntered) return true
      const entered = new Date(t.dateEntered)
      return entered >= dateRange.start && entered <= dateRange.end
    })
  }, [projectTickets, dateRange])

  // Calculate stats for each selected member
  const engineerStats = useMemo((): EngineerStats[] => {
    return selectedMembers.map(memberId => {
      const member = members.find(m => m.id === memberId)
      const identifier = member?.identifier?.toLowerCase() || ''
      const memberEntries = filteredEntries.filter(e => e.memberId === memberId)
      
      // Time entry stats
      const totalHours = memberEntries.reduce((sum, e) => sum + e.hours, 0)
      const billableHours = memberEntries
        .filter(e => e.billableOption === 'Billable')
        .reduce((sum, e) => sum + e.hours, 0)
      const withNotes = memberEntries.filter(e => e.notes && e.notes.trim().length > 0).length

      // Service desk stats
      const memberServiceTickets = filteredServiceTickets.filter(t => 
        t.owner?.toLowerCase() === identifier ||
        t.resources?.toLowerCase().includes(identifier)
      )
      const closedServiceTickets = memberServiceTickets.filter(t => t.closedFlag)
      const resolutionTimes = closedServiceTickets
        .filter(t => t.dateEntered && t.closedDate)
        .map(t => {
          const entered = new Date(t.dateEntered!)
          const closed = new Date(t.closedDate!)
          return (closed.getTime() - entered.getTime()) / (1000 * 60 * 60) // hours
        })
      const avgResolutionTime = resolutionTimes.length > 0
        ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
        : 0

      // Project stats
      const memberProjects = projects.filter(p => 
        p.managerIdentifier?.toLowerCase() === identifier
      )
      const memberProjectIds = memberProjects.map(p => p.id)
      const memberProjectTickets = filteredProjectTickets.filter(t => 
        memberProjectIds.includes(t.projectId) ||
        t.resources?.toLowerCase().includes(identifier)
      )
      const closedProjectTickets = memberProjectTickets.filter(t => t.closedFlag)

      return {
        id: memberId,
        name: member ? `${member.firstName} ${member.lastName}` : `Member ${memberId}`,
        identifier,
        totalHours,
        billableHours,
        billablePercent: totalHours > 0 ? (billableHours / totalHours) * 100 : 0,
        entryCount: memberEntries.length,
        notesPercent: memberEntries.length > 0 ? (withNotes / memberEntries.length) * 100 : 0,
        avgHoursPerEntry: memberEntries.length > 0 ? totalHours / memberEntries.length : 0,
        serviceTicketsWorked: memberServiceTickets.length,
        serviceTicketsClosed: closedServiceTickets.length,
        avgResolutionTime,
        projectsManaged: memberProjects.length,
        projectTicketsWorked: memberProjectTickets.length,
        projectTicketsClosed: closedProjectTickets.length,
      }
    })
  }, [selectedMembers, members, filteredEntries, filteredServiceTickets, filteredProjectTickets, projects])

  // Prepare chart data based on selected data sources
  const barChartData = useMemo(() => {
    return engineerStats.map(stats => {
      const data: any = { name: stats.name.split(' ')[0] }
      
      if (includesServiceDesk) {
        data.serviceTickets = stats.serviceTicketsWorked
        data.serviceClosed = stats.serviceTicketsClosed
      }
      if (includesProjects) {
        data.projectTickets = stats.projectTicketsWorked
        data.projectClosed = stats.projectTicketsClosed
      }
      
      return data
    })
  }, [engineerStats, dataSources])

  // Prepare radar chart data
  const radarData = useMemo(() => {
    if (engineerStats.length === 0) return []
    
    const maxHours = Math.max(...engineerStats.map(s => s.totalHours), 1)
    const maxServiceTickets = Math.max(...engineerStats.map(s => s.serviceTicketsWorked), 1)
    const maxProjectTickets = Math.max(...engineerStats.map(s => s.projectTicketsWorked), 1)
    const maxProjects = Math.max(...engineerStats.map(s => s.projectsManaged), 1)

    const metrics: { metric: string; fullMark: number; source?: DataSource }[] = [
      { metric: 'Hours', fullMark: 100 },
      { metric: 'Billable %', fullMark: 100 },
      { metric: 'Notes %', fullMark: 100 },
    ]

    if (includesServiceDesk) {
      metrics.push({ metric: 'Service Tickets', fullMark: 100, source: 'serviceDesk' })
    }
    if (includesProjects) {
      metrics.push({ metric: 'Project Tickets', fullMark: 100, source: 'projects' })
      metrics.push({ metric: 'Projects', fullMark: 100, source: 'projects' })
    }

    return metrics.map(({ metric, fullMark }) => {
      const dataPoint: any = { metric, fullMark }
      engineerStats.forEach(stats => {
        let value: number
        switch (metric) {
          case 'Hours':
            value = (stats.totalHours / maxHours) * 100
            break
          case 'Billable %':
            value = stats.billablePercent
            break
          case 'Notes %':
            value = stats.notesPercent
            break
          case 'Service Tickets':
            value = (stats.serviceTicketsWorked / maxServiceTickets) * 100
            break
          case 'Project Tickets':
            value = (stats.projectTicketsWorked / maxProjectTickets) * 100
            break
          case 'Projects':
            value = (stats.projectsManaged / maxProjects) * 100
            break
          default:
            value = 0
        }
        dataPoint[stats.name] = Number(value.toFixed(0))
      })
      return dataPoint
    })
  }, [engineerStats, dataSources])

  // Generate AI insights
  const generateInsights = async () => {
    if (engineerStats.length < 2) return
    
    setIsGeneratingInsights(true)
    setInsightError(null)
    
    try {
      const comparisonData = {
        period: periodLabel,
        dataSources: dataSources.join(', '),
        engineers: engineerStats,
      }

      const response = await api.generateAnalysis('engineerComparison', {
        members: engineerStats.map(s => ({ 
          id: s.id, 
          firstName: s.name.split(' ')[0],
          lastName: s.name.split(' ').slice(1).join(' ')
        })),
        comparisonData,
      })
      
      setAiInsights(response.analysis)
    } catch (error: any) {
      console.error('Error generating insights:', error)
      setInsightError(error.message || 'Failed to generate insights')
    } finally {
      setIsGeneratingInsights(false)
    }
  }

  // Select all engineers
  const selectAll = () => {
    members.forEach(m => {
      if (!selectedMembers.includes(m.id)) {
        toggleMemberSelection(m.id)
      }
    })
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Compare Engineers</h2>
          <p className="text-gray-400">
            Compare performance metrics across service desk and projects
            {' • '}<span className="text-blue-400">{periodLabel}</span>
          </p>
        </div>
        <DataSourceFilter selected={dataSources} onChange={setDataSources} />
      </div>

      {/* Engineer Selection */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Select Engineers to Compare</h3>
          <div className="flex gap-2">
            <button onClick={selectAll} className="text-sm text-blue-400 hover:text-blue-300">
              Select All
            </button>
            <span className="text-gray-600">|</span>
            <button onClick={clearSelection} className="text-sm text-gray-400 hover:text-gray-300">
              Clear All
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
          {members.map((member) => (
            <label 
              key={member.id} 
              className={`flex items-center space-x-2 p-2 rounded cursor-pointer transition-colors ${
                selectedMembers.includes(member.id)
                  ? 'bg-blue-600/20 border border-blue-500'
                  : 'bg-gray-700 hover:bg-gray-600 border border-transparent'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedMembers.includes(member.id)}
                onChange={() => toggleMemberSelection(member.id)}
                className="rounded border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <span 
                className="text-white text-sm truncate"
                style={{ 
                  borderLeftWidth: selectedMembers.includes(member.id) ? 3 : 0,
                  borderLeftColor: COLORS[selectedMembers.indexOf(member.id) % COLORS.length],
                  paddingLeft: selectedMembers.includes(member.id) ? 8 : 0
                }}
              >
                {member.firstName} {member.lastName}
              </span>
            </label>
          ))}
        </div>
        <p className="text-sm text-gray-400 mt-3">
          {selectedMembers.length} engineers selected
        </p>
      </div>

      {selectedMembers.length < 2 ? (
        <div className="bg-gray-800 rounded-lg p-12 text-center">
          <p className="text-gray-400 text-lg">
            Select at least 2 engineers to compare
          </p>
        </div>
      ) : (
        <>
          {/* Stats Comparison Table */}
          <div className="bg-gray-800 rounded-lg p-6 mb-6 overflow-x-auto">
            <h3 className="text-lg font-semibold text-white mb-4">Metrics Comparison</h3>
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Engineer</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">Hours</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">Billable %</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">Notes %</th>
                  {includesServiceDesk && (
                    <>
                      <th className="text-right py-3 px-4 text-cyan-400 font-medium">Service Tickets</th>
                      <th className="text-right py-3 px-4 text-cyan-400 font-medium">Closed</th>
                      <th className="text-right py-3 px-4 text-cyan-400 font-medium">Avg Resolution</th>
                    </>
                  )}
                  {includesProjects && (
                    <>
                      <th className="text-right py-3 px-4 text-purple-400 font-medium">Projects</th>
                      <th className="text-right py-3 px-4 text-purple-400 font-medium">Project Tickets</th>
                      <th className="text-right py-3 px-4 text-purple-400 font-medium">Closed</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {engineerStats.map((stats, index) => (
                  <tr key={stats.id} className="border-b border-gray-700">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="text-white font-medium">{stats.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-white">{stats.totalHours.toFixed(1)}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={`px-2 py-1 rounded text-sm ${
                        stats.billablePercent >= 70 ? 'bg-green-600/20 text-green-400' :
                        stats.billablePercent >= 50 ? 'bg-yellow-600/20 text-yellow-400' :
                        'bg-red-600/20 text-red-400'
                      }`}>
                        {stats.billablePercent.toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`px-2 py-1 rounded text-sm ${
                        stats.notesPercent >= 80 ? 'bg-green-600/20 text-green-400' :
                        stats.notesPercent >= 50 ? 'bg-yellow-600/20 text-yellow-400' :
                        'bg-red-600/20 text-red-400'
                      }`}>
                        {stats.notesPercent.toFixed(0)}%
                      </span>
                    </td>
                    {includesServiceDesk && (
                      <>
                        <td className="py-3 px-4 text-right text-cyan-400">{stats.serviceTicketsWorked}</td>
                        <td className="py-3 px-4 text-right text-cyan-300">{stats.serviceTicketsClosed}</td>
                        <td className="py-3 px-4 text-right text-cyan-300">
                          {stats.avgResolutionTime > 0 ? `${stats.avgResolutionTime.toFixed(0)}h` : '-'}
                        </td>
                      </>
                    )}
                    {includesProjects && (
                      <>
                        <td className="py-3 px-4 text-right text-purple-400">{stats.projectsManaged}</td>
                        <td className="py-3 px-4 text-right text-purple-300">{stats.projectTicketsWorked}</td>
                        <td className="py-3 px-4 text-right text-purple-300">{stats.projectTicketsClosed}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Ticket Comparison Bar Chart */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Tickets Comparison</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="name" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                    <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} />
                    <Legend />
                    {includesServiceDesk && (
                      <>
                        <Bar dataKey="serviceTickets" name="Service Worked" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="serviceClosed" name="Service Closed" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                      </>
                    )}
                    {includesProjects && (
                      <>
                        <Bar dataKey="projectTickets" name="Project Worked" fill="#a855f7" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="projectClosed" name="Project Closed" fill="#c084fc" radius={[4, 4, 0, 0]} />
                      </>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Radar Chart */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Performance Radar</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#374151" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                    {engineerStats.map((stats, idx) => (
                      <Radar
                        key={stats.id}
                        name={stats.name}
                        dataKey={stats.name}
                        stroke={COLORS[idx % COLORS.length]}
                        fill={COLORS[idx % COLORS.length]}
                        fillOpacity={0.2}
                      />
                    ))}
                    <Legend />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Hours Comparison */}
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Hours Comparison</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={engineerStats.map(s => ({
                  name: s.name.split(' ')[0],
                  billableHours: Number(s.billableHours.toFixed(1)),
                  nonBillableHours: Number((s.totalHours - s.billableHours).toFixed(1)),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }} />
                  <Legend />
                  <Bar dataKey="billableHours" name="Billable" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="nonBillableHours" name="Non-Billable" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* AI Insights */}
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">AI Insights</h3>
              <button
                onClick={generateInsights}
                disabled={isGeneratingInsights}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  isGeneratingInsights
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {isGeneratingInsights ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                    Analyzing...
                  </span>
                ) : (
                  'Generate Insights'
                )}
              </button>
            </div>
            
            {insightError && (
              <div className="bg-red-600/20 border border-red-500 rounded-lg p-4 mb-4">
                <p className="text-red-400">{insightError}</p>
              </div>
            )}
            
            {aiInsights ? (
              <div className="prose prose-invert max-w-none">
                <div className="whitespace-pre-wrap text-gray-300 leading-relaxed">
                  {aiInsights}
                </div>
              </div>
            ) : (
              <p className="text-gray-400">
                Click "Generate Insights" to get AI-powered analysis comparing {includesServiceDesk && includesProjects ? 'service desk and project' : includesServiceDesk ? 'service desk' : 'project'} performance
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
