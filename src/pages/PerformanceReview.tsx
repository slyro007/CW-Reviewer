import { useMemo, useState, useEffect } from 'react'
import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useTicketsStore } from '@/stores/ticketsStore'
import { useTimePeriodStore } from '@/stores/timePeriodStore'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip
} from 'recharts'

interface AIAnalysisResult {
  summary: string
  scores: {
    timeTracking: number
    notesQuality: number
    billability: number
    productivity: number
    overall: number
  }
  strengths: string[]
  weaknesses: string[]
  recommendations: string[]
  actionPlan: Array<{ step: string; priority: 'High' | 'Medium' | 'Low' }>
}

export default function PerformanceReview() {
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { members } = useMembersStore()
  const { entries, fetchTimeEntries } = useTimeEntriesStore()
  const { tickets, fetchTickets } = useTicketsStore()
  const { getDateRange, getPeriodLabel } = useTimePeriodStore()
  const [isGeneratingReview, setIsGeneratingReview] = useState(false)
  const [aiReview, setAiReview] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [parsedAnalysis, setParsedAnalysis] = useState<AIAnalysisResult | null>(null)

  const dateRange = getDateRange()
  const periodLabel = getPeriodLabel()

  const selectedEngineer = selectedEngineerId
    ? members.find(m => m.id === selectedEngineerId)
    : null

  useEffect(() => {
    fetchTickets()
    fetchTimeEntries({
      startDate: format(dateRange.start, 'yyyy-MM-dd'),
      endDate: format(dateRange.end, 'yyyy-MM-dd'),
    })
  }, [dateRange.start.getTime(), dateRange.end.getTime()])

  // Filter entries
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


  // Generate AI Review
  const generateAIReview = async () => {
    if (!selectedEngineer) return

    setIsGeneratingReview(true)
    setReviewError(null)
    setParsedAnalysis(null)

    try {
      const response = await api.generateAnalysis('mspStandardsReview', {
        member: selectedEngineer,
        entries: filteredEntries.slice(0, 50),
        tickets: tickets.filter(t =>
          filteredEntries.some(e => e.ticketId === t.id)
        ).slice(0, 20),
        period: {
          start: dateRange.start,
          end: dateRange.end,
        },
      }, { json: true, model: 'gpt-3.5-turbo-1106' }) // Explicitly request JSON

      setAiReview(response.analysis)

      // Attempt generic Parse
      try {
        const parsed = JSON.parse(response.analysis)
        setParsedAnalysis(parsed)
      } catch (e) {
        console.warn('AI Output was not valid JSON', e)
      }

    } catch (error: any) {
      console.error('Error generating review:', error)
      setReviewError(error.message || 'Failed to generate review')
    } finally {
      setIsGeneratingReview(false)
    }
  }

  // Radar Data
  const radarData = useMemo(() => {
    if (!parsedAnalysis?.scores) return []
    return [
      { subject: 'Time Tracking', A: parsedAnalysis.scores.timeTracking, fullMark: 100 },
      { subject: 'Notes Quality', A: parsedAnalysis.scores.notesQuality, fullMark: 100 },
      { subject: 'Billability', A: parsedAnalysis.scores.billability, fullMark: 100 },
      { subject: 'Productivity', A: parsedAnalysis.scores.productivity, fullMark: 100 },
      { subject: 'Overall', A: parsedAnalysis.scores.overall, fullMark: 100 },
    ]
  }, [parsedAnalysis])

  if (selectedEngineerId === null) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="bg-gray-800 rounded-lg p-12 text-center">
          <h2 className="text-xl font-bold text-gray-300 mb-2">Performance Review</h2>
          <p className="text-gray-400">Please select an engineer to view analysis.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Performance Intelligence</h2>
          <p className="text-gray-400">
            Deep analysis for {selectedEngineer?.firstName} {selectedEngineer?.lastName}
            {' • '}<span className="text-blue-400">{periodLabel}</span>
          </p>
        </div>

        <button
          onClick={generateAIReview}
          disabled={isGeneratingReview}
          className={`px-6 py-3 rounded-lg font-medium transition-all shadow-lg flex items-center gap-2 ${isGeneratingReview
            ? 'bg-gray-700 text-gray-400 cursor-wait'
            : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white hover:scale-105'
            }`}
        >
          {isGeneratingReview ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Running Analysis...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Generate AI Analysis
            </>
          )}
        </button>
      </div>

      {reviewError && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 mb-6 text-red-400">
          {reviewError}
        </div>
      )}

      {/* Main Analysis Content */}
      {parsedAnalysis ? (
        <div className="space-y-6 animate-in fade-in duration-500">

          {/* Top Row: Chart + Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Radar Chart */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-xl col-span-1">
              <h3 className="text-lg font-semibold text-gray-200 mb-4 text-center">Competency Matrix</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                    <PolarGrid stroke="#374151" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#4B5563" />
                    <Radar
                      name="Score"
                      dataKey="A"
                      stroke="#8B5CF6"
                      strokeWidth={3}
                      fill="#8B5CF6"
                      fillOpacity={0.3}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }}
                      itemStyle={{ color: '#A78BFA' }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Executive Summary */}
            <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 shadow-xl col-span-1 lg:col-span-2 flex flex-col justify-center">
              <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-400 mb-6">
                Executive Summary
              </h3>
              <p className="text-gray-300 text-lg leading-relaxed whitespace-pre-wrap">
                {parsedAnalysis.summary}
              </p>
            </div>
          </div>

          {/* Middle Row: Strengths vs Weaknesses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-800/50 rounded-xl p-6 border border-green-900/30">
              <h3 className="text-lg font-semibold text-green-400 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Key Strengths
              </h3>
              <ul className="space-y-3">
                {parsedAnalysis.strengths.map((str, i) => (
                  <li key={i} className="flex gap-3 text-gray-300 bg-gray-900/50 p-3 rounded-lg">
                    <span className="text-green-500 font-bold">•</span>
                    {str}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-6 border border-red-900/30">
              <h3 className="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                Areas for Improvement
              </h3>
              <ul className="space-y-3">
                {parsedAnalysis.weaknesses.map((weak, i) => (
                  <li key={i} className="flex gap-3 text-gray-300 bg-gray-900/50 p-3 rounded-lg">
                    <span className="text-red-500 font-bold">•</span>
                    {weak}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Action Plan */}
          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              Strategic Action Plan
            </h3>
            <div className="space-y-4">
              {parsedAnalysis.actionPlan.map((action, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-4 items-start sm:items-center bg-gray-900/40 p-4 rounded-lg border border-gray-700/50 hover:bg-gray-900/60 transition-colors">
                  <div className={`
                                px-3 py-1 rounded text-xs font-bold uppercase tracking-wider
                                ${action.priority === 'High' ? 'bg-red-500/20 text-red-400' :
                      action.priority === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-blue-500/20 text-blue-400'}
                            `}>
                    {action.priority} Priority
                  </div>
                  <p className="text-gray-200 font-medium flex-1">{action.step}</p>
                  <div className="w-6 h-6 rounded-full border-2 border-gray-600 flex items-center justify-center">
                    <span className="text-gray-600 text-xs">{i + 1}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      ) : (
        /* Fallback / Initial State */
        <div className="grid grid-cols-1 gap-6">
          {!aiReview && (
            <div className="bg-gray-800/50 border-2 border-dashed border-gray-700 rounded-xl p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
              <div className="w-20 h-20 bg-gray-700/50 rounded-full flex items-center justify-center mb-6">
                <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <h3 className="text-xl font-medium text-gray-300 mb-2">Ready to Analyze</h3>
              <p className="text-gray-500 max-w-md">
                Click "Generate AI Analysis" to process time entries and ticket data using GPT. The analysis provides deep insights, calculating proprietary scores and identifying behavioral patterns.
              </p>
            </div>
          )}

          {/* Raw Output Fallback (In case JSON parse fails but we have review) */}
          {aiReview && !parsedAnalysis && (
            <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
              <h3 className="text-xl font-bold text-white mb-4">Analysis Result</h3>
              <div className="whitespace-pre-wrap text-gray-300 leading-relaxed font-mono text-sm bg-gray-900 p-6 rounded-lg">
                {aiReview}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
