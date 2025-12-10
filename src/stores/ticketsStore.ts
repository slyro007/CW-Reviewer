import { create } from 'zustand'
import type { Ticket, Board } from '@/types'
import { api } from '@/lib/api'

// Only show tickets from this board (Projects page filter)
const PROJECT_BOARD_NAME = 'Project Board'

interface TicketsState {
  tickets: Ticket[]
  boards: Board[]
  projectBoardId: number | null
  isLoading: boolean
  error: string | null
  setTickets: (tickets: Ticket[]) => void
  setBoards: (boards: Board[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  fetchTickets: (params?: { boardIds?: number[]; startDate?: string; endDate?: string }) => Promise<void>
  fetchBoards: () => Promise<void>
  fetchProjectBoardTickets: () => Promise<void>
  getTicketsByMember: (memberId: number, timeEntries: any[]) => Ticket[]
  getTicketStats: (tickets: Ticket[]) => TicketStats
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
  boards: [],
  projectBoardId: null,
  isLoading: false,
  error: null,
  
  setTickets: (tickets) => set({ tickets }),
  setBoards: (boards) => set({ boards }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  
  fetchTickets: async (params) => {
    const { isLoading } = get()
    if (isLoading) return
    
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
        resolutionTime: t.closedDate && t.dateEntered 
          ? (new Date(t.closedDate).getTime() - new Date(t.dateEntered).getTime()) / (1000 * 60 * 60)
          : undefined,
        // Additional project fields
        type: t.type?.name || undefined,
        priority: t.priority?.name || undefined,
        owner: t.owner?.identifier || undefined,
        company: t.company?.name || undefined,
        estimatedHours: t.estimatedHours || undefined,
        actualHours: t.actualHours || undefined,
      }))
      
      set({ tickets, isLoading: false })
      console.log(`✅ Fetched ${tickets.length} tickets`)
    } catch (error: any) {
      console.error('Error fetching tickets:', error)
      set({ error: error.message || 'Failed to fetch tickets', isLoading: false })
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
        set({ boards, projectBoardId: projectBoard.id })
      } else {
        console.warn(`⚠️ "${PROJECT_BOARD_NAME}" not found. Available boards:`, boards.map(b => b.name))
        set({ boards })
      }
    } catch (error: any) {
      console.error('Error fetching boards:', error)
    }
  },
  
  // Fetch only tickets from "Project Board"
  fetchProjectBoardTickets: async () => {
    const { isLoading, projectBoardId } = get()
    if (isLoading) return
    
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
        resolutionTime: t.closedDate && t.dateEntered 
          ? (new Date(t.closedDate).getTime() - new Date(t.dateEntered).getTime()) / (1000 * 60 * 60)
          : undefined,
        // Additional project fields
        type: t.type?.name || undefined,
        priority: t.priority?.name || undefined,
        owner: t.owner?.identifier || undefined,
        company: t.company?.name || undefined,
        estimatedHours: t.estimatedHours || undefined,
        actualHours: t.actualHours || undefined,
      }))
      
      set({ tickets, isLoading: false })
      console.log(`✅ Fetched ${tickets.length} tickets from "${PROJECT_BOARD_NAME}"`)
    } catch (error: any) {
      console.error('Error fetching project board tickets:', error)
      set({ error: error.message || 'Failed to fetch tickets', isLoading: false })
    }
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

