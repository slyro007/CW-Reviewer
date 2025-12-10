import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'

export default function PerformanceReview() {
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { members } = useMembersStore()

  const selectedEngineer = selectedEngineerId 
    ? members.find(m => m.id === selectedEngineerId)
    : null

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">Performance Review</h2>
        <p className="text-gray-400">
          {selectedEngineer 
            ? `Performance review for ${selectedEngineer.firstName} ${selectedEngineer.lastName}`
            : 'Select an engineer to view performance review'}
        </p>
      </div>

      {selectedEngineerId === null ? (
        <div className="bg-gray-800 rounded-lg p-6">
          <p className="text-gray-400">Please select an engineer to view their performance review</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg p-6">
          <p className="text-gray-400">Performance review details will be displayed here</p>
        </div>
      )}
    </div>
  )
}

