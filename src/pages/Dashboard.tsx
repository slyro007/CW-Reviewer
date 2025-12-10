import { useEffect, useMemo } from 'react'
import { useMembersStore } from '@/stores/membersStore'
import { useTimeEntriesStore } from '@/stores/timeEntriesStore'
import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useTimePeriodStore } from '@/stores/timePeriodStore'
import { format } from 'date-fns'

export default function Dashboard() {
  const { members, isLoading: membersLoading, fetchMembers } = useMembersStore()
  const { entries, isLoading: entriesLoading, fetchTimeEntries } = useTimeEntriesStore()
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { getDateRange, getPeriodLabel } = useTimePeriodStore()
  
  const dateRange = getDateRange()

  useEffect(() => {
    // Fetch members on mount
    fetchMembers()
  }, [fetchMembers])

  // Fetch time entries when date range changes
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

  // Filter members based on selected engineer
  const filteredMembers = useMemo(() => {
    if (selectedEngineerId === null) {
      return members
    }
    return members.filter(member => member.id === selectedEngineerId)
  }, [members, selectedEngineerId])

  // Calculate member hours
  const membersWithHours = useMemo(() => {
    return filteredMembers.map(member => {
      const memberEntries = filteredEntries.filter(e => e.memberId === member.id)
      const totalHours = memberEntries.reduce((sum, e) => sum + e.hours, 0)
      return { ...member, totalHours }
    })
  }, [filteredMembers, filteredEntries])

  const totalHours = filteredEntries.reduce((sum, entry) => sum + entry.hours, 0)
  const billableHours = filteredEntries.filter(e => e.billableOption === 'Billable')
    .reduce((sum, entry) => sum + entry.hours, 0)

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
          {' • '}<span className="text-blue-400">{getPeriodLabel()}</span>
        </p>
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
        </div>
        <div className="space-y-2">
          {membersLoading ? (
            <p className="text-gray-400">Loading engineers...</p>
          ) : membersWithHours.length === 0 ? (
            <p className="text-gray-400">No engineers found</p>
          ) : (
            membersWithHours.map((member) => (
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
                  <p className="text-lg font-semibold text-white">{member.totalHours.toFixed(1)}h</p>
                  <p className="text-xs text-gray-400">{getPeriodLabel()}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Time Entries Summary */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-semibold mb-4">Recent Time Entries</h3>
        <div className="space-y-2">
          {entriesLoading ? (
            <p className="text-gray-400">Loading time entries...</p>
          ) : filteredEntries.length === 0 ? (
            <p className="text-gray-400">No time entries found for {getPeriodLabel().toLowerCase()}</p>
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
              {filteredEntries.length > 10 && (
                <p className="text-center text-gray-500 mt-4">
                  Showing 10 of {filteredEntries.length} entries
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
