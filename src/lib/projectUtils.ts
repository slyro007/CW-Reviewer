import { Project } from '@/types'

/**
 * Determines if a project is actually a "Workstation" setup/refresh
 * which should be treated as a Service Desk item rather than a Project.
 * 
 * Based on status "Workstation"
 */
export function isWorkstationProject(project: Project): boolean {
    if (!project.status) return false
    const status = project.status.toLowerCase()
    return status === 'workstation' || status === 'workstation setup' || status === 'workstation setups'
}

/**
 * Determines if a project is a standard project (not a workstation setup)
 */
export function isStandardProject(project: Project): boolean {
    return !isWorkstationProject(project)
}
/**
 * Determines if a project is considered "Open" / Active
 * "All Open status descript contains: scoping, in progress, open"
 * Also typically New, Scheduled.
 */
export function isProjectActive(project: Project): boolean {
    if (!project.status) return false
    if (project.closedFlag) return false
    const status = project.status.toLowerCase()

    // Explicit list based on request + standard active statuses
    return ['open', 'in progress', 'scoping', 'new', 'scheduled'].includes(status)
}

/**
 * Determines if a project is "On Hold"
 */
export function isProjectOnHold(project: Project): boolean {
    if (!project.status) return false
    const status = project.status.toLowerCase()
    return status.includes('on-hold') || status.includes('waiting')
}

/**
 * Determines if a project is effectively Closed
 * Includes "Ready to Close"
 */
export function isProjectClosed(project: Project): boolean {
    if (project.closedFlag) return true
    if (!project.status) return false
    const status = project.status.toLowerCase()
    return ['closed', 'completed', 'completed ai', 'ready to close', 'cancelled'].includes(status)
}
