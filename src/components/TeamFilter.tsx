import { format } from 'date-fns'
import { useMembersStore } from '@/stores/membersStore'
import { useSelectedEngineerStore, TEAM_DEFINITIONS, type TeamName } from '@/stores/selectedEngineerStore'

export default function TeamFilter() {
    const { members } = useMembersStore()
    const { selectedEngineerId, setSelectedEngineer, selectedTeam, setSelectedTeam } = useSelectedEngineerStore()

    // Derive the list of available engineers based on the selected team
    const availableEngineers = members.filter(member => {
        // If "All Company", show all "allowed" members (those in the store)
        if (selectedTeam === 'All Company') return true

        // Otherwise, filter by the specific identifiers for that team
        const teamIdentifiers = TEAM_DEFINITIONS[selectedTeam]
        // Case-insensitive comparison
        return teamIdentifiers?.some(id => id.toLowerCase() === member.identifier.toLowerCase())
    })

    // Sort logic? Active first?
    // availableEngineers.sort(...)

    // Handlers
    const handleTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newTeam = e.target.value as TeamName
        setSelectedTeam(newTeam)
        // Auto-select "All members" (null) when team changes
        setSelectedEngineer(null)
    }

    const handleEngineerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value
        // If value is empty string, it means "All Members"
        setSelectedEngineer(value ? parseInt(value) : null)
    }

    const formatMemberLabel = (member: any) => {
        let label = `${member.firstName} ${member.lastName}`

        // Show dates if inactive or has specific range data
        if (!member.isActive && member.startDate) {
            const start = format(new Date(member.startDate), 'MMM yyyy')
            const end = member.endDate ? format(new Date(member.endDate), 'MMM yyyy') : 'Present'
            label += ` (${start} - ${end})`
        }
        return label
    }

    return (
        <div className="flex flex-col sm:flex-row gap-4">
            {/* Team Dropdown */}
            <div className="flex flex-col">
                <label htmlFor="team-select" className="text-xs text-gray-500 mb-1 ml-1">Team</label>
                <select
                    id="team-select"
                    value={selectedTeam}
                    onChange={handleTeamChange}
                    className="bg-gray-800 border-gray-700 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                >
                    <optgroup label="Active Teams">
                        <option value="All Company">All Company</option>
                        <option value="Service Desk">Service Desk</option>
                        <option value="Professional Services">Professional Services</option>
                        <option value="Professional Services + Management">Professional Services + Management</option>
                        <option value="Management">Management</option>
                    </optgroup>
                    <optgroup label="Inactive">
                        <option value="Past Employees">Past Employees</option>
                    </optgroup>
                </select>
            </div>

            {/* Engineer Dropdown */}
            <div className="flex flex-col">
                <label htmlFor="engineer-select" className="text-xs text-gray-500 mb-1 ml-1">Engineer</label>
                <select
                    id="engineer-select"
                    value={selectedEngineerId === null ? '' : selectedEngineerId}
                    onChange={handleEngineerChange}
                    className="bg-gray-800 border-gray-700 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 min-w-[200px]"
                >
                    <option value="">All members</option>
                    {availableEngineers.map((member) => (
                        <option key={member.id} value={member.id}>
                            {formatMemberLabel(member)}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    )
}
