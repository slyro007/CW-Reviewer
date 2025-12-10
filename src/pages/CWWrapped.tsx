import { useState, useEffect, useMemo } from 'react'
import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useTicketsStore } from '@/stores/ticketsStore'
import { useProjectsStore } from '@/stores/projectsStore'
import { useTimePeriodStore } from '@/stores/timePeriodStore'
import DataSourceFilter, { useDataSources } from '@/components/DataSourceFilter'
import { api } from '@/lib/api'
import { format, differenceInDays } from 'date-fns'

export default function CWWrapped() {
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { members } = useMembersStore()
  const { entries, fetchTimeEntries } = useTimeEntriesStore()
  const { serviceTickets, fetchServiceBoardTickets } = useTicketsStore()
  const { projects, projectTickets, fetchProjects, fetchProjectTickets } = useProjectsStore()
  const { getDateRange, getPeriodLabel, timePeriod } = useTimePeriodStore()
  
  const { dataSources, setDataSources, includesServiceDesk, includesProjects } = useDataSources()
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentSlide, setCurrentSlide] = useState(0)

  const dateRange = getDateRange()
  const periodLabel = getPeriodLabel()
  const selectedEngineer = selectedEngineerId ? members.find(m => m.id === selectedEngineerId) : null

  useEffect(() => {
    fetchTimeEntries({ startDate: format(dateRange.start, 'yyyy-MM-dd'), endDate: format(dateRange.end, 'yyyy-MM-dd') })
    fetchServiceBoardTickets()
    fetchProjects()
    fetchProjectTickets()
  }, [dateRange.start.getTime(), dateRange.end.getTime()])

  // Filter entries
  const filteredEntries = useMemo(() => {
    let result = entries.filter(e => {
      const entryDate = new Date(e.dateStart)
      return entryDate >= dateRange.start && entryDate <= dateRange.end
    })
    if (selectedEngineerId !== null) result = result.filter(e => e.memberId === selectedEngineerId)
    return result
  }, [entries, selectedEngineerId, dateRange])

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
    }
    return result
  }, [serviceTickets, selectedEngineer, filteredEntries, dateRange, includesServiceDesk])

  // Filter projects
  const filteredProjects = useMemo(() => {
    if (!includesProjects) return []
    if (selectedEngineer) return projects.filter(p => p.managerIdentifier?.toLowerCase() === selectedEngineer.identifier.toLowerCase())
    return projects
  }, [projects, selectedEngineer, includesProjects])

  const filteredProjectTickets = useMemo(() => {
    if (!includesProjects) return []
    const projectIds = filteredProjects.map(p => p.id)
    return projectTickets.filter(t => projectIds.includes(t.projectId))
  }, [projectTickets, filteredProjects, includesProjects])

  // Calculate wrapped stats
  const wrappedStats = useMemo(() => {
    const totalHours = filteredEntries.reduce((sum, e) => sum + e.hours, 0)
    const billableHours = filteredEntries.filter(e => e.billableOption === 'Billable').reduce((sum, e) => sum + e.hours, 0)
    const uniqueDays = new Set(filteredEntries.map(e => new Date(e.dateStart).toDateString())).size
    const withNotes = filteredEntries.filter(e => e.notes && e.notes.trim().length > 0)

    // Service desk stats
    const serviceResolved = filteredServiceTickets.filter(t => t.closedFlag).length
    const avgServiceTime = serviceResolved > 0 
      ? filteredServiceTickets.filter(t => t.closedFlag && t.dateEntered && t.closedDate)
          .reduce((sum, t) => sum + differenceInDays(new Date(t.closedDate!), new Date(t.dateEntered!)), 0) / serviceResolved 
      : 0

    // Project stats
    const projectsCompleted = filteredProjects.filter(p => p.closedFlag).length
    const projectTicketsCompleted = filteredProjectTickets.filter(t => t.closedFlag).length

    // Fun stats
    const topCompanies = new Map<string, number>()
    filteredServiceTickets.forEach(t => {
      if (t.company) topCompanies.set(t.company, (topCompanies.get(t.company) || 0) + 1)
    })
    const sortedCompanies = [...topCompanies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

    return {
      totalHours, billableHours,
      billablePercent: totalHours > 0 ? (billableHours / totalHours) * 100 : 0,
      daysWorked: uniqueDays,
      entriesCount: filteredEntries.length,
      notesPercent: filteredEntries.length > 0 ? (withNotes.length / filteredEntries.length) * 100 : 0,
      avgHoursPerDay: uniqueDays > 0 ? totalHours / uniqueDays : 0,
      // Service Desk
      serviceTickets: filteredServiceTickets.length,
      serviceResolved,
      avgServiceTime: avgServiceTime.toFixed(1),
      // Projects
      projectsCount: filteredProjects.length,
      projectsCompleted,
      projectTicketsTotal: filteredProjectTickets.length,
      projectTicketsCompleted,
      // Fun
      topCompanies: sortedCompanies,
      coffeeBreaks: Math.round(totalHours / 4),
    }
  }, [filteredEntries, filteredServiceTickets, filteredProjects, filteredProjectTickets])

  // Slides data
  const slides = useMemo(() => {
    const slideList = [
      {
        id: 'intro',
        title: `Your ${periodLabel}`,
        subtitle: selectedEngineer ? `${selectedEngineer.firstName}'s ConnectWise Journey` : 'Team ConnectWise Journey',
        gradient: 'from-indigo-600 via-purple-600 to-pink-600',
        content: (
          <div className="text-center">
            <p className="text-6xl font-bold mb-4">{wrappedStats.daysWorked}</p>
            <p className="text-2xl text-white/80">Days of Work</p>
          </div>
        ),
      },
      {
        id: 'hours',
        title: 'Time Invested',
        subtitle: 'Every hour counts',
        gradient: 'from-blue-600 via-cyan-600 to-teal-600',
        content: (
          <div className="grid grid-cols-2 gap-8 text-center">
            <div>
              <p className="text-5xl font-bold">{wrappedStats.totalHours.toFixed(0)}</p>
              <p className="text-xl text-white/80">Total Hours</p>
            </div>
            <div>
              <p className="text-5xl font-bold text-green-400">{wrappedStats.billablePercent.toFixed(0)}%</p>
              <p className="text-xl text-white/80">Billable</p>
            </div>
          </div>
        ),
      },
    ]

    if (includesServiceDesk && wrappedStats.serviceTickets > 0) {
      slideList.push({
        id: 'service',
        title: 'Service Champion',
        subtitle: 'Helping customers succeed',
        gradient: 'from-cyan-600 via-teal-600 to-emerald-600',
        content: (
          <div className="grid grid-cols-2 gap-8 text-center">
            <div>
              <p className="text-5xl font-bold text-cyan-300">{wrappedStats.serviceTickets}</p>
              <p className="text-xl text-white/80">Service Tickets</p>
            </div>
            <div>
              <p className="text-5xl font-bold text-teal-300">{wrappedStats.serviceResolved}</p>
              <p className="text-xl text-white/80">Resolved</p>
            </div>
          </div>
        ),
      })
    }

    if (includesProjects && wrappedStats.projectsCount > 0) {
      slideList.push({
        id: 'projects',
        title: 'Project Master',
        subtitle: 'Building the future',
        gradient: 'from-purple-600 via-violet-600 to-fuchsia-600',
        content: (
          <div className="grid grid-cols-2 gap-8 text-center">
            <div>
              <p className="text-5xl font-bold text-purple-300">{wrappedStats.projectsCount}</p>
              <p className="text-xl text-white/80">Projects</p>
            </div>
            <div>
              <p className="text-5xl font-bold text-violet-300">{wrappedStats.projectTicketsCompleted}</p>
              <p className="text-xl text-white/80">Tasks Done</p>
            </div>
          </div>
        ),
      })
    }

    if (wrappedStats.topCompanies.length > 0) {
      slideList.push({
        id: 'companies',
        title: 'Top Clients',
        subtitle: 'Your biggest collaborations',
        gradient: 'from-amber-500 via-orange-500 to-red-500',
        content: (
          <div className="space-y-3">
            {wrappedStats.topCompanies.slice(0, 3).map(([company, count], idx) => (
              <div key={company} className="flex items-center justify-between bg-white/10 rounded-lg p-3">
                <span className="font-medium">{idx + 1}. {company}</span>
                <span className="font-bold">{count} tickets</span>
              </div>
            ))}
          </div>
        ),
      })
    }

    slideList.push({
      id: 'summary',
      title: 'Your Impact',
      subtitle: `${periodLabel} Achievements`,
      gradient: 'from-green-600 via-emerald-600 to-teal-600',
      content: (
        <div className="grid grid-cols-3 gap-6 text-center">
          <div>
            <p className="text-4xl font-bold">{wrappedStats.entriesCount}</p>
            <p className="text-sm text-white/80">Time Entries</p>
          </div>
          <div>
            <p className="text-4xl font-bold">{wrappedStats.notesPercent.toFixed(0)}%</p>
            <p className="text-sm text-white/80">Documented</p>
          </div>
          <div>
            <p className="text-4xl font-bold">{wrappedStats.coffeeBreaks}</p>
            <p className="text-sm text-white/80">Coffee Breaks ☕</p>
          </div>
        </div>
      ),
    })

    return slideList
  }, [wrappedStats, periodLabel, selectedEngineer, includesServiceDesk, includesProjects])

  const generateAISummary = async () => {
    setIsGenerating(true)
    setError(null)
    try {
      const response = await api.generateAnalysis('cwWrapped', {
        member: selectedEngineer || { firstName: 'Team', lastName: '' },
        stats: wrappedStats,
        period: periodLabel,
        dataSources,
      })
      setAiSummary(response.analysis)
    } catch (err: any) {
      setError(err.message || 'Failed to generate summary')
    } finally {
      setIsGenerating(false)
    }
  }

  const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % slides.length)
  const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length)

  const currentSlideData = slides[currentSlide]

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">CW Wrapped</h2>
          <p className="text-gray-400">
            {selectedEngineer ? `${selectedEngineer.firstName}'s journey` : 'Team journey'}
            {' • '}<span className="text-blue-400">{periodLabel}</span>
          </p>
        </div>
        <DataSourceFilter selected={dataSources} onChange={setDataSources} />
      </div>

      {/* Wrapped Slideshow */}
      <div className={`bg-gradient-to-br ${currentSlideData.gradient} rounded-2xl p-8 mb-6 min-h-[400px] flex flex-col justify-between relative overflow-hidden`}>
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-32 h-32 rounded-full bg-white"></div>
          <div className="absolute bottom-10 right-10 w-48 h-48 rounded-full bg-white"></div>
          <div className="absolute top-1/2 left-1/3 w-24 h-24 rounded-full bg-white"></div>
        </div>

        <div className="relative z-10">
          <h3 className="text-lg font-medium text-white/70">{currentSlideData.subtitle}</h3>
          <h2 className="text-4xl font-bold text-white mt-1">{currentSlideData.title}</h2>
        </div>

        <div className="relative z-10 flex-1 flex items-center justify-center py-8">
          {currentSlideData.content}
        </div>

        <div className="relative z-10 flex items-center justify-between">
          <button onClick={prevSlide} className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex gap-2">
            {slides.map((_, idx) => (
              <button key={idx} onClick={() => setCurrentSlide(idx)}
                className={`w-2 h-2 rounded-full transition-all ${idx === currentSlide ? 'bg-white w-6' : 'bg-white/40'}`} />
            ))}
          </div>
          <button onClick={nextSlide} className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-5">
          <h3 className="text-xs font-medium text-gray-400 mb-1">Total Hours</h3>
          <p className="text-2xl font-bold text-white">{wrappedStats.totalHours.toFixed(0)}h</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-5">
          <h3 className="text-xs font-medium text-gray-400 mb-1">Days Worked</h3>
          <p className="text-2xl font-bold text-white">{wrappedStats.daysWorked}</p>
        </div>
        {includesServiceDesk && (
          <div className="bg-gray-800 rounded-lg p-5">
            <h3 className="text-xs font-medium text-gray-400 mb-1">Service Resolved</h3>
            <p className="text-2xl font-bold text-cyan-400">{wrappedStats.serviceResolved}</p>
          </div>
        )}
        {includesProjects && (
          <div className="bg-gray-800 rounded-lg p-5">
            <h3 className="text-xs font-medium text-gray-400 mb-1">Project Tasks</h3>
            <p className="text-2xl font-bold text-purple-400">{wrappedStats.projectTicketsCompleted}</p>
          </div>
        )}
      </div>

      {/* AI Summary */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-white">AI Year-in-Review</h3>
          <button onClick={generateAISummary} disabled={isGenerating}
            className={`px-5 py-2.5 rounded-lg font-medium transition-all ${isGenerating ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white'}`}>
            {isGenerating ? <span className="flex items-center gap-2"><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>Creating...</span> : '✨ Generate Summary'}
          </button>
        </div>
        {error && <div className="bg-red-600/20 border border-red-500 rounded-lg p-4 mb-4"><p className="text-red-400">{error}</p></div>}
        {aiSummary ? (
          <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-lg p-6 border border-gray-600">
            <div className="whitespace-pre-wrap text-gray-200 leading-relaxed text-lg">{aiSummary}</div>
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-700/30 rounded-lg border border-dashed border-gray-600">
            <p className="text-2xl mb-2">✨</p>
            <p className="text-gray-400 text-lg">Get your personalized {periodLabel.toLowerCase()} summary</p>
            <p className="text-gray-500 text-sm mt-1">Click the button to generate an AI-powered recap!</p>
          </div>
        )}
      </div>
    </div>
  )
}
