import { useMemo, useState, useEffect } from 'react'
import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useTicketsStore } from '@/stores/ticketsStore'
import { api } from '@/lib/api'

interface CategoryScore {
  name: string
  score: number
  maxScore: number
  icon: string
  color: string
  issues: string[]
  recommendations: string[]
}

export default function PerformanceReview() {
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { members } = useMembersStore()
  const { entries, fetchTimeEntries } = useTimeEntriesStore()
  const { tickets, fetchTickets } = useTicketsStore()
  const [isGeneratingReview, setIsGeneratingReview] = useState(false)
  const [aiReview, setAiReview] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewPeriod, setReviewPeriod] = useState<'30d' | '90d' | '6m' | '1y'>('90d')

  const selectedEngineer = selectedEngineerId 
    ? members.find(m => m.id === selectedEngineerId)
    : null

  useEffect(() => {
    fetchTickets()
    // Fetch time entries if not loaded (90 days for review)
    if (entries.length === 0) {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 90)
      fetchTimeEntries({
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
      })
    }
  }, []) // Only on mount

  // Calculate date range for review period
  const dateRange = useMemo(() => {
    const end = new Date()
    const start = new Date()
    
    switch (reviewPeriod) {
      case '30d': start.setDate(start.getDate() - 30); break
      case '90d': start.setDate(start.getDate() - 90); break
      case '6m': start.setMonth(start.getMonth() - 6); break
      case '1y': start.setFullYear(start.getFullYear() - 1); break
    }
    
    return { start, end }
  }, [reviewPeriod])

  // Filter entries by engineer and date range
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

  // Calculate performance scores
  const categoryScores = useMemo((): CategoryScore[] => {
    const totalHours = filteredEntries.reduce((sum, e) => sum + e.hours, 0)
    const billableHours = filteredEntries
      .filter(e => e.billableOption === 'Billable')
      .reduce((sum, e) => sum + e.hours, 0)
    const billablePercent = totalHours > 0 ? (billableHours / totalHours) * 100 : 0
    
    const withNotes = filteredEntries.filter(e => e.notes && e.notes.trim().length > 0)
    const notesPercent = filteredEntries.length > 0 
      ? (withNotes.length / filteredEntries.length) * 100 
      : 0
    
    // Average note length for entries with notes
    const avgNoteLength = withNotes.length > 0
      ? withNotes.reduce((sum, e) => sum + (e.notes?.length || 0), 0) / withNotes.length
      : 0
    
    // Tickets worked on
    const uniqueTicketIds = new Set(filteredEntries.filter(e => e.ticketId).map(e => e.ticketId))
    const workedTickets = tickets.filter(t => uniqueTicketIds.has(t.id))
    const closedTickets = workedTickets.filter(t => t.closedFlag)
    
    // Calculate days in period
    const daysInPeriod = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24))
    const avgHoursPerDay = totalHours / daysInPeriod

    const scores: CategoryScore[] = []

    // Time Tracking Score
    const timeTrackingScore = Math.min(100, Math.round(
      (avgHoursPerDay >= 6 ? 40 : (avgHoursPerDay / 6) * 40) + // 40 points for avg 6+ hours/day
      (filteredEntries.length >= daysInPeriod * 0.7 ? 30 : (filteredEntries.length / (daysInPeriod * 0.7)) * 30) + // 30 points for consistency
      (totalHours > 0 ? 30 : 0) // 30 points for any tracking
    ))
    
    const timeIssues: string[] = []
    const timeRecommendations: string[] = []
    if (avgHoursPerDay < 6) {
      timeIssues.push(`Average ${avgHoursPerDay.toFixed(1)} hours/day is below target`)
      timeRecommendations.push('Aim for at least 6 hours of tracked time per day')
    }
    if (filteredEntries.length < daysInPeriod * 0.5) {
      timeIssues.push('Inconsistent time tracking detected')
      timeRecommendations.push('Track time daily to improve consistency metrics')
    }
    
    scores.push({
      name: 'Time Tracking',
      score: timeTrackingScore,
      maxScore: 100,
      icon: '⏱️',
      color: 'blue',
      issues: timeIssues,
      recommendations: timeRecommendations,
    })

    // Notes Quality Score
    const notesScore = Math.min(100, Math.round(
      (notesPercent >= 90 ? 50 : (notesPercent / 90) * 50) + // 50 points for 90%+ entries with notes
      (avgNoteLength >= 50 ? 30 : (avgNoteLength / 50) * 30) + // 30 points for avg 50+ char notes
      (avgNoteLength >= 100 ? 20 : (avgNoteLength / 100) * 20) // 20 bonus for detailed notes
    ))
    
    const notesIssues: string[] = []
    const notesRecommendations: string[] = []
    if (notesPercent < 80) {
      notesIssues.push(`Only ${notesPercent.toFixed(0)}% of entries have notes`)
      notesRecommendations.push('Add notes to all time entries to improve documentation')
    }
    if (avgNoteLength < 30) {
      notesIssues.push('Notes are too brief on average')
      notesRecommendations.push('Include more detail: what was done, why, and any blockers')
    }
    
    scores.push({
      name: 'Notes Quality',
      score: notesScore,
      maxScore: 100,
      icon: '📝',
      color: 'purple',
      issues: notesIssues,
      recommendations: notesRecommendations,
    })

    // Billability Score
    const billabilityScore = Math.min(100, Math.round(
      billablePercent >= 70 ? 100 :
      billablePercent >= 60 ? 80 :
      billablePercent >= 50 ? 60 :
      (billablePercent / 50) * 60
    ))
    
    const billIssues: string[] = []
    const billRecommendations: string[] = []
    if (billablePercent < 70) {
      billIssues.push(`Billable ratio of ${billablePercent.toFixed(0)}% is below target`)
      billRecommendations.push('Focus on maximizing billable work where possible')
    }
    if (billablePercent < 50) {
      billRecommendations.push('Review non-billable activities for efficiency improvements')
    }
    
    scores.push({
      name: 'Billability',
      score: billabilityScore,
      maxScore: 100,
      icon: '💰',
      color: 'green',
      issues: billIssues,
      recommendations: billRecommendations,
    })

    // Productivity Score
    const ticketResolutionRate = workedTickets.length > 0 
      ? (closedTickets.length / workedTickets.length) * 100 
      : 0
    
    const productivityScore = Math.min(100, Math.round(
      (uniqueTicketIds.size >= 20 ? 40 : (uniqueTicketIds.size / 20) * 40) + // 40 points for ticket volume
      (ticketResolutionRate >= 70 ? 40 : (ticketResolutionRate / 70) * 40) + // 40 points for resolution rate
      (closedTickets.length >= 10 ? 20 : (closedTickets.length / 10) * 20) // 20 points for absolute closures
    ))
    
    const prodIssues: string[] = []
    const prodRecommendations: string[] = []
    if (uniqueTicketIds.size < 10) {
      prodIssues.push('Low ticket engagement')
      prodRecommendations.push('Ensure time entries are linked to tickets')
    }
    if (ticketResolutionRate < 50) {
      prodIssues.push('Low ticket resolution rate')
      prodRecommendations.push('Focus on closing out open tickets before starting new work')
    }
    
    scores.push({
      name: 'Productivity',
      score: productivityScore,
      maxScore: 100,
      icon: '🚀',
      color: 'orange',
      issues: prodIssues,
      recommendations: prodRecommendations,
    })

    return scores
  }, [filteredEntries, tickets, dateRange])

  // Calculate overall score
  const overallScore = useMemo(() => {
    if (categoryScores.length === 0) return 0
    return Math.round(
      categoryScores.reduce((sum, cat) => sum + cat.score, 0) / categoryScores.length
    )
  }, [categoryScores])

  // Get score color
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400'
    if (score >= 60) return 'text-yellow-400'
    if (score >= 40) return 'text-orange-400'
    return 'text-red-400'
  }

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'from-green-500 to-emerald-600'
    if (score >= 60) return 'from-yellow-500 to-amber-600'
    if (score >= 40) return 'from-orange-500 to-orange-600'
    return 'from-red-500 to-red-600'
  }

  // Generate AI Review
  const generateAIReview = async () => {
    if (!selectedEngineer) return
    
    setIsGeneratingReview(true)
    setReviewError(null)
    
    try {
      const response = await api.generateAnalysis('mspStandardsReview', {
        member: selectedEngineer,
        entries: filteredEntries.slice(0, 50), // Limit for API
        tickets: tickets.filter(t => 
          filteredEntries.some(e => e.ticketId === t.id)
        ).slice(0, 20),
        period: {
          start: dateRange.start,
          end: dateRange.end,
        },
      })
      
      setAiReview(response.analysis)
    } catch (error: any) {
      console.error('Error generating review:', error)
      setReviewError(error.message || 'Failed to generate review')
    } finally {
      setIsGeneratingReview(false)
    }
  }

  if (selectedEngineerId === null) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-white mb-2">Performance Review</h2>
          <p className="text-gray-400">
            Select an engineer from the sidebar to view their performance review
          </p>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-12 text-center">
          <p className="text-6xl mb-4">👤</p>
          <p className="text-gray-400 text-lg">
            Please select an engineer to view their performance review
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">Performance Review</h2>
        <p className="text-gray-400">
          Performance evaluation for {selectedEngineer?.firstName} {selectedEngineer?.lastName}
        </p>
      </div>

      {/* Review Period Selector */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <div className="flex items-center gap-4">
          <span className="text-gray-400">Review Period:</span>
          <div className="flex gap-2">
            {(['30d', '90d', '6m', '1y'] as const).map(period => (
              <button
                key={period}
                onClick={() => setReviewPeriod(period)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  reviewPeriod === period
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {period === '30d' ? 'Last 30 Days' :
                 period === '90d' ? 'Last Quarter' :
                 period === '6m' ? 'Last 6 Months' :
                 'Last Year'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Overall Score */}
      <div className={`bg-gradient-to-br ${getScoreBgColor(overallScore)} rounded-xl p-8 mb-6 text-center`}>
        <p className="text-white/80 text-lg mb-2">Overall Performance Score</p>
        <p className="text-7xl font-bold text-white mb-2">{overallScore}</p>
        <p className="text-white/80">
          {overallScore >= 80 ? 'Excellent Performance! 🌟' :
           overallScore >= 60 ? 'Good Performance 👍' :
           overallScore >= 40 ? 'Needs Improvement 📈' :
           'Requires Attention ⚠️'}
        </p>
      </div>

      {/* Category Scores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {categoryScores.map((category) => (
          <div key={category.name} className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{category.icon}</span>
                <h3 className="text-lg font-semibold text-white">{category.name}</h3>
              </div>
              <span className={`text-3xl font-bold ${getScoreColor(category.score)}`}>
                {category.score}
              </span>
            </div>
            
            {/* Progress Bar */}
            <div className="h-3 bg-gray-700 rounded-full mb-4 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  category.score >= 80 ? 'bg-green-500' :
                  category.score >= 60 ? 'bg-yellow-500' :
                  category.score >= 40 ? 'bg-orange-500' :
                  'bg-red-500'
                }`}
                style={{ width: `${category.score}%` }}
              />
            </div>
            
            {/* Issues */}
            {category.issues.length > 0 && (
              <div className="mb-3">
                <p className="text-sm text-gray-400 mb-1">Issues:</p>
                <ul className="space-y-1">
                  {category.issues.map((issue, i) => (
                    <li key={i} className="text-sm text-red-400 flex items-start gap-2">
                      <span>•</span> {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Recommendations */}
            {category.recommendations.length > 0 && (
              <div>
                <p className="text-sm text-gray-400 mb-1">Recommendations:</p>
                <ul className="space-y-1">
                  {category.recommendations.map((rec, i) => (
                    <li key={i} className="text-sm text-blue-400 flex items-start gap-2">
                      <span>💡</span> {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {category.issues.length === 0 && category.recommendations.length === 0 && (
              <p className="text-sm text-green-400">✓ Meeting expectations</p>
            )}
          </div>
        ))}
      </div>

      {/* AI Review */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">🤖 AI Performance Analysis</h3>
          <button
            onClick={generateAIReview}
            disabled={isGeneratingReview}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isGeneratingReview
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isGeneratingReview ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span> Analyzing...
              </span>
            ) : (
              'Generate Detailed Review'
            )}
          </button>
        </div>
        
        {reviewError && (
          <div className="bg-red-600/20 border border-red-500 rounded-lg p-4 mb-4">
            <p className="text-red-400">{reviewError}</p>
          </div>
        )}
        
        {aiReview ? (
          <div className="bg-gray-700 rounded-lg p-6">
            <div className="whitespace-pre-wrap text-gray-200 leading-relaxed">
              {aiReview}
            </div>
          </div>
        ) : (
          <p className="text-gray-400">
            Click "Generate Detailed Review" for an AI-powered comprehensive analysis with specific recommendations
          </p>
        )}
      </div>
    </div>
  )
}
