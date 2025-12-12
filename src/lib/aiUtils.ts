import { Ticket, TimeEntry, Project } from '@/types'
import { format } from 'date-fns'

/**
 * Prepares ticket data for AI analysis.
 * summarizing keys and filtering to top items to respect token limits.
 */
export function prepareTicketData(tickets: Ticket[], limit = 50) {
    // Sort by date entered (newest first) or closed date if available
    const sorted = [...tickets].sort((a, b) => {
        const dateA = a.closedDate ? new Date(a.closedDate) : (a.dateEntered ? new Date(a.dateEntered) : new Date(0))
        const dateB = b.closedDate ? new Date(b.closedDate) : (b.dateEntered ? new Date(b.dateEntered) : new Date(0))
        return dateB.getTime() - dateA.getTime()
    })

    return sorted.slice(0, limit).map(t => ({
        id: t.id,
        summary: t.summary,
        status: t.status,
        board: t.boardId, // You might want board name if available in context, but ID is shorter
        company: t.company,
        hours: t.actualHours,
        resolution: t.resolutionTime ? `${t.resolutionTime.toFixed(1)}h` : undefined,
        closed: t.closedFlag ? 'Yes' : 'No'
    }))
}

/**
 * Prepares time entry data for AI analysis.
 * Aggregates by Ticket or Project to show "what was worked on".
 */
export function prepareTimeEntryData(entries: TimeEntry[], limit = 30) {
    // Group by Ticket or Project or Summary
    const grouped = new Map<string, { description: string; hours: number; count: number }>()

    entries.forEach(e => {
        // Create a key based on what we have
        let key = e.notes || 'No description'
        // If it's a ticket, group by ticket summary if possible, but we might only have ID here.
        // If we have text notes, use them (truncated)
        if (e.notes && e.notes.length > 50) key = e.notes.substring(0, 50) + '...'

        const existing = grouped.get(key) || { description: key, hours: 0, count: 0 }
        existing.hours += e.hours
        existing.count += 1
        grouped.set(key, existing)
    })

    const sortedGroups = Array.from(grouped.values()).sort((a, b) => b.hours - a.hours)

    return sortedGroups.slice(0, limit).map(g => ({
        activity: g.description,
        totalHours: g.hours.toFixed(1),
        entries: g.count
    }))
}

/**
 * Prepares project data for AI analysis
 */
export function prepareProjectData(projects: Project[], limit = 20) {
    return projects.slice(0, limit).map(p => ({
        name: p.name,
        status: p.status,
        company: p.company,
        pm: p.managerIdentifier,
        percentComplete: p.percentComplete,
        deadline: p.estimatedEnd ? format(new Date(p.estimatedEnd), 'yyyy-MM-dd') : undefined
    }))
}
