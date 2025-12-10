import { useEffect, useState, useMemo } from 'react'
import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useTimePeriodStore } from '@/stores/timePeriodStore'
import { format } from 'date-fns'
import { api } from '@/lib/api'

interface EngineerAnalytics {
  memberId: number
  name: string
  totalHours: number
  billableHours: number
  billablePercent: number
  notesPercent: number
  avgHoursPerDay: number
  entriesCount: number
  daysWorked: number
}

export default function TimeTracking() {
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { members } = useMembersStore()
  const { entries, isLoading, fetchTimeEntries } = useTimeEntriesStore()
  const { getDateRange, getPeriodLabel } = useTimePeriodStore()
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  const dateRange = getDateRange()
  const periodLabel = getPeriodLabel()

  const selectedEngineer = selectedEngineerId 
    ? members.find(m => m.id === selectedEngineerId)
    : null

  // Auto-fetch time entries based on global date range
  useEffect(() => {
    fetchTimeEntries({
      startDate: format(dateRange.start, 'yyyy-MM-dd'),
      endDate: format(dateRange.end, 'yyyy-MM-dd'),
    })
  }, [dateRange.start.getTime(), dateRange.end.getTime()])

  // Filter entries based on selected engineer and date range
  const filteredEntries = useMemo(() => {
    let result = entries.filter(e => {
      const entryDate = new Date(e.dateStart)
      return entryDate >= dateRange.start && entryDate <= dateRange.end
    })
    
    if (selectedEngineerId !== null) {
      result = result.filter(e => e.memberId === selectedEngineerId)
    }
    
    return result
  }, [entries, selectedEngineerId, dateRange])

  // Calculate analytics for each engineer
  const engineerAnalytics = useMemo((): EngineerAnalytics[] => {
    const targetMembers = selectedEngineerId 
      ? members.filter(m => m.id === selectedEngineerId)
      : members

    return targetMembers.map(member => {
      const memberEntries = filteredEntries.filter(e => e.memberId === member.id)
      const totalHours = memberEntries.reduce((sum, e) => sum + e.hours, 0)
      const billableHours = memberEntries
        .filter(e => e.billableOption === 'Billable')
        .reduce((sum, e) => sum + e.hours, 0)
      const withNotes = memberEntries.filter(e => e.notes && e.notes.trim().length > 0).length
      const uniqueDays = new Set(memberEntries.map(e => 
        new Date(e.dateStart).toDateString()
      )).size

      return {
        memberId: member.id,
        name: `${member.firstName} ${member.lastName}`,
        totalHours,
        billableHours,
        billablePercent: totalHours > 0 ? (billableHours / totalHours) * 100 : 0,
        notesPercent: memberEntries.length > 0 ? (withNotes / memberEntries.length) * 100 : 0,
        avgHoursPerDay: uniqueDays > 0 ? totalHours / uniqueDays : 0,
        entriesCount: memberEntries.length,
        daysWorked: uniqueDays,
      }
    }).sort((a, b) => b.totalHours - a.totalHours)
  }, [members, filteredEntries, selectedEngineerId])

  // Calculate aggregate stats
  const aggregateStats = useMemo(() => {
    const totalHours = engineerAnalytics.reduce((sum, e) => sum + e.totalHours, 0)
    const billableHours = engineerAnalytics.reduce((sum, e) => sum + e.billableHours, 0)
    const totalEntries = engineerAnalytics.reduce((sum, e) => sum + e.entriesCount, 0)
    const withNotes = filteredEntries.filter(e => e.notes && e.notes.trim().length > 0).length

    return {
      totalHours,
      billableHours,
      billablePercent: totalHours > 0 ? (billableHours / totalHours) * 100 : 0,
      totalEntries,
      notesPercent: totalEntries > 0 ? (withNotes / totalEntries) * 100 : 0,
      engineerCount: engineerAnalytics.length,
    }
  }, [engineerAnalytics, filteredEntries])

  // Generate AI analysis
  const generateAIAnalysis = async () => {
    setIsGeneratingAnalysis(true)
    setAnalysisError(null)
    
    try {
      const analysisData = {
        period: periodLabel,
        dateRange: {
          start: dateRange.start.toISOString(),
          end: dateRange.end.toISOString(),
        },
        aggregateStats,
        engineerAnalytics: engineerAnalytics.map(e => ({
          name: e.name,
          totalHours: e.totalHours.toFixed(1),
          billablePercent: e.billablePercent.toFixed(0),
          notesPercent: e.notesPercent.toFixed(0),
          avgHoursPerDay: e.avgHoursPerDay.toFixed(1),
          daysWorked: e.daysWorked,
        })),
        focusEngineer: selectedEngineer ? `${selectedEngineer.firstName} ${selectedEngineer.lastName}` : null,
      }

      const prompt = selectedEngineer
        ? `Analyze the time tracking performance for ${selectedEngineer.firstName} ${selectedEngineer.lastName} for ${periodLabel}. 
           
           Stats:
           - Total Hours: ${engineerAnalytics[0]?.totalHours.toFixed(1) || 0}
           - Billable %: ${engineerAnalytics[0]?.billablePercent.toFixed(0) || 0}%
           - Notes Quality: ${engineerAnalytics[0]?.notesPercent.toFixed(0) || 0}%
           - Avg Hours/Day: ${engineerAnalytics[0]?.avgHoursPerDay.toFixed(1) || 0}
           - Days Worked: ${engineerAnalytics[0]?.daysWorked || 0}
           
           Provide a comprehensive analysis including:
           1. Overall performance assessment
           2. Strengths observed
           3. Areas for improvement
           4. Specific recommendations
           5. Comparison to typical MSP engineer benchmarks
           
           Keep the tone professional and constructive.`
        : `Analyze the team's time tracking performance for ${periodLabel}.
           
           Team Stats:
           - Total Hours: ${aggregateStats.totalHours.toFixed(1)}
           - Billable %: ${aggregateStats.billablePercent.toFixed(0)}%
           - Notes Quality: ${aggregateStats.notesPercent.toFixed(0)}%
           - Engineers: ${aggregateStats.engineerCount}
           
           Individual Performance:
           ${engineerAnalytics.map(e => `- ${e.name}: ${e.totalHours.toFixed(0)}h, ${e.billablePercent.toFixed(0)}% billable, ${e.notesPercent.toFixed(0)}% notes`).join('\n')}
           
           Provide a comprehensive team analysis including:
           1. Overall team performance
           2. Top performers and why
           3. Areas needing attention
           4. Team-wide recommendations
           5. Comparison to MSP industry benchmarks
           
           Keep the tone professional and actionable.`

      const response = await api.generateAnalysis('engineerAnalysis', {
        prompt,
        data: analysisData,
      })
      
      setAiAnalysis(response.analysis)
    } catch (error: any) {
      console.error('Error generating analysis:', error)
      setAnalysisError(error.message || 'Failed to generate analysis')
    } finally {
      setIsGeneratingAnalysis(false)
    }
  }

  // Get performance rating
  const getPerformanceRating = (analytics: EngineerAnalytics): { label: string; color: string } => {
    const score = (analytics.billablePercent * 0.4) + (analytics.notesPercent * 0.3) + (Math.min(analytics.avgHoursPerDay / 8, 1) * 100 * 0.3)
    if (score >= 80) return { label: 'Excellent', color: 'text-green-400 bg-green-500/20' }
    if (score >= 65) return { label: 'Good', color: 'text-blue-400 bg-blue-500/20' }
    if (score >= 50) return { label: 'Fair', color: 'text-yellow-400 bg-yellow-500/20' }
    return { label: 'Needs Improvement', color: 'text-orange-400 bg-orange-500/20' }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">Engineer Analytics</h2>
        <p className="text-gray-400">
          {selectedEngineer 
            ? `Performance analysis for ${selectedEngineer.firstName} ${selectedEngineer.lastName}`
            : 'Team performance analytics and insights'}
          {' • '}<span className="text-blue-400">{periodLabel}</span>
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading analytics...</p>
        </div>
      ) : (
        <>
          {/* Aggregate Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-6">
              <h3 className="text-sm font-medium text-blue-100 mb-1">Total Hours</h3>
              <p className="text-4xl font-bold text-white">{aggregateStats.totalHours.toFixed(0)}</p>
              <p className="text-sm text-blue-200 mt-1">{periodLabel}</p>
            </div>
            <div className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-xl p-6">
              <h3 className="text-sm font-medium text-green-100 mb-1">Billable %</h3>
              <p className="text-4xl font-bold text-white">{aggregateStats.billablePercent.toFixed(0)}%</p>
              <p className="text-sm text-green-200 mt-1">{aggregateStats.billableHours.toFixed(0)}h billable</p>
            </div>
            <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-6">
              <h3 className="text-sm font-medium text-purple-100 mb-1">Notes Quality</h3>
              <p className="text-4xl font-bold text-white">{aggregateStats.notesPercent.toFixed(0)}%</p>
              <p className="text-sm text-purple-200 mt-1">Entries with notes</p>
            </div>
            <div className="bg-gradient-to-br from-orange-600 to-orange-700 rounded-xl p-6">
              <h3 className="text-sm font-medium text-orange-100 mb-1">Time Entries</h3>
              <p className="text-4xl font-bold text-white">{aggregateStats.totalEntries}</p>
              <p className="text-sm text-orange-200 mt-1">Total entries logged</p>
            </div>
          </div>

          {/* Engineer Performance Cards */}
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h3 className="text-xl font-semibold text-white mb-4">
              {selectedEngineer ? 'Performance Summary' : 'Engineer Performance'}
            </h3>
            
            {engineerAnalytics.length === 0 ? (
              <p className="text-gray-400">No data available for the selected period</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {engineerAnalytics.map((engineer) => {
                  const rating = getPerformanceRating(engineer)
                  return (
                    <div 
                      key={engineer.memberId} 
                      className="bg-gray-700/50 rounded-lg p-5 border border-gray-600"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-semibold text-white">{engineer.name}</h4>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${rating.color}`}>
                          {rating.label}
                        </span>
                      </div>
                      
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-400">Total Hours</span>
                            <span className="text-white font-medium">{engineer.totalHours.toFixed(1)}h</span>
                          </div>
                          <div className="h-2 bg-gray-600 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${Math.min((engineer.totalHours / Math.max(...engineerAnalytics.map(e => e.totalHours))) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                        
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-400">Billable %</span>
                            <span className="text-white font-medium">{engineer.billablePercent.toFixed(0)}%</span>
                          </div>
                          <div className="h-2 bg-gray-600 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                engineer.billablePercent >= 70 ? 'bg-green-500' :
                                engineer.billablePercent >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${engineer.billablePercent}%` }}
                            />
                          </div>
                        </div>
                        
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-400">Notes Quality</span>
                            <span className="text-white font-medium">{engineer.notesPercent.toFixed(0)}%</span>
                          </div>
                          <div className="h-2 bg-gray-600 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                engineer.notesPercent >= 80 ? 'bg-purple-500' :
                                engineer.notesPercent >= 50 ? 'bg-purple-400' : 'bg-purple-300'
                              }`}
                              style={{ width: `${engineer.notesPercent}%` }}
                            />
                          </div>
                        </div>
                        
                        <div className="pt-2 border-t border-gray-600 grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-gray-400">Avg Hours/Day</p>
                            <p className="text-lg font-semibold text-white">{engineer.avgHoursPerDay.toFixed(1)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Days Worked</p>
                            <p className="text-lg font-semibold text-white">{engineer.daysWorked}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* AI Analysis Section */}
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-white">
                🤖 AI Performance Insights
              </h3>
              <button
                onClick={generateAIAnalysis}
                disabled={isGeneratingAnalysis || engineerAnalytics.length === 0}
                className={`px-5 py-2.5 rounded-lg font-medium transition-all ${
                  isGeneratingAnalysis || engineerAnalytics.length === 0
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl'
                }`}
              >
                {isGeneratingAnalysis ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">⏳</span> Analyzing...
                  </span>
                ) : (
                  '✨ Generate AI Analysis'
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
                  Get AI-powered insights about {selectedEngineer ? `${selectedEngineer.firstName}'s` : 'your team\'s'} performance
                </p>
                <p className="text-gray-500 text-sm">
                  Click "Generate AI Analysis" for personalized recommendations and performance assessment
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
