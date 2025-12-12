import { useMemo } from 'react'
import { useMembersStore } from '@/stores/membersStore'
import { useSelectedEngineerStore, TEAM_DEFINITIONS } from '@/stores/selectedEngineerStore'
import { format } from 'date-fns'

export default function EmployeeHistory() {
    const { allMembers } = useMembersStore()
    const { selectedTeam } = useSelectedEngineerStore()

    const { activeMembers, pastMembers } = useMemo(() => {
        // 1. Filter by Team
        let relevantMembers = allMembers
        if (selectedTeam !== 'All Company') {
            const teamIds = TEAM_DEFINITIONS[selectedTeam] || []
            relevantMembers = allMembers.filter(m => teamIds.includes(m.identifier.toLowerCase()))
        }

        // 2. Sort by Name
        relevantMembers.sort((a, b) => (a.firstName || '').localeCompare(b.firstName || ''))

        // 3. Separate Active / Past
        const active: typeof allMembers = []
        const past: typeof allMembers = []

        relevantMembers.forEach(m => {
            // Logic: isActive flag is primary. If missing, check inactiveFlag.
            // Also consider endDate? If endDate < now, they are past.
            const isActuallyActive = (m.isActive ?? !m.inactiveFlag) && (!m.endDate || new Date(m.endDate) > new Date())
            if (isActuallyActive) {
                active.push(m)
            } else {
                past.push(m)
            }
        })

        // Sort active by start date (tenure)? Or name? User screenshot looks sorted by tenure (2009 top) or random?
        // Screenshot: Bryan (2009), Shyanne (2020), Ezekiel (2023)... looks like Tenure (Oldest First).
        active.sort((a, b) => {
            const dateA = a.startDate ? new Date(a.startDate).getTime() : 0
            const dateB = b.startDate ? new Date(b.startDate).getTime() : 0
            return dateA - dateB
        })

        // Sort past by... End Date? (Most recent departure first?)
        // Screenshot: Dec 2025, Oct 2025... Yes, Descending End Date.
        past.sort((a, b) => {
            const dateA = a.endDate ? new Date(a.endDate).getTime() : 0
            const dateB = b.endDate ? new Date(b.endDate).getTime() : 0
            return dateB - dateA
        })

        return { activeMembers: active, pastMembers: past }
    }, [allMembers, selectedTeam])

    const formatRange = (m: typeof allMembers[0], isActive: boolean) => {
        const startYear = m.startDate ? format(new Date(m.startDate), 'yyyy') : '?'

        if (isActive) {
            return `${startYear} - Present`
        } else {
            const startStr = m.startDate ? format(new Date(m.startDate), 'MMM yyyy') : '?'
            const endStr = m.endDate ? format(new Date(m.endDate), 'MMM yyyy') : 'Present'
            return `${startStr} - ${endStr}`
        }
    }

    // If no members found (e.g. data not loaded yet), show skeletal or nothing
    if (allMembers.length === 0) return null

    return (
        <div className="bg-gray-800 rounded-lg p-6 w-full">
            <h3 className="text-lg font-bold text-white mb-4">Employee History</h3>

            <div className="space-y-6">
                {/* Active Team */}
                {activeMembers.length > 0 && (
                    <div>
                        <h4 className="text-sm font-semibold text-green-400 uppercase tracking-wider mb-3">
                            {selectedTeam === 'All Company' ? 'Active Team' : selectedTeam}
                        </h4>
                        <div className="space-y-2">
                            {activeMembers.map(emp => (
                                <div key={emp.id} className="flex justify-between items-baseline text-xs">
                                    <span className="text-gray-300 font-medium">{emp.firstName} {emp.lastName}</span>
                                    <span className="text-gray-500">{formatRange(emp, true)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Past Employees */}
                {pastMembers.length > 0 && (
                    <div>
                        <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Past Employees</h4>
                        <div className="space-y-2">
                            {pastMembers.map(emp => (
                                <div key={emp.id} className="flex justify-between items-baseline text-xs">
                                    <span className="text-gray-400 font-medium">{emp.firstName} {emp.lastName}</span>
                                    <span className="text-gray-600">{formatRange(emp, false)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeMembers.length === 0 && pastMembers.length === 0 && (
                    <p className="text-gray-500 text-sm italic">No history data available for this team.</p>
                )}
            </div>
        </div>
    )
}
