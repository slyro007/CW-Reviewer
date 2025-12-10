import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'

export default function Compare() {
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { members, selectedMembers, toggleMemberSelection } = useMembersStore()

  const selectedEngineer = selectedEngineerId 
    ? members.find(m => m.id === selectedEngineerId)
    : null

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">Compare</h2>
        <p className="text-gray-400">
          {selectedEngineer 
            ? `Compare ${selectedEngineer.firstName} ${selectedEngineer.lastName} with other engineers`
            : 'Select engineers to compare their performance'}
        </p>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">Select Engineers for Comparison</h3>
        <div className="space-y-2">
          {members.map((member) => (
            <label key={member.id} className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedMembers.includes(member.id)}
                onChange={() => toggleMemberSelection(member.id)}
                className="rounded border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-white">
                {member.firstName} {member.lastName} ({member.identifier})
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-6">
        <p className="text-gray-400">
          {selectedMembers.length < 2 
            ? 'Select at least 2 engineers to compare'
            : `Comparing ${selectedMembers.length} engineers...`}
        </p>
      </div>
    </div>
  )
}

