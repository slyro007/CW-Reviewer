import { useEffect } from 'react'
import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { format, subDays } from 'date-fns'

export default function TimeTracking() {
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { members } = useMembersStore()
  const { entries, isLoading, fetchTimeEntries } = useTimeEntriesStore()

  const selectedEngineer = selectedEngineerId 
    ? members.find(m => m.id === selectedEngineerId)
    : null

  // Auto-fetch time entries if not loaded (only once)
  useEffect(() => {
    if (entries.length === 0 && !isLoading) {
      const end = new Date()
      const start = subDays(end, 30)
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

  const totalHours = filteredEntries.reduce((sum, entry) => sum + entry.hours, 0)
  const billableHours = filteredEntries
    .filter(e => e.billableOption === 'Billable')
    .reduce((sum, entry) => sum + entry.hours, 0)

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">Time Tracking</h2>
        <p className="text-gray-400">
          {selectedEngineer 
            ? `Time tracking details for ${selectedEngineer.firstName} ${selectedEngineer.lastName}`
            : 'Time tracking overview for all engineers'}
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-gray-400">Loading time entries...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Total Hours</h3>
              <p className="text-3xl font-bold text-white">{totalHours.toFixed(1)}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Billable Hours</h3>
              <p className="text-3xl font-bold text-white">{billableHours.toFixed(1)}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Billable %</h3>
              <p className="text-3xl font-bold text-white">
                {totalHours > 0 ? ((billableHours / totalHours) * 100).toFixed(1) : 0}%
              </p>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Time Entries</h3>
            {filteredEntries.length === 0 ? (
              <p className="text-gray-400">No time entries found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-2 px-4 text-gray-400">Date</th>
                      <th className="text-left py-2 px-4 text-gray-400">Hours</th>
                      <th className="text-left py-2 px-4 text-gray-400">Billable</th>
                      <th className="text-left py-2 px-4 text-gray-400">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.slice(0, 50).map((entry) => (
                      <tr key={entry.id} className="border-b border-gray-700">
                        <td className="py-2 px-4">
                          {new Date(entry.dateStart).toLocaleDateString()}
                        </td>
                        <td className="py-2 px-4">{entry.hours}</td>
                        <td className="py-2 px-4">{entry.billableOption || 'N/A'}</td>
                        <td className="py-2 px-4 text-gray-400 truncate max-w-xs">
                          {entry.notes || 'No notes'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

