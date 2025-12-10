/**
 * API Client for frontend
 * 
 * Utility functions to call the Vercel serverless API routes
 */

const API_BASE = import.meta.env.DEV ? '/api' : '/api'

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`)
  }

  return response.json()
}

export const api = {
  // Members
  getMembers: () => fetchAPI<any[]>('/members'),

  // Time Entries
  getTimeEntries: (params?: {
    startDate?: string
    endDate?: string
    memberIds?: number[]
  }) => {
    const queryParams = new URLSearchParams()
    if (params?.startDate) queryParams.append('startDate', params.startDate)
    if (params?.endDate) queryParams.append('endDate', params.endDate)
    if (params?.memberIds) queryParams.append('memberIds', params.memberIds.join(','))
    
    const query = queryParams.toString()
    return fetchAPI<any[]>(`/time-entries${query ? `?${query}` : ''}`)
  },

  // Tickets
  getTickets: (params?: {
    boardIds?: number[]
    startDate?: string
    endDate?: string
  }) => {
    const queryParams = new URLSearchParams()
    if (params?.boardIds) queryParams.append('boardIds', params.boardIds.join(','))
    if (params?.startDate) queryParams.append('startDate', params.startDate)
    if (params?.endDate) queryParams.append('endDate', params.endDate)
    
    const query = queryParams.toString()
    return fetchAPI<any[]>(`/tickets${query ? `?${query}` : ''}`)
  },

  // Boards
  getBoards: (type?: 'MS' | 'PS') => {
    const query = type ? `?type=${type}` : ''
    return fetchAPI<any[]>(`/boards${query}`)
  },

  // Analysis
  generateAnalysis: (template: string, data: any, options?: any) =>
    fetchAPI<{ analysis: string }>('/analyze', {
      method: 'POST',
      body: JSON.stringify({ template, data, options }),
    }),
}

