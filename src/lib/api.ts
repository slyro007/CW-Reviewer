/**
 * API Client for frontend
 * 
 * Utility functions to call the Vercel serverless API routes
 */

const API_BASE = import.meta.env.DEV ? '/api' : '/api'

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  try {
    const url = `${API_BASE}${endpoint}`
    console.log(`[API] Fetching: ${url}`)

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })

    console.log(`[API] Response status: ${response.status} ${response.statusText}`)

    if (!response.ok) {
      // Try to get error details from response body
      let errorMessage = `API error: ${response.status} ${response.statusText || 'Unknown error'}`

      try {
        const errorBody = await response.text()
        if (errorBody) {
          try {
            const errorJson = JSON.parse(errorBody)
            errorMessage = errorJson.error || errorJson.message || errorMessage
          } catch {
            // If not JSON, use the text as error message
            errorMessage = errorBody.length > 200 ? errorBody.substring(0, 200) + '...' : errorBody
          }
        }
      } catch (parseError) {
        console.error('[API] Failed to parse error response:', parseError)
      }

      console.error(`[API] Error details:`, {
        url,
        status: response.status,
        statusText: response.statusText,
        errorMessage,
      })

      throw new Error(errorMessage)
    }

    // Try to parse JSON response
    try {
      const data = await response.json()
      return data
    } catch (jsonError) {
      console.error('[API] Failed to parse JSON response:', jsonError)
      throw new Error('Invalid JSON response from API')
    }
  } catch (error: any) {
    // If it's already our formatted error, re-throw it
    if (error.message && error.message.startsWith('API error:')) {
      throw error
    }

    // Otherwise, wrap network/other errors
    console.error('[API] Fetch error:', error)
    throw new Error(`Network error: ${error.message || 'Failed to fetch'}`)
  }
}

export const api = {
  // Members
  getMembers: () => fetchAPI<any[]>('/members'),

  // Time Entries
  getTimeEntries: (params?: {
    startDate?: string
    endDate?: string
    memberIds?: number[]
    projectId?: number
    modifiedSince?: string
  }) => {
    const queryParams = new URLSearchParams()
    if (params?.startDate) queryParams.append('startDate', params.startDate)
    if (params?.endDate) queryParams.append('endDate', params.endDate)
    if (params?.memberIds) queryParams.append('memberIds', params.memberIds.join(','))
    if (params?.projectId) queryParams.append('projectId', params.projectId.toString())
    if (params?.modifiedSince) queryParams.append('modifiedSince', params.modifiedSince)

    const query = queryParams.toString()
    return fetchAPI<any[]>(`/time-entries${query ? `?${query}` : ''}`)
  },

  // Tickets
  getTickets: (params?: {
    boardIds?: number[]
    startDate?: string
    endDate?: string
    modifiedSince?: string
  }) => {
    const queryParams = new URLSearchParams()
    if (params?.boardIds) queryParams.append('boardIds', params.boardIds.join(','))
    if (params?.startDate) queryParams.append('startDate', params.startDate)
    if (params?.endDate) queryParams.append('endDate', params.endDate)
    if (params?.modifiedSince) queryParams.append('modifiedSince', params.modifiedSince)

    const query = queryParams.toString()
    return fetchAPI<any[]>(`/tickets${query ? `?${query}` : ''}`)
  },

  // Boards
  getBoards: (type?: 'MS' | 'PS') => {
    const query = type ? `?type=${type}` : ''
    return fetchAPI<any[]>(`/boards${query}`)
  },

  // Service Boards (for service desk filtering)
  getServiceBoards: () => fetchAPI<any[]>('/service-boards'),

  // Projects (ConnectWise Project Management)
  getProjects: (params?: {
    managerIdentifier?: string
    status?: string
    modifiedSince?: string
  }) => {
    const queryParams = new URLSearchParams()
    if (params?.managerIdentifier) queryParams.append('managerIdentifier', params.managerIdentifier)
    if (params?.status) queryParams.append('status', params.status)
    if (params?.modifiedSince) queryParams.append('modifiedSince', params.modifiedSince)

    const query = queryParams.toString()
    return fetchAPI<any[]>(`/projects${query ? `?${query}` : ''}`)
  },

  // Project Tickets (tickets that belong to projects, different from service tickets)
  getProjectTickets: (params?: {
    projectId?: number
    modifiedSince?: string
  }) => {
    const queryParams = new URLSearchParams()
    if (params?.projectId) queryParams.append('projectId', params.projectId.toString())
    if (params?.modifiedSince) queryParams.append('modifiedSince', params.modifiedSince)

    const query = queryParams.toString()
    return fetchAPI<any[]>(`/project-tickets${query ? `?${query}` : ''}`)
  },

  // Analysis
  generateAnalysis: (template: string, data: any, options?: any) =>
    fetchAPI<{ analysis: string }>('/analyze', {
      method: 'POST',
      body: JSON.stringify({ template, data, options }),
    }),

  // Sync
  getSyncStatus: () =>
    fetchAPI<{
      isStale: boolean
      lastSync: string | null
      entities: Record<string, { lastSync: string | null; isStale: boolean; count: number }>
    }>('/sync'),

  performSync: (options?: { force?: boolean; entities?: string[] }) =>
    fetchAPI<{
      results: Array<{ entity: string; synced: boolean; count: number; message: string }>
      syncedAt: string
    }>('/sync', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),
}

