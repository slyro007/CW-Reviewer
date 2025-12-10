import { useMembersStore } from '@/stores/membersStore'
import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'

export default function EngineerSelector() {
  const { members, isLoading } = useMembersStore()
  const { selectedEngineerId, setSelectedEngineer } = useSelectedEngineerStore()

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    setSelectedEngineer(value === 'all' ? null : parseInt(value, 10))
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
        ) : (
          members.map((member) => (
            <option key={member.id} value={member.id.toString()}>
              {member.firstName} {member.lastName} ({member.identifier})
            </option>
          ))
        )}
      </select>
    </div>
  )
}

