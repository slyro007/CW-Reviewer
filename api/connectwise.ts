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
  fields?: string // For partial field responses to reduce payload size
}

class ConnectWiseClient {
  private config: ConnectWiseConfig
  private codebase: string | null = null

  constructor(config: ConnectWiseConfig) {
    this.config = config
  }

  private async getCodebase(): Promise<string> {
    // For cloud environments, we need to detect the codebase dynamically
    // According to docs: https://ConnectWiseSite/login/companyinfo/CompanyId
    try {
      // Handle both api-na.myconnectwise.net and na.myconnectwise.net formats
      let siteUrl = this.config.baseUrl.replace('https://', '')
      
      // If baseUrl contains 'api-', remove it for companyinfo endpoint
      // Otherwise, use as-is (for on-premise or direct URLs)
      if (siteUrl.startsWith('api-')) {
        siteUrl = siteUrl.replace('api-', '')
      }
      
      const companyInfoUrl = `https://${siteUrl}/login/companyinfo/${this.config.companyId}`
      console.log('[ConnectWise] Fetching codebase from:', companyInfoUrl)
      
      const response = await fetch(companyInfoUrl)
      console.log('[ConnectWise] Codebase response status:', response.status)
      
      if (response.ok) {
        const info = await response.json()
        // Cloud returns versioned codebase like "v2017_3/", on-premise returns "v4_6_release/"
        // Ensure it ends with / for proper URL construction
        const codebase = info.Codebase || 'v4_6_release/'
        const finalCodebase = codebase.endsWith('/') ? codebase : `${codebase}/`
        console.log('[ConnectWise] Detected codebase:', finalCodebase)
        return finalCodebase
      } else {
        console.warn('[ConnectWise] Codebase detection failed with status:', response.status)
      }
    } catch (error) {
      // If we can't determine, default to v4_6_release
      console.warn('[ConnectWise] Could not determine codebase, using default:', error)
    }
    console.log('[ConnectWise] Using default codebase: v4_6_release/')
    return 'v4_6_release/'
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { page = 1, pageSize = 1000, conditions, orderBy, fields } = options
    
    // Get the correct codebase (cache it to avoid repeated calls)
    if (!this.codebase) {
      this.codebase = await this.getCodebase()
    }
    
    const url = new URL(`${this.config.baseUrl}/${this.codebase}apis/3.0${endpoint}`)
    console.log('[ConnectWise] Request URL:', url.toString())
    url.searchParams.append('page', page.toString())
    url.searchParams.append('pageSize', pageSize.toString())
    if (conditions) {
      url.searchParams.append('conditions', conditions)
    }
    if (orderBy) {
      url.searchParams.append('orderBy', orderBy)
    }
    if (fields) {
      url.searchParams.append('fields', fields)
    }

    // Create base64 auth string (works in both Node.js and serverless)
    const authString = `${this.config.companyId}+${this.config.publicKey}:${this.config.privateKey}`
    const auth = typeof Buffer !== 'undefined' 
      ? Buffer.from(authString).toString('base64')
      : btoa(authString)

    // Accept header: Use application/vnd.connectwise.com+json without version parameter
    // The version is handled via the codebase in the URL path
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/vnd.connectwise.com+json',
        'Content-Type': 'application/json',
        'clientId': this.config.clientId,
      },
    })

    if (!response.ok) {
      let errorText = response.statusText
      try {
        const errorBody = await response.text()
        if (errorBody) {
          try {
            const errorJson = JSON.parse(errorBody)
            errorText = errorJson.message || errorJson.error || errorBody
          } catch {
            errorText = errorBody.length > 200 ? errorBody.substring(0, 200) + '...' : errorBody
          }
        }
      } catch (parseError) {
        console.warn('[ConnectWise] Could not parse error response')
      }
      
      console.error('[ConnectWise] API Error:', {
        endpoint,
        status: response.status,
        statusText: response.statusText,
        errorText,
        url: url.toString(),
      })
      
      throw new Error(`ConnectWise API error (${response.status}): ${errorText}`)
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
      fields: options.fields || 'id,identifier,firstName,lastName,emailAddress,inactiveFlag',
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
      fields: options.fields || 'id,member/id,ticket/id,hours,actualHours,billableOption,notes,internalNotes,dateStart,dateEnd,timeStart,timeEnd',
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
      fields: options.fields || 'id,summary,board/id,status/name,closedDate,closedFlag,dateEntered,resolvedDate',
    })
  }

  /**
   * Fetch boards - MS and PS board IDs only
   */
  async getBoards(type?: 'MS' | 'PS', options: RequestOptions = {}): Promise<any[]> {
    const conditions = type ? `name LIKE '%${type}%'` : undefined
    return this.request<any[]>('/service/boards', {
      ...options,
      conditions: options.conditions 
        ? (conditions ? `${conditions} AND ${options.conditions}` : options.conditions)
        : conditions,
      fields: options.fields || 'id,name',
    })
  }
}

export default ConnectWiseClient

