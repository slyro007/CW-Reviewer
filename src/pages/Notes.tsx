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

  // Calculate average note length
  const avgNoteLength = entriesWithNotes.length > 0
    ? Math.round(entriesWithNotes.reduce((sum, e) => sum + (e.notes?.length || 0), 0) / entriesWithNotes.length)
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Entries with Notes</h3>
          <p className="text-3xl font-bold text-white">{entriesWithNotes.length}</p>
          <p className="text-sm text-gray-400 mt-2">
            {filteredEntries.length > 0 
              ? `${((entriesWithNotes.length / filteredEntries.length) * 100).toFixed(1)}% of entries`
              : 'No entries'}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Total Entries</h3>
          <p className="text-3xl font-bold text-white">{filteredEntries.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Without Notes</h3>
          <p className="text-3xl font-bold text-orange-400">{filteredEntries.length - entriesWithNotes.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Avg Note Length</h3>
          <p className="text-3xl font-bold text-purple-400">{avgNoteLength}</p>
          <p className="text-sm text-gray-400 mt-2">characters</p>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Recent Notes</h3>
        {entriesWithNotes.length === 0 ? (
          <p className="text-gray-400">No notes found for {periodLabel.toLowerCase()}</p>
        ) : (
          <div className="space-y-4">
            {entriesWithNotes.slice(0, 20).map((entry) => (
              <div key={entry.id} className="border-b border-gray-700 pb-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-400">
                      {new Date(entry.dateStart).toLocaleDateString()}
                    </span>
                    {selectedEngineerId === null && (
                      <span className="text-sm text-blue-400">
                        {members.find(m => m.id === entry.memberId)?.firstName || 'Unknown'}
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-gray-400">{entry.hours}h</span>
                </div>
                <p className="text-white">{entry.notes}</p>
              </div>
            ))}
            {entriesWithNotes.length > 20 && (
              <p className="text-center text-gray-500 mt-4">
                Showing 20 of {entriesWithNotes.length} notes
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
