import { useEffect } from 'react'
import { useMembersStore } from '@/stores/membersStore'
import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'

export default function EngineerSelector() {
  const { members, isLoading, error, fetchMembers } = useMembersStore()
  const { selectedEngineerId, setSelectedEngineer } = useSelectedEngineerStore()

  // Fetch members on mount if not already loaded
  useEffect(() => {
    if (members.length === 0 && !isLoading && !error) {
      fetchMembers()
    }
  }, [members.length, isLoading, error, fetchMembers])

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    setSelectedEngineer(value === 'all' ? null : parseInt(value, 10))
  }

  const handleRetry = () => {
    fetchMembers()
  }

  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-blue-300 mb-2">
        Select Engineer
      </label>
      <select
        value={selectedEngineerId === null ? 'all' : selectedEngineerId.toString()}
        onChange={handleChange}
        disabled={isLoading}
        className="w-full bg-purple-800 text-white rounded px-3 py-2 border border-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="all">All Engineers</option>
        {isLoading ? (
          <option disabled>Loading engineers...</option>
        ) : error ? (
          <option disabled>Error loading engineers</option>
        ) : members.length === 0 ? (
          <option disabled>No engineers found</option>
        ) : (
          members.map((member) => (
            <option key={member.id} value={member.id.toString()}>
              {member.firstName} {member.lastName} ({member.identifier})
            </option>
          ))
        )}
      </select>
      
      {error && (
        <div className="mt-2 p-2 bg-red-900/50 border border-red-700 rounded text-sm">
          <p className="text-red-300 mb-2">{error}</p>
          <button
            onClick={handleRetry}
            className="text-blue-300 hover:text-blue-200 underline text-xs"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

