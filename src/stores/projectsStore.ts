import { create } from 'zustand'
import type { Project, ProjectTicket } from '@/types'
import { api } from '@/lib/api'

export interface ProjectStats {
  total: number
  open: number
  inProgress: number
  onHold: number
  closed: number
  avgPercentComplete: number
  totalActualHours: number
  totalEstimatedHours: number
  byStatus: Record<string, number>
  byType: Record<string, number>
  byManager: Record<string, number>
  byCompany: Record<string, number>
}

export interface ProjectTicketStats {
  total: number
  byStatus: Record<string, number>
  byPhase: Record<string, number>
  byProject: Record<string, number>
  byEngineer: Record<string, number>
}

interface ProjectsState {
  projects: Project[]
  projectTickets: ProjectTicket[]
  isLoading: boolean
  isLoadingTickets: boolean
  error: string | null
  lastProjectSync: Date | null
  lastTicketSync: Date | null
  setProjects: (projects: Project[]) => void
  setProjectTickets: (tickets: ProjectTicket[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  fetchProjects: (managerIds?: string[]) => Promise<void>
  syncProjects: (managerIds?: string[]) => Promise<void>
  fetchProjectTickets: (projectId?: number) => Promise<void>
  syncProjectTickets: (projectId?: number) => Promise<void>
  getProjectsByManager: (managerIdentifier: string) => Project[]
  getProjectStats: (projects: Project[]) => ProjectStats
  getProjectTicketStats: (tickets: ProjectTicket[]) => ProjectTicketStats
  getTicketsByEngineer: (identifier: string) => ProjectTicket[]
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  projectTickets: [],
  isLoading: false,
  isLoadingTickets: false,
  error: null,
  lastProjectSync: null,
  lastTicketSync: null,

  setProjects: (projects) => set({ projects, lastProjectSync: new Date() }),
  setProjectTickets: (projectTickets) => set({ projectTickets, lastTicketSync: new Date() }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  fetchProjects: async (managerIds) => {
    const { isLoading, lastProjectSync } = get()
    if (isLoading) return

    // Prevent redundant fetches (5 min cache)
    if (!managerIds && lastProjectSync && (new Date().getTime() - lastProjectSync.getTime() < 5 * 60 * 1000)) {
      console.log('[Projects] Data is fresh, skipping fetch')
      return
    }

    set({ isLoading: true, error: null })
    try {
      console.log('[Projects Store] Fetching projects...', { managerIds })
      const data = await api.getProjects(managerIds ? { managerIdentifier: managerIds.join(',') } : undefined)

      const projects: Project[] = data.map((p: any) => ({
        id: p.id,
        name: p.name || '',
        status: p.status?.name || 'Unknown',
        company: p.company?.name || undefined,
        managerIdentifier: p.manager?.identifier || undefined,
        managerName: p.manager?.name || undefined,
        boardName: p.board?.name || undefined,
        estimatedStart: p.estimatedStart ? new Date(p.estimatedStart) : undefined,
        estimatedEnd: p.estimatedEnd ? new Date(p.estimatedEnd) : undefined,
        actualStart: p.actualStart ? new Date(p.actualStart) : undefined,
        actualEnd: p.actualEnd ? new Date(p.actualEnd) : undefined,
        actualHours: p.actualHours || 0,
        estimatedHours: p.estimatedHours || 0,
        percentComplete: p.percentComplete || 0,
        type: p.type?.name || undefined,
        closedFlag: p.closedFlag || false,
        description: p.description || undefined,
        updatedAt: p.updatedAt ? new Date(p.updatedAt) : undefined,
      }))

      set({ projects, isLoading: false, lastProjectSync: new Date() })
      console.log(`✅ Fetched ${projects.length} projects`)
    } catch (error: any) {
      console.error('Error fetching projects:', error)
      set({ error: error.message || 'Failed to fetch projects', isLoading: false })
    }
  },

  syncProjects: async (managerIds) => {
    const { lastProjectSync, projects, isLoading } = get()
    if (isLoading) return

    if (!lastProjectSync) {
      return get().fetchProjects(managerIds)
    }

    set({ isLoading: true })
    try {
      console.log(`[Projects] Syncing updates since ${lastProjectSync.toISOString()}...`)
      const data = await api.getProjects({
        managerIdentifier: managerIds ? managerIds.join(',') : undefined,
        modifiedSince: lastProjectSync.toISOString()
      })

      if (data.length === 0) {
        console.log('[Projects] No updates found')
        set({ isLoading: false, lastProjectSync: new Date() })
        return
      }

      const newProjects: Project[] = data.map((p: any) => ({
        id: p.id,
        name: p.name || '',
        status: p.status?.name || 'Unknown',
        company: p.company?.name || undefined,
        managerIdentifier: p.manager?.identifier || undefined,
        managerName: p.manager?.name || undefined,
        boardName: p.board?.name || undefined,
        estimatedStart: p.estimatedStart ? new Date(p.estimatedStart) : undefined,
        estimatedEnd: p.estimatedEnd ? new Date(p.estimatedEnd) : undefined,
        actualStart: p.actualStart ? new Date(p.actualStart) : undefined,
        actualEnd: p.actualEnd ? new Date(p.actualEnd) : undefined,
        actualHours: p.actualHours || 0,
        estimatedHours: p.estimatedHours || 0,
        percentComplete: p.percentComplete || 0,
        type: p.type?.name || undefined,
        closedFlag: p.closedFlag || false,
        description: p.description || undefined,
        updatedAt: p.updatedAt ? new Date(p.updatedAt) : undefined,
      }))

      let updatedProjects = [...projects]
      newProjects.forEach(newP => {
        const idx = updatedProjects.findIndex(p => p.id === newP.id)
        if (idx >= 0) {
          updatedProjects[idx] = newP
        } else {
          updatedProjects.push(newP)
        }
      })
      set({ projects: updatedProjects, isLoading: false, lastProjectSync: new Date() })
      console.log(`✅ Synced ${newProjects.length} projects`)

    } catch (error: any) {
      console.error('Error syncing projects:', error)
      set({ error: error.message, isLoading: false })
    }
  },

  fetchProjectTickets: async (projectId) => {
    const { isLoadingTickets, lastTicketSync } = get()
    if (isLoadingTickets) return

    // Prevent redundant fetches (5 min cache)
    if (!projectId && lastTicketSync && (new Date().getTime() - lastTicketSync.getTime() < 5 * 60 * 1000)) {
      console.log('[Project Tickets] Data is fresh, skipping fetch')
      return
    }

    set({ isLoadingTickets: true, error: null })
    try {
      console.log('[Projects Store] Fetching project tickets...', { projectId })
      const data = await api.getProjectTickets(projectId ? { projectId } : undefined)

      const projectTickets: ProjectTicket[] = data.map((t: any) => ({
        id: t.id,
        summary: t.summary || '',
        projectId: t.projectId || t.project?.id || 0,
        projectName: t.projectName || t.project?.name || '',
        status: t.status?.name || 'Unknown',
        closedDate: t.closedDate ? new Date(t.closedDate) : undefined,
        closedFlag: t.closedFlag || false,
        dateEntered: t.dateEntered ? new Date(t.dateEntered) : undefined,
        actualHours: t.actualHours || 0,
        budgetHours: t.budgetHours || 0,
        estimatedHours: t.budgetHours || 0, // Fallback
        resources: t.resources || '',
        boardId: t.boardId || 0,
        phaseName: t.phaseName || undefined,
        updatedAt: t.updatedAt ? new Date(t.updatedAt) : undefined
      }))

      set({ projectTickets, isLoadingTickets: false, lastTicketSync: new Date() })
      console.log(`✅ Fetched ${projectTickets.length} project tickets`)
    } catch (error: any) {
      console.error('Error fetching project tickets:', error)
      set({ error: error.message || 'Failed to fetch project tickets', isLoadingTickets: false })
    }
  },

  syncProjectTickets: async (projectId) => {
    const { lastTicketSync, projectTickets, isLoadingTickets } = get()
    if (isLoadingTickets) return

    if (!lastTicketSync) {
      return get().fetchProjectTickets(projectId)
    }

    set({ isLoadingTickets: true })
    try {
      console.log(`[Projects Store] Syncing ticket updates since ${lastTicketSync.toISOString()}...`)
      const data = await api.getProjectTickets({
        projectId,
        modifiedSince: lastTicketSync.toISOString()
      })

      if (data.length === 0) {
        console.log('[Projects Store] No ticket updates found')
        set({ isLoadingTickets: false, lastTicketSync: new Date() })
        return
      }

      const updates: ProjectTicket[] = data.map((t: any) => ({
        id: t.id,
        summary: t.summary || '',
        projectId: t.project?.id || 0,
        projectName: t.project?.name || undefined,
        phaseId: t.phase?.id || undefined,
        phaseName: t.phase?.name || undefined,
        boardId: t.board?.id || undefined,
        boardName: t.board?.name || undefined,
        status: t.status?.name || 'Unknown',
        company: t.company?.name || undefined,
        resources: t.resources || undefined,
        closedFlag: t.closedFlag || false,
        priority: t.priority?.name || undefined,
        type: t.type?.name || undefined,
        wbsCode: t.wbsCode || undefined,
        actualHours: t.actualHours || 0,
        budgetHours: t.budgetHours || 0,
        dateEntered: t.dateEntered ? new Date(t.dateEntered) : undefined,
        closedDate: t.closedDate ? new Date(t.closedDate) : undefined,
        updatedAt: t.updatedAt ? new Date(t.updatedAt) : undefined,
      }))

      // Merge
      const map = new Map(projectTickets.map(t => [t.id, t]))
      updates.forEach(u => map.set(u.id, u))

      const merged = Array.from(map.values())

      set({ projectTickets: merged, isLoadingTickets: false, lastTicketSync: new Date() })
      console.log(`✅ Synced ${updates.length} project ticket updates`)
    } catch (error: any) {
      console.error('Error syncing project tickets:', error)
      set({ isLoadingTickets: false })
    }
  },

  getProjectsByManager: (managerIdentifier) => {
    const { projects } = get()
    return projects.filter(p =>
      p.managerIdentifier?.toLowerCase() === managerIdentifier.toLowerCase()
    )
  },

  getProjectStats: (projects) => {
    const byStatus: Record<string, number> = {}
    const byType: Record<string, number> = {}
    const byManager: Record<string, number> = {}
    const byCompany: Record<string, number> = {}

    let totalActualHours = 0
    let totalEstimatedHours = 0
    let totalPercentComplete = 0

    projects.forEach(p => {
      // Status distribution
      const status = p.status || 'Unknown'
      byStatus[status] = (byStatus[status] || 0) + 1

      // Type distribution
      const type = p.type || 'Unclassified'
      byType[type] = (byType[type] || 0) + 1

      // Manager distribution
      const manager = p.managerName || p.managerIdentifier || 'Unassigned'
      byManager[manager] = (byManager[manager] || 0) + 1

      // Company distribution
      const company = p.company || 'Unknown'
      byCompany[company] = (byCompany[company] || 0) + 1

      // Hours
      totalActualHours += p.actualHours || 0
      totalEstimatedHours += p.estimatedHours || 0
      totalPercentComplete += p.percentComplete || 0
    })

    const open = projects.filter(p => p.status === 'Open').length
    const inProgress = projects.filter(p => p.status === 'In Progress').length
    const onHold = projects.filter(p => p.status === 'On-Hold').length
    const closed = projects.filter(p => p.closedFlag || p.status === 'Closed' || p.status === 'Ready to Close').length

    return {
      total: projects.length,
      open,
      inProgress,
      onHold,
      closed,
      avgPercentComplete: projects.length > 0 ? totalPercentComplete / projects.length : 0,
      totalActualHours,
      totalEstimatedHours,
      byStatus,
      byType,
      byManager,
      byCompany,
    }
  },

  getProjectTicketStats: (tickets) => {
    const byStatus: Record<string, number> = {}
    const byPhase: Record<string, number> = {}
    const byProject: Record<string, number> = {}
    const byEngineer: Record<string, number> = {}

    tickets.forEach(t => {
      // Status distribution
      const status = t.status || 'Unknown'
      byStatus[status] = (byStatus[status] || 0) + 1

      // Phase distribution
      const phase = t.phaseName || 'No Phase'
      byPhase[phase] = (byPhase[phase] || 0) + 1

      // Project distribution
      const project = t.projectName || 'Unknown Project'
      byProject[project] = (byProject[project] || 0) + 1

      // Engineer distribution (resources can be comma-separated)
      if (t.resources) {
        t.resources.split(',').forEach(engineer => {
          const eng = engineer.trim()
          if (eng) {
            byEngineer[eng] = (byEngineer[eng] || 0) + 1
          }
        })
      }
    })

    return {
      total: tickets.length,
      byStatus,
      byPhase,
      byProject,
      byEngineer,
    }
  },

  getTicketsByEngineer: (identifier) => {
    const { projectTickets } = get()
    return projectTickets.filter(t =>
      t.resources?.toLowerCase().includes(identifier.toLowerCase())
    )
  },
}))

