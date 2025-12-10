import { useEffect, useMemo } from 'react'
import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useTimePeriodStore } from '@/stores/timePeriodStore'
import { format } from 'date-fns'

export default function Notes() {
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { members } = useMembersStore()
  const { entries, fetchTimeEntries } = useTimeEntriesStore()
  const { getDateRange, getPeriodLabel } = useTimePeriodStore()

  const dateRange = getDateRange()
  const periodLabel = getPeriodLabel()

  const selectedEngineer = selectedEngineerId 
    ? members.find(m => m.id === selectedEngineerId)
    : null

  // Fetch time entries based on global date range
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
      result = result.filter(entry => entry.memberId === selectedEngineerId)
    }
    return result
  }, [entries, selectedEngineerId, dateRange])

  // Filter entries with notes
  const entriesWithNotes = filteredEntries.filter(entry => entry.notes && entry.notes.trim().length > 0)

  // Calculate quality metrics
  const avgNoteLength = entriesWithNotes.length > 0
    ? Math.round(entriesWithNotes.reduce((sum, e) => sum + (e.notes?.length || 0), 0) / entriesWithNotes.length)
    : 0

  const notesPercent = filteredEntries.length > 0 
    ? (entriesWithNotes.length / filteredEntries.length) * 100 
    : 0

  // Calculate notes quality score (0-100)
  const notesQualityScore = Math.min(100, Math.round(
    (notesPercent >= 90 ? 50 : (notesPercent / 90) * 50) +
    (avgNoteLength >= 50 ? 30 : (avgNoteLength / 50) * 30) +
    (avgNoteLength >= 100 ? 20 : (avgNoteLength / 100) * 20)
  ))

  // Categorize notes by length
  const shortNotes = entriesWithNotes.filter(e => (e.notes?.length || 0) < 30).length
  const mediumNotes = entriesWithNotes.filter(e => {
    const len = e.notes?.length || 0
    return len >= 30 && len < 100
  }).length
  const longNotes = entriesWithNotes.filter(e => (e.notes?.length || 0) >= 100).length

  // Calculate notes with details (contains action words, context)
  const notesWithDetails = entriesWithNotes.filter(e => {
    const note = (e.notes || '').toLowerCase()
    return note.length >= 30 && (
      note.includes('installed') || note.includes('configured') || note.includes('resolved') ||
      note.includes('updated') || note.includes('created') || note.includes('fixed') ||
      note.includes('troubleshoot') || note.includes('reviewed') || note.includes('tested') ||
      note.includes('because') || note.includes('due to') || note.includes('issue')
    )
  }).length

  const detailsPercent = entriesWithNotes.length > 0
    ? (notesWithDetails / entriesWithNotes.length) * 100
    : 0

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">Notes</h2>
        <p className="text-gray-400">
          {selectedEngineer 
            ? `Notes analysis for ${selectedEngineer.firstName} ${selectedEngineer.lastName}`
            : 'Notes analysis for all engineers'}
          {' • '}<span className="text-blue-400">{periodLabel}</span>
        </p>
      </div>

      {/* Quality Score */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Notes Quality Score</h3>
          <div className={`text-4xl font-bold ${
            notesQualityScore >= 80 ? 'text-green-400' :
            notesQualityScore >= 65 ? 'text-blue-400' :
            notesQualityScore >= 50 ? 'text-yellow-400' :
            'text-orange-400'
          }`}>
            {notesQualityScore}/100
          </div>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-3">
          <div 
            className={`h-3 rounded-full transition-all ${
              notesQualityScore >= 80 ? 'bg-green-500' :
              notesQualityScore >= 65 ? 'bg-blue-500' :
              notesQualityScore >= 50 ? 'bg-yellow-500' :
              'bg-orange-500'
            }`}
            style={{ width: `${notesQualityScore}%` }}
          />
        </div>
        <p className="text-sm text-gray-400 mt-2">
          Based on notes coverage ({notesPercent.toFixed(1)}%), average length ({avgNoteLength} chars), and detail quality
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Notes Coverage</h3>
          <p className="text-3xl font-bold text-white">{notesPercent.toFixed(1)}%</p>
          <p className="text-sm text-gray-400 mt-2">
            {entriesWithNotes.length} of {filteredEntries.length} entries
          </p>
          <div className="mt-3">
            <div className={`text-xs px-2 py-1 rounded ${
              notesPercent >= 90 ? 'bg-green-500/20 text-green-400' :
              notesPercent >= 70 ? 'bg-blue-500/20 text-blue-400' :
              notesPercent >= 50 ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-orange-500/20 text-orange-400'
            }`}>
              {notesPercent >= 90 ? 'Excellent' :
               notesPercent >= 70 ? 'Good' :
               notesPercent >= 50 ? 'Fair' :
               'Needs Improvement'}
            </div>
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Avg Note Length</h3>
          <p className="text-3xl font-bold text-white">{avgNoteLength}</p>
          <p className="text-sm text-gray-400 mt-2">characters</p>
          <div className="mt-3">
            <div className={`text-xs px-2 py-1 rounded ${
              avgNoteLength >= 100 ? 'bg-green-500/20 text-green-400' :
              avgNoteLength >= 50 ? 'bg-blue-500/20 text-blue-400' :
              avgNoteLength >= 30 ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-orange-500/20 text-orange-400'
            }`}>
              {avgNoteLength >= 100 ? 'Excellent' :
               avgNoteLength >= 50 ? 'Good' :
               avgNoteLength >= 30 ? 'Fair' :
               'Too Brief'}
            </div>
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Notes with Details</h3>
          <p className="text-3xl font-bold text-white">{detailsPercent.toFixed(0)}%</p>
          <p className="text-sm text-gray-400 mt-2">
            {notesWithDetails} of {entriesWithNotes.length} notes
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Without Notes</h3>
          <p className="text-3xl font-bold text-orange-400">{filteredEntries.length - entriesWithNotes.length}</p>
          <p className="text-sm text-gray-400 mt-2">
            {filteredEntries.length > 0 
              ? `${((filteredEntries.length - entriesWithNotes.length) / filteredEntries.length * 100).toFixed(1)}% of entries`
              : 'No entries'}
          </p>
        </div>
      </div>

      {/* Notes Length Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Notes Length Distribution</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Short (&lt;30 chars)</span>
                <span className="text-white font-medium">{shortNotes}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-orange-500 h-2 rounded-full"
                  style={{ width: `${entriesWithNotes.length > 0 ? (shortNotes / entriesWithNotes.length) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Medium (30-99 chars)</span>
                <span className="text-white font-medium">{mediumNotes}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-yellow-500 h-2 rounded-full"
                  style={{ width: `${entriesWithNotes.length > 0 ? (mediumNotes / entriesWithNotes.length) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Detailed (≥100 chars)</span>
                <span className="text-white font-medium">{longNotes}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-green-500 h-2 rounded-full"
                  style={{ width: `${entriesWithNotes.length > 0 ? (longNotes / entriesWithNotes.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Recommendations</h3>
          <div className="space-y-2">
            {notesPercent < 80 && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded p-3">
                <p className="text-sm text-orange-400">
                  Only {notesPercent.toFixed(0)}% of entries have notes. Aim for 90%+ coverage.
                </p>
              </div>
            )}
            {avgNoteLength < 50 && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3">
                <p className="text-sm text-yellow-400">
                  Average note length is {avgNoteLength} characters. Include more detail: what was done, why, and any blockers.
                </p>
              </div>
            )}
            {notesPercent >= 90 && avgNoteLength >= 100 && (
              <div className="bg-green-500/10 border border-green-500/30 rounded p-3">
                <p className="text-sm text-green-400">
                  Excellent notes quality! Maintain this standard.
                </p>
              </div>
            )}
            {filteredEntries.length === 0 && (
              <div className="bg-gray-700/50 rounded p-3">
                <p className="text-sm text-gray-400">
                  No time entries found for this period.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
