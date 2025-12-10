/**
 * ConnectWise Manage API Client (Read-Only)
 * 
 * This client only performs read operations and is designed for selective data fetching.
 * It includes date range filtering and pagination to avoid unnecessary data downloads.
 */

interface ConnectWiseConfig {
  clientId: string
  publicKey: string
  privateKey: string
  baseUrl: string
  companyId: string
}

interface RequestOptions {
  page?: number
  pageSize?: number
  conditions?: string
  orderBy?: string
}

class ConnectWiseClient {
  private config: ConnectWiseConfig

  constructor(config: ConnectWiseConfig) {
    this.config = config
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { page = 1, pageSize = 1000, conditions, orderBy } = options
    
    const url = new URL(`${this.config.baseUrl}/v4_6_release/apis/3.0${endpoint}`)
    url.searchParams.append('page', page.toString())
    url.searchParams.append('pageSize', pageSize.toString())
    if (conditions) {
      url.searchParams.append('conditions', conditions)
    }
    if (orderBy) {
      url.searchParams.append('orderBy', orderBy)
    }

    // Create base64 auth string (works in both Node.js and serverless)
    const authString = `${this.config.companyId}+${this.config.publicKey}:${this.config.privateKey}`
    const auth = typeof Buffer !== 'undefined' 
      ? Buffer.from(authString).toString('base64')
      : btoa(authString)

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'clientId': this.config.clientId,
      },
    })

    if (!response.ok) {
      throw new Error(`ConnectWise API error: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Fetch members (engineers) - basic info and identifiers only
   */
  async getMembers(options: RequestOptions = {}): Promise<any[]> {
    const conditions = 'inactiveFlag=false'
    return this.request<any[]>('/system/members', {
      ...options,
      conditions: options.conditions 
        ? `${conditions} AND ${options.conditions}`
        : conditions,
    })
  }

  /**
   * Fetch time entries with date range filtering
   * Only fetches: date, hours, billable, notes, member, ticket reference
   */
  async getTimeEntries(
    startDate?: Date,
    endDate?: Date,
    memberIds?: number[],
    options: RequestOptions = {}
  ): Promise<any[]> {
    let conditions = ''
    
    if (startDate || endDate) {
      const dateConditions: string[] = []
      if (startDate) {
        dateConditions.push(`dateStart >= [${startDate.toISOString()}]`)
      }
      if (endDate) {
        dateConditions.push(`dateStart <= [${endDate.toISOString()}]`)
      }
      conditions = dateConditions.join(' AND ')
    }

    if (memberIds && memberIds.length > 0) {
      const memberCondition = `member/id IN (${memberIds.join(',')})`
      conditions = conditions 
        ? `${conditions} AND ${memberCondition}`
        : memberCondition
    }

    return this.request<any[]>('/time/entries', {
      ...options,
      conditions: conditions || undefined,
      orderBy: 'dateStart desc',
    })
  }

  /**
   * Fetch tickets - ID, summary, board (MS/PS), status, dates for resolution time
   */
  async getTickets(
    boardIds?: number[],
    startDate?: Date,
    endDate?: Date,
    options: RequestOptions = {}
  ): Promise<any[]> {
    let conditions = ''
    
    if (boardIds && boardIds.length > 0) {
      conditions = `board/id IN (${boardIds.join(',')})`
    }

    if (startDate || endDate) {
      const dateConditions: string[] = []
      if (startDate) {
        dateConditions.push(`dateEntered >= [${startDate.toISOString()}]`)
      }
      if (endDate) {
        dateConditions.push(`dateEntered <= [${endDate.toISOString()}]`)
      }
      const dateCondition = dateConditions.join(' AND ')
      conditions = conditions 
        ? `${conditions} AND ${dateCondition}`
        : dateCondition
    }

    return this.request<any[]>('/service/tickets', {
      ...options,
      conditions: conditions || undefined,
      orderBy: 'dateEntered desc',
    })
  }

  /**
   * Fetch boards - MS and PS board IDs only
   */
  async getBoards(type?: 'MS' | 'PS'): Promise<any[]> {
    const conditions = type ? `name LIKE '%${type}%'` : undefined
    return this.request<any[]>('/service/boards', {
      conditions,
    })
  }
}

export default ConnectWiseClient

