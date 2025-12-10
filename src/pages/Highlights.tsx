import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'

export default function Highlights() {
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { members } = useMembersStore()

  const selectedEngineer = selectedEngineerId 
    ? members.find(m => m.id === selectedEngineerId)
    : null

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">Highlights</h2>
        <p className="text-gray-400">
          {selectedEngineer 
            ? `Highlights for ${selectedEngineer.firstName} ${selectedEngineer.lastName}`
            : 'Highlights for all engineers'}
        </p>
      </div>

      <div className="bg-gray-800 rounded-lg p-6">
        <p className="text-gray-400">Key highlights and achievements will be displayed here</p>
      </div>
    </div>
  )
}

