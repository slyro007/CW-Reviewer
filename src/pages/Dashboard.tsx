import { useEffect, useState, useMemo } from 'react'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useUIStore } from '@/stores/uiStore'
import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'

export default function Dashboard() {
  const { members, isLoading: membersLoading } = useMembersStore()
  const { entries, isLoading: entriesLoading, setDateRange } = useTimeEntriesStore()
  const { setDateRange: setUIDateRange } = useUIStore()
  const { selectedEngineerId } = useSelectedEngineerStore()
  const [selectedDateRange, setSelectedDateRange] = useState<{ start: string; end: string }>({
    start: '',
    end: '',
  })

  const { fetchMembers } = useMembersStore()

  useEffect(() => {
    // Fetch members on mount
    fetchMembers()
  }, [fetchMembers])

  const handleDateRangeChange = () => {
    if (selectedDateRange.start && selectedDateRange.end) {
      const start = new Date(selectedDateRange.start)
      const end = new Date(selectedDateRange.end)
      setDateRange(start, end)
      setUIDateRange(start, end)
    }
  }

  // Filter entries based on selected engineer
  const filteredEntries = useMemo(() => {
    if (selectedEngineerId === null) {
      return entries // Show all entries
    }
    return entries.filter(entry => entry.memberId === selectedEngineerId)
  }, [entries, selectedEngineerId])

  // Filter members based on selected engineer
  const filteredMembers = useMemo(() => {
    if (selectedEngineerId === null) {
      return members // Show all members
    }
    return members.filter(member => member.id === selectedEngineerId)
  }, [members, selectedEngineerId])

  const totalHours = filteredEntries.reduce((sum, entry) => sum + entry.hours, 0)
  const billableHours = filteredEntries.filter(e => e.billableOption === 'Billable')
    .reduce((sum, entry) => sum + entry.hours, 0)

  // Get selected engineer name for display
  const selectedEngineer = selectedEngineerId 
    ? members.find(m => m.id === selectedEngineerId)
    : null

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">Overview</h2>
        <p className="text-gray-400">
          {selectedEngineer 
            ? `Overview for ${selectedEngineer.firstName} ${selectedEngineer.lastName}`
            : 'Overview of engineers, time entries, and projects'}
        </p>
      </div>

      {/* Date Range Picker */}
      <div className="mb-6 bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3">Date Range Filter</h3>
        <div className="flex gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={selectedDateRange.start}
              onChange={(e) => setSelectedDateRange({ ...selectedDateRange, start: e.target.value })}
              className="bg-gray-700 text-white rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={selectedDateRange.end}
              onChange={(e) => setSelectedDateRange({ ...selectedDateRange, end: e.target.value })}
              className="bg-gray-700 text-white rounded px-3 py-2"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleDateRangeChange}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
            >
              Apply Filter
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Total Engineers</h3>
          <p className="text-3xl font-bold text-white">
            {membersLoading ? '...' : filteredMembers.length}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Total Hours</h3>
          <p className="text-3xl font-bold text-white">
            {entriesLoading ? '...' : totalHours.toFixed(1)}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Billable Hours</h3>
          <p className="text-3xl font-bold text-white">
            {entriesLoading ? '...' : billableHours.toFixed(1)}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Time Entries</h3>
          <p className="text-3xl font-bold text-white">
            {entriesLoading ? '...' : filteredEntries.length}
          </p>
        </div>
      </div>

      {/* Engineers Overview */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold">Engineers Overview</h3>
          <button className="text-sm text-blue-400 hover:text-blue-300">
            Select for Comparison
          </button>
        </div>
        <div className="space-y-2">
          {membersLoading ? (
            <p className="text-gray-400">Loading engineers...</p>
          ) : filteredMembers.length === 0 ? (
            <p className="text-gray-400">No engineers found</p>
          ) : (
            filteredMembers.map((member) => (
              <div
                key={member.id}
                className="bg-gray-700 rounded p-4 flex justify-between items-center"
              >
                <div>
                  <p className="font-medium">
                    {member.firstName} {member.lastName}
                  </p>
                  <p className="text-sm text-gray-400">{member.identifier}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-400">Hours: {member.totalHours?.toFixed(1) || '0'}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Time Entries Summary */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h3 className="text-xl font-semibold mb-4">Time Entries Summary</h3>
        <div className="space-y-2">
          {entriesLoading ? (
            <p className="text-gray-400">Loading time entries...</p>
          ) : filteredEntries.length === 0 ? (
            <p className="text-gray-400">No time entries found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 px-4 text-gray-400">Date</th>
                    {selectedEngineerId === null && (
                      <th className="text-left py-2 px-4 text-gray-400">Engineer</th>
                    )}
                    <th className="text-left py-2 px-4 text-gray-400">Hours</th>
                    <th className="text-left py-2 px-4 text-gray-400">Billable</th>
                    <th className="text-left py-2 px-4 text-gray-400">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.slice(0, 10).map((entry) => (
                    <tr key={entry.id} className="border-b border-gray-700">
                      <td className="py-2 px-4">
                        {new Date(entry.dateStart).toLocaleDateString()}
                      </td>
                      {selectedEngineerId === null && (
                        <td className="py-2 px-4">
                          {members.find(m => m.id === entry.memberId)?.firstName || 'Unknown'}
                        </td>
                      )}
                      <td className="py-2 px-4">{entry.hours}</td>
                      <td className="py-2 px-4">
                        <span className={`px-2 py-1 rounded text-xs ${
                          entry.billableOption === 'Billable'
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-600 text-gray-300'
                        }`}>
                          {entry.billableOption || 'N/A'}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-sm text-gray-400">
                        {entry.notes ? (entry.notes.length > 50 ? entry.notes.substring(0, 50) + '...' : entry.notes) : 'No notes'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Placeholder for Trends Visualization */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h3 className="text-xl font-semibold mb-4">Trends (Coming Soon)</h3>
        <p className="text-gray-400">Trends visualization will be displayed here</p>
      </div>

      {/* Placeholder for Comparison View */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-semibold mb-4">Engineer Comparison (Coming Soon)</h3>
        <p className="text-gray-400">Select engineers above to compare their performance</p>
      </div>
    </div>
  )
}

