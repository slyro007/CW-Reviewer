import { create } from 'zustand'
import type { Ticket, Board } from '@/types'
import { api } from '@/lib/api'

// Only show tickets from this board (Projects page filter)
const PROJECT_BOARD_NAME = 'Project Board'

// Service desk boards to display in ServiceTickets page
export const SERVICE_BOARD_NAMES = [
  'Escalations(MS)',
  'HelpDesk (MS)', // Note: Exact capitalization from API
  'HelpDesk (TS)', // Note: Exact capitalization from API
  'Triage',
  'RMM-Continuum',
  'WL Internal',
]

interface TicketsState {
  tickets: Ticket[]
  serviceTickets: Ticket[]
  boards: Board[]
  serviceBoardIds: number[]
  projectBoardId: number | null
  isLoading: boolean
  isLoadingService: boolean
  error: string | null
  lastSync: Date | null
  lastServiceSync: Date | null
  setTickets: (tickets: Ticket[]) => void
  setServiceTickets: (tickets: Ticket[]) => void
  setBoards: (boards: Board[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  fetchTickets: (params?: { boardIds?: number[]; startDate?: string; endDate?: string }) => Promise<void>
  syncTickets: () => Promise<void>
  fetchBoards: () => Promise<void>
  fetchProjectBoardTickets: () => Promise<void>
  fetchServiceBoardTickets: () => Promise<void>
  syncServiceTickets: () => Promise<void>
  getTicketsByMember: (memberId: number, timeEntries: any[]) => Ticket[]
  getTicketStats: (tickets: Ticket[]) => TicketStats
  getServiceBoardName: (boardId: number) => string
}

export interface TicketStats {
  total: number
  open: number
  closed: number
  avgResolutionTime: number // in hours
  byBoard: Record<number, number>
}

export const useTicketsStore = create<TicketsState>((set, get) => ({
  tickets: [],
  serviceTickets: [],
  boards: [],
  serviceBoardIds: [],
  projectBoardId: null,
  isLoading: false,
  isLoadingService: false,
  error: null,

  lastSync: null,
  lastServiceSync: null,

  setTickets: (tickets) => set({ tickets, lastSync: new Date() }), // Set lastSync when full load happens
  setServiceTickets: (serviceTickets) => set({ serviceTickets, lastServiceSync: new Date() }),
  setBoards: (boards) => set({ boards }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  fetchTickets: async (params) => {
    const { isLoading, lastSync } = get()
    if (isLoading) return

    // Prevent redundant fetches (5 min cache)
    if (!params && lastSync && (new Date().getTime() - lastSync.getTime() < 5 * 60 * 1000)) {
      console.log('[Tickets] Data is fresh, skipping fetch')
      return
    }

    set({ isLoading: true, error: null })
    try {
      const data = await api.getTickets(params)

      const tickets: Ticket[] = data.map((t: any) => ({
        id: t.id,
        summary: t.summary || '',
        boardId: t.board?.id || t.boardId || 0,
        status: t.status?.name || t.status || 'Unknown',
        closedDate: t.closedDate ? new Date(t.closedDate) : undefined,
        closedFlag: t.closedFlag || false,
        dateEntered: t.dateEntered ? new Date(t.dateEntered) : undefined,
        resolvedDate: t.resolvedDate ? new Date(t.resolvedDate) : undefined,
        resolutionTime: (t.resolvedDate || t.closedDate) && t.dateEntered
          ? (new Date(t.resolvedDate || t.closedDate).getTime() - new Date(t.dateEntered).getTime()) / (1000 * 60 * 60)
          : undefined,
        // Additional project fields
        type: t.type?.name || undefined,
        priority: t.priority?.name || undefined,
        owner: t.owner?.identifier || undefined,
        company: t.company?.name || undefined,
        estimatedHours: t.estimatedHours || undefined,
        actualHours: t.actualHours || undefined,
        updatedAt: t.updatedAt ? new Date(t.updatedAt) : undefined
      }))

      set({ tickets, isLoading: false, lastSync: new Date() })
      console.log(`✅ Fetched ${tickets.length} tickets`)
    } catch (error: any) {
      console.error('Error fetching tickets:', error)
      set({ error: error.message || 'Failed to fetch tickets', isLoading: false })
    }
  },

  syncTickets: async () => {
    const { lastSync, tickets, isLoading } = get()
    if (isLoading) return

    // If never fetched, do full fetch
    if (!lastSync) {
      return get().fetchTickets()
    }

    set({ isLoading: true })
    try {
      console.log(`[Tickets] Syncing updates since ${lastSync.toISOString()}...`)
      const data = await api.getTickets({ modifiedSince: lastSync.toISOString() })

      if (data.length === 0) {
        console.log('[Tickets] No updates found')
        set({ isLoading: false, lastSync: new Date() })
        return
      }

      const updates: Ticket[] = data.map((t: any) => ({
        id: t.id,
        summary: t.summary || '',
        boardId: t.board?.id || t.boardId || 0,
        status: t.status?.name || t.status || 'Unknown',
        closedDate: t.closedDate ? new Date(t.closedDate) : undefined,
        closedFlag: t.closedFlag || false,
        dateEntered: t.dateEntered ? new Date(t.dateEntered) : undefined,
        resolvedDate: t.resolvedDate ? new Date(t.resolvedDate) : undefined,
        resolutionTime: (t.resolvedDate || t.closedDate) && t.dateEntered
          ? (new Date(t.resolvedDate || t.closedDate).getTime() - new Date(t.dateEntered).getTime()) / (1000 * 60 * 60)
          : undefined,
        type: t.type?.name || undefined,
        priority: t.priority?.name || undefined,
        owner: t.owner?.identifier || undefined,
        company: t.company?.name || undefined,
        estimatedHours: t.estimatedHours || undefined,
        actualHours: t.actualHours || undefined,
        updatedAt: t.updatedAt ? new Date(t.updatedAt) : undefined
      }))

      // Merge updates
      const ticketMap = new Map(tickets.map(t => [t.id, t]))
      updates.forEach(u => ticketMap.set(u.id, u))

      const merged = Array.from(ticketMap.values())

      set({ tickets: merged, isLoading: false, lastSync: new Date() })
      console.log(`✅ Synced ${updates.length} ticket updates`)
    } catch (error: any) {
      console.error('Error syncing tickets:', error)
      // Don't clear existing data on sync error
      set({ isLoading: false })
    }
  },

  fetchBoards: async () => {
    try {
      const data = await api.getBoards()

      const boards: Board[] = data.map((b: any) => ({
        id: b.id,
        name: b.name || '',
        type: b.name?.includes('MS') ? 'MS' : 'PS',
      }))

      // Find the "Project Board" and store its ID
      const projectBoard = boards.find(b => b.name === PROJECT_BOARD_NAME)
      if (projectBoard) {
        console.log(`✅ Found "${PROJECT_BOARD_NAME}" with ID: ${projectBoard.id}`)
      }

      // Find service board IDs
      const serviceBoardIds = boards
        .filter(b => SERVICE_BOARD_NAMES.includes(b.name))
        .map(b => b.id)

      console.log(`✅ Found ${serviceBoardIds.length} service boards:`,
        boards.filter(b => serviceBoardIds.includes(b.id)).map(b => b.name))

      set({
        boards,
        projectBoardId: projectBoard?.id || null,
        serviceBoardIds,
      })
    } catch (error: any) {
      console.error('Error fetching boards:', error)
    }
  },

  // Fetch only tickets from "Project Board"
  fetchProjectBoardTickets: async () => {
    const { isLoading, projectBoardId, lastSync } = get()
    if (isLoading) return

    // Prevent redundant fetches (5 min cache)
    if (lastSync && (new Date().getTime() - lastSync.getTime() < 5 * 60 * 1000)) {
      console.log('[Project Board Tickets] Data is fresh, skipping fetch')
      return
    }

    // If we don't have the board ID yet, fetch boards first
    if (!projectBoardId) {
      await get().fetchBoards()
    }

    const boardId = get().projectBoardId
    if (!boardId) {
      console.error('Cannot fetch project tickets - Project Board ID not found')
      set({ error: 'Project Board not found' })
      return
    }

    set({ isLoading: true, error: null })
    try {
      console.log(`[Tickets] Fetching tickets from "${PROJECT_BOARD_NAME}" (ID: ${boardId})...`)
      const data = await api.getTickets({ boardIds: [boardId] })

      const tickets: Ticket[] = data.map((t: any) => ({
        id: t.id,
        summary: t.summary || '',
        boardId: t.board?.id || t.boardId || 0,
        status: t.status?.name || t.status || 'Unknown',
        closedDate: t.closedDate ? new Date(t.closedDate) : undefined,
        closedFlag: t.closedFlag || false,
        dateEntered: t.dateEntered ? new Date(t.dateEntered) : undefined,
        resolvedDate: t.resolvedDate ? new Date(t.resolvedDate) : undefined,
        resolutionTime: (t.resolvedDate || t.closedDate) && t.dateEntered
          ? (new Date(t.resolvedDate || t.closedDate).getTime() - new Date(t.dateEntered).getTime()) / (1000 * 60 * 60)
          : undefined,
        // Additional project fields
        type: t.type?.name || undefined,
        priority: t.priority?.name || undefined,
        owner: t.owner?.identifier || undefined,
        company: t.company?.name || undefined,
        estimatedHours: t.estimatedHours || undefined,
        actualHours: t.actualHours || undefined,
      }))

      set({ tickets, isLoading: false, lastSync: new Date() })
      console.log(`✅ Fetched ${tickets.length} tickets from "${PROJECT_BOARD_NAME}"`)
    } catch (error: any) {
      console.error('Error fetching project board tickets:', error)
      set({ error: error.message || 'Failed to fetch tickets', isLoading: false })
    }
  },

  // Fetch tickets from service boards only
  fetchServiceBoardTickets: async () => {
    const { isLoadingService, serviceBoardIds, lastServiceSync } = get()
    if (isLoadingService) return

    // Prevent redundant fetches (5 min cache)
    if (lastServiceSync && (new Date().getTime() - lastServiceSync.getTime() < 5 * 60 * 1000)) {
      console.log('[Service Tickets] Data is fresh, skipping fetch')
      return
    }

    // If we don't have the board IDs yet, fetch boards first
    if (serviceBoardIds.length === 0) {
      await get().fetchBoards()
    }

    const boardIds = get().serviceBoardIds
    if (boardIds.length === 0) {
      console.error('Cannot fetch service tickets - No service boards found')
      set({ error: 'Service boards not found' })
      return
    }

    set({ isLoadingService: true, error: null })
    try {
      console.log(`[Tickets] Fetching tickets from ${boardIds.length} service boards...`)
      const data = await api.getTickets({ boardIds })

      const serviceTickets: Ticket[] = data.map((t: any) => ({
        id: t.id,
        summary: t.summary || '',
        boardId: t.board?.id || t.boardId || 0,
        status: t.status?.name || t.status || 'Unknown',
        closedDate: t.closedDate ? new Date(t.closedDate) : undefined,
        closedFlag: t.closedFlag || false,
        dateEntered: t.dateEntered ? new Date(t.dateEntered) : undefined,
        resolvedDate: t.resolvedDate ? new Date(t.resolvedDate) : undefined,
        resolutionTime: (t.resolvedDate || t.closedDate) && t.dateEntered
          ? (new Date(t.resolvedDate || t.closedDate).getTime() - new Date(t.dateEntered).getTime()) / (1000 * 60 * 60)
          : undefined,
        type: t.type?.name || undefined,
        priority: t.priority?.name || undefined,
        owner: t.owner?.identifier || t.owner || undefined,
        company: t.company?.name || t.company || undefined,
        estimatedHours: t.estimatedHours || undefined,
        actualHours: t.actualHours || undefined,
        resources: t.teamMember || t.resources || undefined,
      }))

      set({ serviceTickets, isLoadingService: false, lastServiceSync: new Date() })
      console.log(`✅ Fetched ${serviceTickets.length} service tickets`)
    } catch (error: any) {
      console.error('Error fetching service board tickets:', error)
      set({ error: error.message || 'Failed to fetch service tickets', isLoadingService: false })
    }
  },

  syncServiceTickets: async () => {
    const { lastServiceSync, serviceTickets, isLoadingService, serviceBoardIds } = get()
    if (isLoadingService) return

    if (!lastServiceSync) {
      return get().fetchServiceBoardTickets()
    }

    // Ensure we have board IDs
    let boardIds = serviceBoardIds
    if (boardIds.length === 0) {
      await get().fetchBoards()
      boardIds = get().serviceBoardIds
      if (boardIds.length === 0) return // Still no boards
    }

    set({ isLoadingService: true })
    try {
      console.log(`[Tickets] Syncing service ticket updates since ${lastServiceSync.toISOString()}...`)
      const data = await api.getTickets({
        boardIds,
        modifiedSince: lastServiceSync.toISOString()
      })

      if (data.length === 0) {
        console.log('[Tickets] No service ticket updates found')
        set({ isLoadingService: false, lastServiceSync: new Date() })
        return
      }

      const updates: Ticket[] = data.map((t: any) => ({
        id: t.id,
        summary: t.summary || '',
        boardId: t.board?.id || t.boardId || 0,
        status: t.status?.name || t.status || 'Unknown',
        closedDate: t.closedDate ? new Date(t.closedDate) : undefined,
        closedFlag: t.closedFlag || false,
        dateEntered: t.dateEntered ? new Date(t.dateEntered) : undefined,
        resolvedDate: t.resolvedDate ? new Date(t.resolvedDate) : undefined,
        resolutionTime: (t.resolvedDate || t.closedDate) && t.dateEntered
          ? (new Date(t.resolvedDate || t.closedDate).getTime() - new Date(t.dateEntered).getTime()) / (1000 * 60 * 60)
          : undefined,
        type: t.type?.name || undefined,
        priority: t.priority?.name || undefined,
        owner: t.owner?.identifier || t.owner || undefined,
        company: t.company?.name || t.company || undefined,
        estimatedHours: t.estimatedHours || undefined,
        actualHours: t.actualHours || undefined,
        resources: t.teamMember || t.resources || undefined,
        updatedAt: t.updatedAt ? new Date(t.updatedAt) : undefined
      }))

      // Merge
      const map = new Map(serviceTickets.map(t => [t.id, t]))
      updates.forEach(u => map.set(u.id, u))

      const merged = Array.from(map.values())

      set({ serviceTickets: merged, isLoadingService: false, lastServiceSync: new Date() })
      console.log(`✅ Synced ${updates.length} service ticket updates`)
    } catch (error: any) {
      console.error('Error syncing service tickets:', error)
      set({ isLoadingService: false })
    }
  },

  // Get board name by ID
  getServiceBoardName: (boardId) => {
    const { boards } = get()
    const board = boards.find(b => b.id === boardId)
    return board?.name || `Board ${boardId}`
  },

  // Get tickets that a member worked on based on their time entries
  getTicketsByMember: (memberId, timeEntries) => {
    const { tickets } = get()
    const memberTicketIds = new Set(
      timeEntries
        .filter(e => e.memberId === memberId && e.ticketId)
        .map(e => e.ticketId)
    )
    return tickets.filter(t => memberTicketIds.has(t.id))
  },

  getTicketStats: (tickets) => {
    const closed = tickets.filter(t => t.closedFlag)
    const open = tickets.filter(t => !t.closedFlag)

    const resolutionTimes = closed
      .filter(t => t.resolutionTime && t.resolutionTime > 0)
      .map(t => t.resolutionTime!)

    const avgResolutionTime = resolutionTimes.length > 0
      ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
      : 0

    const byBoard: Record<number, number> = {}
    tickets.forEach(t => {
      byBoard[t.boardId] = (byBoard[t.boardId] || 0) + 1
    })

    return {
      total: tickets.length,
      open: open.length,
      closed: closed.length,
      avgResolutionTime,
      byBoard,
    }
  },
}))

