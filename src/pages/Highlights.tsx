import { useMemo, useState, useEffect } from 'react'
import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useTicketsStore } from '@/stores/ticketsStore'
import { api } from '@/lib/api'

interface Achievement {
  icon: string
  title: string
  description: string
  value: string | number
  color: string
}

export default function Highlights() {
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { members } = useMembersStore()
  const { entries, fetchTimeEntries } = useTimeEntriesStore()
  const { tickets, fetchTickets } = useTicketsStore()
  const [isGeneratingHighlights, setIsGeneratingHighlights] = useState(false)
  const [aiHighlights, setAiHighlights] = useState<string | null>(null)
  const [highlightError, setHighlightError] = useState<string | null>(null)

  const selectedEngineer = selectedEngineerId 
    ? members.find(m => m.id === selectedEngineerId)
    : null

  useEffect(() => {
    fetchTickets()
    // Fetch time entries if not loaded (3 years for full highlights)
    if (entries.length === 0) {
      const end = new Date()
      const start = new Date()
      start.setFullYear(start.getFullYear() - 3)
      fetchTimeEntries({
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
      })
    }
  }, []) // Only on mount

  // Filter entries based on selected engineer
  const filteredEntries = useMemo(() => {
    if (selectedEngineerId === null) return entries
    return entries.filter(e => e.memberId === selectedEngineerId)
  }, [entries, selectedEngineerId])

  // Calculate achievements/highlights
  const achievements = useMemo((): Achievement[] => {
    const totalHours = filteredEntries.reduce((sum, e) => sum + e.hours, 0)
    const billableHours = filteredEntries
      .filter(e => e.billableOption === 'Billable')
      .reduce((sum, e) => sum + e.hours, 0)
    const billablePercent = totalHours > 0 ? (billableHours / totalHours) * 100 : 0
    
    const withNotes = filteredEntries.filter(e => e.notes && e.notes.trim().length > 0)
    const notesPercent = filteredEntries.length > 0 
      ? (withNotes.length / filteredEntries.length) * 100 
      : 0
    
    const uniqueTicketIds = new Set(filteredEntries.filter(e => e.ticketId).map(e => e.ticketId))
    const ticketCount = uniqueTicketIds.size
    
    // Get closed tickets worked on
    const workedTickets = tickets.filter(t => uniqueTicketIds.has(t.id))
    const closedTickets = workedTickets.filter(t => t.closedFlag)
    
    // Find longest note
    const longestNote = withNotes.reduce((longest, e) => {
      return (e.notes?.length || 0) > (longest?.notes?.length || 0) ? e : longest
    }, withNotes[0])
    
    // Calculate busiest day
    const hoursByDate: Record<string, number> = {}
    filteredEntries.forEach(e => {
      const date = new Date(e.dateStart).toLocaleDateString()
      hoursByDate[date] = (hoursByDate[date] || 0) + e.hours
    })
    const busiestDay = Object.entries(hoursByDate).reduce(
      (max, [date, hours]) => hours > max.hours ? { date, hours } : max,
      { date: '', hours: 0 }
    )
    
    // Calculate streak (consecutive days with entries)
    const sortedDates = [...new Set(filteredEntries.map(e => 
      new Date(e.dateStart).toDateString()
    ))].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    
    let maxStreak = 0
    let currentStreak = 1
    for (let i = 1; i < sortedDates.length; i++) {
      const prevDate = new Date(sortedDates[i - 1])
      const currDate = new Date(sortedDates[i])
      const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      if (diffDays === 1) {
        currentStreak++
        maxStreak = Math.max(maxStreak, currentStreak)
      } else {
        currentStreak = 1
      }
    }
    maxStreak = Math.max(maxStreak, currentStreak)

    const achievements: Achievement[] = []

    // Total Hours Achievement
    if (totalHours > 0) {
      achievements.push({
        icon: '⏱️',
        title: 'Time Champion',
        description: 'Total hours logged',
        value: `${totalHours.toFixed(0)}h`,
        color: 'from-blue-500 to-blue-600',
      })
    }

    // Billable Excellence
    if (billablePercent >= 70) {
      achievements.push({
        icon: '💰',
        title: 'Billable Excellence',
        description: 'Outstanding billable ratio',
        value: `${billablePercent.toFixed(0)}%`,
        color: 'from-green-500 to-emerald-600',
      })
    } else if (billablePercent > 0) {
      achievements.push({
        icon: '💵',
        title: 'Revenue Generator',
        description: 'Billable work ratio',
        value: `${billablePercent.toFixed(0)}%`,
        color: 'from-green-400 to-green-500',
      })
    }

    // Ticket Master
    if (ticketCount > 0) {
      achievements.push({
        icon: '🎫',
        title: 'Ticket Master',
        description: 'Unique tickets worked',
        value: ticketCount,
        color: 'from-purple-500 to-purple-600',
      })
    }

    // Problem Solver
    if (closedTickets.length > 0) {
      achievements.push({
        icon: '✅',
        title: 'Problem Solver',
        description: 'Tickets resolved',
        value: closedTickets.length,
        color: 'from-emerald-500 to-teal-600',
      })
    }

    // Documentation Hero
    if (notesPercent >= 80) {
      achievements.push({
        icon: '📝',
        title: 'Documentation Hero',
        description: 'Entries with notes',
        value: `${notesPercent.toFixed(0)}%`,
        color: 'from-indigo-500 to-indigo-600',
      })
    } else if (notesPercent >= 50) {
      achievements.push({
        icon: '📄',
        title: 'Note Taker',
        description: 'Entries with notes',
        value: `${notesPercent.toFixed(0)}%`,
        color: 'from-indigo-400 to-indigo-500',
      })
    }

    // Busiest Day
    if (busiestDay.hours > 0) {
      achievements.push({
        icon: '🔥',
        title: 'Power Day',
        description: `Most productive day (${busiestDay.date})`,
        value: `${busiestDay.hours.toFixed(1)}h`,
        color: 'from-orange-500 to-red-500',
      })
    }

    // Streak Achievement
    if (maxStreak >= 5) {
      achievements.push({
        icon: '⚡',
        title: 'Consistency King',
        description: 'Longest work streak',
        value: `${maxStreak} days`,
        color: 'from-yellow-500 to-amber-500',
      })
    }

    // Entry Count
    if (filteredEntries.length > 0) {
      achievements.push({
        icon: '📊',
        title: 'Time Tracker',
        description: 'Total time entries',
        value: filteredEntries.length,
        color: 'from-cyan-500 to-cyan-600',
      })
    }

    // Longest Note
    if (longestNote && longestNote.notes && longestNote.notes.length > 200) {
      achievements.push({
        icon: '📚',
        title: 'Detail Oriented',
        description: 'Longest documentation',
        value: `${longestNote.notes.length} chars`,
        color: 'from-pink-500 to-rose-500',
      })
    }

    return achievements
  }, [filteredEntries, tickets])

  // Calculate fun stats
  const funStats = useMemo(() => {
    const totalHours = filteredEntries.reduce((sum, e) => sum + e.hours, 0)
    const coffees = Math.round(totalHours / 2) // Assume 1 coffee per 2 hours
    const meetings = Math.round(totalHours / 8) // Assume 1 meeting per day
    const keystrokes = Math.round(totalHours * 3000) // Rough estimate

    return { coffees, meetings, keystrokes, totalHours }
  }, [filteredEntries])

  // Generate AI highlights
  const generateAIHighlights = async () => {
    setIsGeneratingHighlights(true)
    setHighlightError(null)
    
    try {
      const stats = {
        totalHours: filteredEntries.reduce((sum, e) => sum + e.hours, 0),
        billableHours: filteredEntries.filter(e => e.billableOption === 'Billable')
          .reduce((sum, e) => sum + e.hours, 0),
        entryCount: filteredEntries.length,
        ticketCount: new Set(filteredEntries.filter(e => e.ticketId).map(e => e.ticketId)).size,
        notesCount: filteredEntries.filter(e => e.notes && e.notes.trim().length > 0).length,
        achievements: achievements.map(a => `${a.title}: ${a.value}`),
      }

      const member = selectedEngineer || { firstName: 'Team', lastName: '' }
      
      const response = await api.generateAnalysis('cwWrapped', {
        member,
        stats,
        year: new Date().getFullYear(),
      })
      
      setAiHighlights(response.analysis)
    } catch (error: any) {
      console.error('Error generating highlights:', error)
      setHighlightError(error.message || 'Failed to generate highlights')
    } finally {
      setIsGeneratingHighlights(false)
    }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">
          ✨ Highlights & Achievements
        </h2>
        <p className="text-gray-400">
          {selectedEngineer 
            ? `Celebrating ${selectedEngineer.firstName} ${selectedEngineer.lastName}'s accomplishments`
            : 'Celebrating team accomplishments'}
        </p>
      </div>

      {/* Fun Stats Banner */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-blue-900 rounded-xl p-6 mb-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Ccircle%20cx%3D%221%22%20cy%3D%221%22%20r%3D%221%22%20fill%3D%22rgba(255%2C255%2C255%2C0.1)%22%2F%3E%3C%2Fsvg%3E')] opacity-30"></div>
        <div className="relative z-10">
          <h3 className="text-2xl font-bold text-white mb-4">🎉 Your Year in Numbers</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-4xl font-bold text-white">{funStats.totalHours.toFixed(0)}</p>
              <p className="text-purple-200">Hours Logged ⏰</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-white">{funStats.coffees}</p>
              <p className="text-purple-200">Coffees Consumed ☕</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-white">{funStats.meetings}</p>
              <p className="text-purple-200">Days of Work 📅</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-white">{(funStats.keystrokes / 1000).toFixed(0)}k</p>
              <p className="text-purple-200">Est. Keystrokes ⌨️</p>
            </div>
          </div>
        </div>
      </div>

      {/* Achievements Grid */}
      {achievements.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {achievements.map((achievement, index) => (
            <div 
              key={index}
              className={`bg-gradient-to-br ${achievement.color} rounded-xl p-6 transform hover:scale-105 transition-transform duration-200 shadow-lg`}
            >
              <div className="flex items-start justify-between">
                <span className="text-4xl">{achievement.icon}</span>
                <span className="text-3xl font-bold text-white">{achievement.value}</span>
              </div>
              <h3 className="text-xl font-bold text-white mt-4">{achievement.title}</h3>
              <p className="text-white/80 text-sm mt-1">{achievement.description}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg p-12 text-center mb-6">
          <p className="text-gray-400 text-lg">
            No achievements yet. Start logging time to earn badges!
          </p>
        </div>
      )}

      {/* Top Performers (when no engineer selected) */}
      {selectedEngineerId === null && members.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h3 className="text-xl font-semibold text-white mb-4">🏆 Top Performers</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Most Hours */}
            {(() => {
              const memberHours = members.map(m => ({
                ...m,
                hours: entries.filter(e => e.memberId === m.id).reduce((sum, e) => sum + e.hours, 0)
              })).sort((a, b) => b.hours - a.hours)
              const top = memberHours[0]
              if (!top || top.hours === 0) return null
              return (
                <div className="bg-gradient-to-br from-yellow-500 to-amber-600 rounded-lg p-4">
                  <p className="text-yellow-100 text-sm">Most Hours</p>
                  <p className="text-white text-xl font-bold">{top.firstName} {top.lastName}</p>
                  <p className="text-yellow-100 text-2xl font-bold mt-2">{top.hours.toFixed(0)}h</p>
                </div>
              )
            })()}
            
            {/* Best Billable */}
            {(() => {
              const memberBillable = members.map(m => {
                const memberEntries = entries.filter(e => e.memberId === m.id)
                const total = memberEntries.reduce((sum, e) => sum + e.hours, 0)
                const billable = memberEntries.filter(e => e.billableOption === 'Billable')
                  .reduce((sum, e) => sum + e.hours, 0)
                return { ...m, percent: total > 0 ? (billable / total) * 100 : 0, total }
              }).filter(m => m.total > 10).sort((a, b) => b.percent - a.percent)
              const top = memberBillable[0]
              if (!top) return null
              return (
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg p-4">
                  <p className="text-green-100 text-sm">Best Billable %</p>
                  <p className="text-white text-xl font-bold">{top.firstName} {top.lastName}</p>
                  <p className="text-green-100 text-2xl font-bold mt-2">{top.percent.toFixed(0)}%</p>
                </div>
              )
            })()}
            
            {/* Best Notes */}
            {(() => {
              const memberNotes = members.map(m => {
                const memberEntries = entries.filter(e => e.memberId === m.id)
                const withNotes = memberEntries.filter(e => e.notes && e.notes.trim().length > 0).length
                return { ...m, percent: memberEntries.length > 0 ? (withNotes / memberEntries.length) * 100 : 0, total: memberEntries.length }
              }).filter(m => m.total > 10).sort((a, b) => b.percent - a.percent)
              const top = memberNotes[0]
              if (!top) return null
              return (
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg p-4">
                  <p className="text-indigo-100 text-sm">Best Documentation</p>
                  <p className="text-white text-xl font-bold">{top.firstName} {top.lastName}</p>
                  <p className="text-indigo-100 text-2xl font-bold mt-2">{top.percent.toFixed(0)}%</p>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* AI Generated Highlights */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">🤖 AI-Powered Summary</h3>
          <button
            onClick={generateAIHighlights}
            disabled={isGeneratingHighlights}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isGeneratingHighlights
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white'
            }`}
          >
            {isGeneratingHighlights ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">✨</span> Creating your story...
              </span>
            ) : (
              '✨ Generate Wrapped Summary'
            )}
          </button>
        </div>
        
        {highlightError && (
          <div className="bg-red-600/20 border border-red-500 rounded-lg p-4 mb-4">
            <p className="text-red-400">{highlightError}</p>
          </div>
        )}
        
        {aiHighlights ? (
          <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-lg p-6">
            <div className="whitespace-pre-wrap text-gray-200 leading-relaxed text-lg">
              {aiHighlights}
            </div>
          </div>
        ) : (
          <p className="text-gray-400">
            Click the button to generate a personalized AI summary of your achievements!
          </p>
        )}
      </div>
    </div>
  )
}
