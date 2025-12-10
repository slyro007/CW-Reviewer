import { useSelectedEngineerStore } from '@/stores/selectedEngineerStore'
import { useMembersStore } from '@/stores/membersStore'

export default function Export() {
  const { selectedEngineerId } = useSelectedEngineerStore()
  const { members } = useMembersStore()

  const selectedEngineer = selectedEngineerId 
    ? members.find(m => m.id === selectedEngineerId)
    : null

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">Export</h2>
        <p className="text-gray-400">
          {selectedEngineer 
            ? `Export data for ${selectedEngineer.firstName} ${selectedEngineer.lastName}`
            : 'Export data for all engineers'}
        </p>
      </div>

      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Export Options</h3>
        <div className="space-y-4">
          <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors">
            Export as PDF
          </button>
          <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors">
            Export as CSV
          </button>
          <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors">
            Export AI Summary
          </button>
        </div>
      </div>
    </div>
  )
}

