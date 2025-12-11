import { useMemo, useState, useEffect } from 'react'
import { useSelectedEngineerStore, TEAM_DEFINITIONS } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useTicketsStore } from '@/stores/ticketsStore'
import { useProjectsStore } from '@/stores/projectsStore'
import { useTimePeriodStore } from '@/stores/timePeriodStore'
import DataSourceFilter, { useDataSources } from '@/components/DataSourceFilter'
import { api } from '@/lib/api'
import { format } from 'date-fns'

interface Achievement {
  title: string
  description: string
  value: string | number
  color: string
  source: 'time' | 'serviceDesk' | 'projects'
}

interface AIWrappedResult {
  title: string
  opening: string
  topAchievements: Array<{ emoji: string; text: string }>
  funStats: Array<{ label: string; value: string; comment: string }>
  closing: string
}

export default function Highlights() {
  const { selectedEngineerId, selectedTeam } = useSelectedEngineerStore()
  const { members } = useMembersStore()
  const { entries, fetchTimeEntries } = useTimeEntriesStore()
  const { serviceTickets, fetchServiceBoardTickets } = useTicketsStore()
  const { projects, projectTickets, fetchProjects, fetchProjectTickets } = useProjectsStore()
  const { getDateRange, getPeriodLabel } = useTimePeriodStore()

  const { dataSources, setDataSources, includesServiceDesk, includesProjects } = useDataSources()
  const [isGeneratingHighlights, setIsGeneratingHighlights] = useState(false)
  const [aiHighlights, setAiHighlights] = useState<string | null>(null)
  const [highlightError, setHighlightError] = useState<string | null>(null)
  const [parsedWrapped, setParsedWrapped] = useState<AIWrappedResult | null>(null)

  const dateRange = getDateRange()
  const periodLabel = getPeriodLabel()
  const selectedEngineer = selectedEngineerId ? members.find(m => m.id === selectedEngineerId) : null

  // Fetch static data once on mount (tickets and projects don't depend on date range)
  useEffect(() => {
    fetchServiceBoardTickets()
    fetchProjects()
    fetchProjectTickets()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch time entries when date range changes
  useEffect(() => {
    fetchTimeEntries({ startDate: format(dateRange.start, 'yyyy-MM-dd'), endDate: format(dateRange.end, 'yyyy-MM-dd') })
  }, [dateRange.start.getTime(), dateRange.end.getTime(), fetchTimeEntries])

  // Filter entries
  const filteredEntries = useMemo(() => {
    let result = entries.filter(e => {
      const entryDate = new Date(e.dateStart)
      return entryDate >= dateRange.start && entryDate <= dateRange.end
    })
    if (selectedEngineerId !== null) {
      result = result.filter(e => e.memberId === selectedEngineerId)
    } else if (selectedTeam !== 'All Company') {
      const teamIdentifiers = TEAM_DEFINITIONS[selectedTeam] || []
      result = result.filter(e => {
        const member = members.find(m => m.id === e.memberId)
        return member && teamIdentifiers.includes(member.identifier.toLowerCase())
      })
    }
    return result
  }, [entries, selectedEngineerId, selectedTeam, dateRange, members])

  // Filter service tickets
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
      result.filter(t => t.owner?.toLowerCase() === selectedEngineer.identifier.toLowerCase() ||
        t.resources?.toLowerCase().includes(selectedEngineer.identifier.toLowerCase())
      ).forEach(t => ticketIds.add(t.id))
      result = result.filter(t => ticketIds.has(t.id))
    } else if (selectedTeam !== 'All Company') {
      const teamIdentifiers = TEAM_DEFINITIONS[selectedTeam] || []

      // Get tickets where any team member has logged time
      const teamTimeTicketIds = new Set(
        filteredEntries
          .filter(e => e.ticketId)
          .map(e => e.ticketId!)
      )

      result = result.filter(t => {
        const isOwnerInTeam = teamIdentifiers.some((id: string) => id.toLowerCase() === t.owner?.toLowerCase())
        const isResourceInTeam = t.resources && teamIdentifiers.some((id: string) => t.resources?.toLowerCase().includes(id.toLowerCase()))
        return isOwnerInTeam || isResourceInTeam || teamTimeTicketIds.has(t.id)
      })
    }
    return result
  }, [serviceTickets, selectedEngineer, selectedTeam, filteredEntries, dateRange, includesServiceDesk])

  // Filter projects - include projects where engineer is manager OR has time entries
  const filteredProjects = useMemo(() => {
    if (!includesProjects) return []
    if (selectedEngineer) {
      const identifier = selectedEngineer.identifier.toLowerCase()
      // Get project IDs from time entries
      const timeEntryProjectIds = new Set(
        filteredEntries
          .filter(e => e.memberId === selectedEngineer.id && e.projectId !== null && e.projectId !== undefined)
          .map(e => e.projectId!)
      )
      return projects.filter(p =>
        p.managerIdentifier?.toLowerCase() === identifier ||
        timeEntryProjectIds.has(p.id)
      )
    } else if (selectedTeam !== 'All Company') {
      const teamIdentifiers = TEAM_DEFINITIONS[selectedTeam] || []

      // Get projects where any team member has logged time
      const teamTimeProjectIds = new Set(
        filteredEntries
          .filter(e => e.projectId !== null && e.projectId !== undefined)
          .map(e => e.projectId!)
      )

      // Get projects where any team member is a resource
      const teamResourceProjectIds = new Set(
        projectTickets
          .filter(t => t.resources && teamIdentifiers.some(id => t.resources?.toLowerCase().includes(id.toLowerCase())))
          .map(t => t.projectId)
      )

      return projects.filter(p =>
        (p.managerIdentifier && teamIdentifiers.includes(p.managerIdentifier.toLowerCase())) ||
        teamTimeProjectIds.has(p.id) ||
        teamResourceProjectIds.has(p.id)
      )
    }
    return projects
  }, [projects, selectedEngineer, selectedTeam, includesProjects, filteredEntries, projectTickets])

  const filteredProjectTickets = useMemo(() => {
    if (!includesProjects) return []
    const projectIds = filteredProjects.map(p => p.id)
    return projectTickets.filter(t => {
      // Filter by date range
      if (t.dateEntered) {
        const entered = new Date(t.dateEntered)
        if (entered < dateRange.start || entered > dateRange.end) return false
      }
      // Filter by project
      return projectIds.includes(t.projectId)
    })
  }, [projectTickets, filteredProjects, includesProjects, dateRange])

  // Calculate achievements
  const achievements = useMemo((): Achievement[] => {
    const achievements: Achievement[] = []

    // Time entry achievements
    const totalHours = filteredEntries.reduce((sum, e) => sum + e.hours, 0)
    const billableHours = filteredEntries.filter(e => e.billableOption === 'Billable').reduce((sum, e) => sum + e.hours, 0)
    const billablePercent = totalHours > 0 ? (billableHours / totalHours) * 100 : 0
    const withNotes = filteredEntries.filter(e => e.notes && e.notes.trim().length > 0)
    const notesPercent = filteredEntries.length > 0 ? (withNotes.length / filteredEntries.length) * 100 : 0

    if (totalHours > 0) {
      achievements.push({ title: 'Time Champion', description: 'Total hours logged', value: `${totalHours.toFixed(0)}h`, color: 'from-blue-500 to-blue-600', source: 'time' })
    }
    if (billablePercent >= 70) {
      achievements.push({ title: 'Billable Excellence', description: 'Outstanding billable ratio', value: `${billablePercent.toFixed(0)}%`, color: 'from-green-500 to-emerald-600', source: 'time' })
    }
    if (notesPercent >= 80) {
      achievements.push({ title: 'Documentation Hero', description: 'Entries with notes', value: `${notesPercent.toFixed(0)}%`, color: 'from-blue-500 to-blue-600', source: 'time' })
    }

    // Service desk achievements
    if (includesServiceDesk) {
      const closedServiceTickets = filteredServiceTickets.filter(t => t.closedFlag)
      if (closedServiceTickets.length > 0) {
        achievements.push({ title: 'Service Champion', description: 'Service tickets resolved', value: closedServiceTickets.length, color: 'from-cyan-500 to-teal-600', source: 'serviceDesk' })
      }
      if (filteredServiceTickets.length > 10) {
        achievements.push({ title: 'Support Star', description: 'Service tickets handled', value: filteredServiceTickets.length, color: 'from-cyan-600 to-cyan-700', source: 'serviceDesk' })
      }
    }

    // Project achievements
    if (includesProjects) {
      if (filteredProjects.length > 0) {
        achievements.push({ title: 'Project Leader', description: 'Projects managed', value: filteredProjects.length, color: 'from-purple-500 to-violet-600', source: 'projects' })
      }
      const closedProjectTickets = filteredProjectTickets.filter(t => t.closedFlag)
      if (closedProjectTickets.length > 0) {
        achievements.push({ title: 'Task Master', description: 'Project tasks completed', value: closedProjectTickets.length, color: 'from-purple-600 to-purple-700', source: 'projects' })
      }
    }

    // Work streak
    const sortedDates = [...new Set(filteredEntries.map(e => new Date(e.dateStart).toDateString()))].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    let maxStreak = 0, currentStreak = 1
    for (let i = 1; i < sortedDates.length; i++) {
      const diffDays = (new Date(sortedDates[i]).getTime() - new Date(sortedDates[i - 1]).getTime()) / (1000 * 60 * 60 * 24)
      if (diffDays === 1) { currentStreak++; maxStreak = Math.max(maxStreak, currentStreak) }
      else { currentStreak = 1 }
    }
    maxStreak = Math.max(maxStreak, currentStreak)
    if (maxStreak >= 5) {
      achievements.push({ title: 'Consistency King', description: 'Longest work streak', value: `${maxStreak} days`, color: 'from-yellow-500 to-amber-500', source: 'time' })
    }

    return achievements
  }, [filteredEntries, filteredServiceTickets, filteredProjects, filteredProjectTickets, includesServiceDesk, includesProjects])

  // Fun stats
  const funStats = useMemo(() => {
    const totalHours = filteredEntries.reduce((sum, e) => sum + e.hours, 0)
    return {
      totalHours,
      coffees: Math.round(totalHours / 2),
      serviceResolved: filteredServiceTickets.filter(t => t.closedFlag).length,
      projectsActive: filteredProjects.filter(p => !p.closedFlag).length,
    }
  }, [filteredEntries, filteredServiceTickets, filteredProjects])

  const generateAIHighlights = async () => {
    setIsGeneratingHighlights(true)
    setHighlightError(null)
    setParsedWrapped(null)
    try {
      // Pass json: true to enable structured output
      const response = await api.generateAnalysis('cwWrapped', {
        member: selectedEngineer || { firstName: 'Team', lastName: '' },
        stats: { ...funStats, achievements: achievements.map(a => `${a.title}: ${a.value}`), dataSources },
        year: new Date().getFullYear(),
      }, { json: true, model: 'gpt-3.5-turbo-1106' })

      setAiHighlights(response.analysis)

      try {
        const parsed = JSON.parse(response.analysis)
        setParsedWrapped(parsed)
      } catch (e) {
        console.warn('Failed to parse AI output', e)
      }

    } catch (error: any) {
      setHighlightError(error.message || 'Failed to generate highlights')
    } finally {
      setIsGeneratingHighlights(false)
    }
  }

  // Filter achievements by data source
  const filteredAchievements = achievements.filter(a => {
    if (a.source === 'time') return true
    if (a.source === 'serviceDesk') return includesServiceDesk
    if (a.source === 'projects') return includesProjects
    return true
  })

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Highlights & Achievements</h2>
          <p className="text-gray-400">
            {selectedEngineer ? `Celebrating ${selectedEngineer.firstName} ${selectedEngineer.lastName}'s accomplishments` : 'Celebrating team accomplishments'}
            {' • '}<span className="text-blue-400">{periodLabel}</span>
          </p>
        </div>
        <DataSourceFilter selected={dataSources} onChange={setDataSources} />
      </div>

      {/* Fun Stats Banner */}
      <div className="bg-gradient-to-r from-gray-800 via-gray-800 to-gray-800 rounded-xl p-6 mb-6 border border-gray-700">
        <h3 className="text-2xl font-bold text-white mb-4">Your {periodLabel} in Numbers</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-4xl font-bold text-white">{funStats.totalHours.toFixed(0)}</p>
            <p className="text-gray-300">Hours Logged</p>
          </div>
          <div className="text-center">
            <p className="text-4xl font-bold text-white">{funStats.coffees}</p>
            <p className="text-gray-300">Days of Work</p>
          </div>
          {includesServiceDesk && (
            <div className="text-center">
              <p className="text-4xl font-bold text-cyan-400">{funStats.serviceResolved}</p>
              <p className="text-gray-300">Tickets Resolved</p>
            </div>
          )}
          {includesProjects && (
            <div className="text-center">
              <p className="text-4xl font-bold text-purple-400">{funStats.projectsActive}</p>
              <p className="text-gray-300">Active Projects</p>
            </div>
          )}
        </div>
      </div>

      {/* Achievements Grid */}
      {filteredAchievements.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {filteredAchievements.map((achievement, index) => (
            <div key={index} className={`bg-gradient-to-br ${achievement.color} rounded-xl p-6 transform hover:scale-105 transition-transform duration-200 shadow-lg`}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">{achievement.title}</h3>
                  <p className="text-white/80 text-sm mt-1">{achievement.description}</p>
                </div>
                <span className="text-3xl font-bold text-white">{achievement.value}</span>
              </div>
              <div className="mt-2">
                <span className={`text-xs px-2 py-1 rounded ${achievement.source === 'serviceDesk' ? 'bg-cyan-900/50 text-cyan-200' : achievement.source === 'projects' ? 'bg-purple-900/50 text-purple-200' : 'bg-blue-900/50 text-blue-200'}`}>
                  {achievement.source === 'serviceDesk' ? 'Service Desk' : achievement.source === 'projects' ? 'Projects' : 'Time Tracking'}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg p-12 text-center mb-6">
          <p className="text-gray-400 text-lg">No achievements yet for {periodLabel.toLowerCase()}. Start logging time to earn badges!</p>
        </div>
      )}

      {/* Top Performers (when no engineer selected) */}
      {selectedEngineerId === null && members.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h3 className="text-xl font-semibold text-white mb-4">Top Performers</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Most Hours */}
            {(() => {
              const memberHours = members.map(m => ({
                ...m,
                hours: filteredEntries.filter(e => e.memberId === m.id).reduce((sum, e) => sum + e.hours, 0)
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

            {/* Best Service */}
            {includesServiceDesk && (() => {
              const memberTickets = members.map(m => {
                const id = m.identifier.toLowerCase()
                const tickets = filteredServiceTickets.filter(t => t.owner?.toLowerCase() === id || t.resources?.toLowerCase().includes(id))
                return { ...m, closed: tickets.filter(t => t.closedFlag).length }
              }).filter(m => m.closed > 0).sort((a, b) => b.closed - a.closed)
              const top = memberTickets[0]
              if (!top) return null
              return (
                <div className="bg-gradient-to-br from-cyan-500 to-teal-600 rounded-lg p-4">
                  <p className="text-cyan-100 text-sm">Service Champion</p>
                  <p className="text-white text-xl font-bold">{top.firstName} {top.lastName}</p>
                  <p className="text-cyan-100 text-2xl font-bold mt-2">{top.closed} resolved</p>
                </div>
              )
            })()}

            {/* Best Projects */}
            {includesProjects && (() => {
              const memberProjects = members.map(m => ({
                ...m,
                count: filteredProjects.filter(p => p.managerIdentifier?.toLowerCase() === m.identifier.toLowerCase()).length
              })).filter(m => m.count > 0).sort((a, b) => b.count - a.count)
              const top = memberProjects[0]
              if (!top) return null
              return (
                <div className="bg-gradient-to-br from-purple-500 to-violet-600 rounded-lg p-4">
                  <p className="text-purple-100 text-sm">Project Leader</p>
                  <p className="text-white text-xl font-bold">{top.firstName} {top.lastName}</p>
                  <p className="text-purple-100 text-2xl font-bold mt-2">{top.count} projects</p>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* AI Generated Highlights Wrapper */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8 overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <svg className="w-64 h-64 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" /></svg>
        </div>

        <div className="flex justify-between items-center mb-8 relative z-10">
          <div>
            <h3 className="text-2xl font-bold text-white bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-violet-500">
              {parsedWrapped ? parsedWrapped.title : 'AI Wrapped Experience'}
            </h3>
            <p className="text-gray-400">Generate a custom end-of-period review</p>
          </div>
          <button onClick={generateAIHighlights} disabled={isGeneratingHighlights}
            className={`px-6 py-3 rounded-full font-bold transition-all transform active:scale-95 shadow-lg ${isGeneratingHighlights ? 'bg-gray-700 text-gray-500' : 'bg-gradient-to-r from-pink-600 to-purple-600 text-white hover:from-pink-500 hover:to-purple-500 hover:shadow-pink-500/25'}`}>
            {isGeneratingHighlights ? 'Generating Magic...' : '✨ Generate Wrapped'}
          </button>
        </div>

        {highlightError && <div className="bg-red-500/20 text-red-200 p-4 rounded-lg mb-4">{highlightError}</div>}

        {parsedWrapped ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

            {/* Opening */}
            <div className="bg-gray-800/80 p-6 rounded-2xl border border-gray-700/50 backdrop-blur-sm">
              <p className="text-xl text-gray-200 italic font-light leading-relaxed">
                "{parsedWrapped.opening}"
              </p>
            </div>

            {/* Top Achievements Horizontal Scroll */}
            <div>
              <h4 className="text-lg font-bold text-gray-400 mb-4 uppercase tracking-wider text-xs">Top Moments</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {parsedWrapped.topAchievements.map((ach, i) => (
                  <div key={i} className="bg-gray-800 p-6 rounded-xl border-2 border-gray-700 hover:border-pink-500/50 transition-colors flex items-center gap-4">
                    <span className="text-4xl">{ach.emoji}</span>
                    <span className="text-gray-200 font-medium">{ach.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Fun Stats Grid */}
            <div>
              <h4 className="text-lg font-bold text-gray-400 mb-4 uppercase tracking-wider text-xs">The Breakdown</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {parsedWrapped.funStats.map((stat, i) => (
                  <div key={i} className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-xl text-center relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                    <p className="text-pink-400 text-xs font-bold uppercase mb-2 relative z-10">{stat.label}</p>
                    <p className="text-3xl font-black text-white mb-2 relative z-10">{stat.value}</p>
                    <p className="text-gray-400 text-sm italic relative z-10">"{stat.comment}"</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Closing */}
            <div className="text-center p-8 bg-gradient-to-r from-pink-900/20 to-purple-900/20 rounded-2xl">
              <p className="text-2xl font-bold text-white mb-2">🎉</p>
              <p className="text-lg text-gray-300">{parsedWrapped.closing}</p>
            </div>

          </div>
        ) : aiHighlights ? (
          /* Fallback for raw text */
          <div className="bg-gray-800 p-8 rounded-xl whitespace-pre-wrap text-gray-300 font-mono text-sm leading-relaxed border-l-4 border-pink-500">
            {aiHighlights}
          </div>
        ) : (
          <div className="text-center py-12 border-2 border-dashed border-gray-700/50 rounded-2xl">
            <span className="text-6xl mb-4 block grayscale opacity-30">🎁</span>
            <p className="text-gray-500">Tap "Generate Wrapped" to unwrap your year in review.</p>
          </div>
        )}

      </div>
    </div>
  )
}
