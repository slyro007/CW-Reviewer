import { useEffect } from 'react'
import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { format, subYears } from 'date-fns'

export default function Notes() {
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { members } = useMembersStore()
  const { entries, fetchTimeEntries } = useTimeEntriesStore()

  const selectedEngineer = selectedEngineerId 
    ? members.find(m => m.id === selectedEngineerId)
    : null

  // Auto-fetch time entries if not loaded (3 years for full history)
  useEffect(() => {
    if (entries.length === 0) {
      const end = new Date()
      const start = subYears(end, 3)
      fetchTimeEntries({
        startDate: format(start, 'yyyy-MM-dd'),
        endDate: format(end, 'yyyy-MM-dd'),
      })
    }
  }, []) // Only on mount

  // Filter entries based on selected engineer
  const filteredEntries = selectedEngineerId === null 
    ? entries 
    : entries.filter(entry => entry.memberId === selectedEngineerId)

  // Filter entries with notes
  const entriesWithNotes = filteredEntries.filter(entry => entry.notes && entry.notes.trim().length > 0)

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">Notes</h2>
        <p className="text-gray-400">
          {selectedEngineer 
            ? `Notes analysis for ${selectedEngineer.firstName} ${selectedEngineer.lastName}`
            : 'Notes analysis for all engineers'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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
      </div>

      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Recent Notes</h3>
        {entriesWithNotes.length === 0 ? (
          <p className="text-gray-400">No notes found</p>
        ) : (
          <div className="space-y-4">
            {entriesWithNotes.slice(0, 20).map((entry) => (
              <div key={entry.id} className="border-b border-gray-700 pb-4">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm text-gray-400">
                    {new Date(entry.dateStart).toLocaleDateString()}
                  </span>
                  <span className="text-sm text-gray-400">{entry.hours} hours</span>
                </div>
                <p className="text-white">{entry.notes}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

