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
    // Validate config
    if (!config) {
      throw new Error('ConnectWiseConfig is required')
    }

    if (!config.clientId || !config.publicKey || !config.privateKey || !config.baseUrl || !config.companyId) {
      throw new Error('All ConnectWise config fields are required: clientId, publicKey, privateKey, baseUrl, companyId')
    }

    this.config = config
  }

  private async getCodebase(): Promise<string> {
    // Check for manual configuration first (recommended for production)
    const envCodebase = process.env.CW_CODEBASE
    if (envCodebase) {
      const codebase = envCodebase.endsWith('/') ? envCodebase : `${envCodebase}/`
      console.log('[ConnectWise] Using configured codebase:', codebase)
      return codebase
    }

    // For cloud environments, we need to detect the codebase dynamically
    // According to docs: https://ConnectWiseSite/login/companyinfo/CompanyId
    // This is a fallback and may be unreliable in serverless environments
    console.log('[ConnectWise] No CW_CODEBASE env var found, attempting dynamic detection...')

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

      // Add timeout to prevent hanging in serverless environment
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

      try {
        const response = await fetch(companyInfoUrl, {
          signal: controller.signal
        })
        clearTimeout(timeoutId)

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
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        if (fetchError.name === 'AbortError') {
          console.warn('[ConnectWise] Codebase detection timed out after 5 seconds')
        } else {
          console.warn('[ConnectWise] Codebase fetch error:', fetchError.message)
        }
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
    // Validate endpoint
    if (!endpoint || typeof endpoint !== 'string') {
      throw new Error('Endpoint must be a non-empty string')
    }

    const { page = 1, pageSize = 1000, conditions, orderBy, fields } = options

    // Validate config is still present
    if (!this.config || !this.config.baseUrl) {
      throw new Error('ConnectWise client configuration is missing')
    }

    // Get the correct codebase (cache it to avoid repeated calls)
    if (!this.codebase) {
      this.codebase = await this.getCodebase()
    }

    // Validate codebase
    if (!this.codebase) {
      throw new Error('Failed to determine ConnectWise codebase')
    }

    try {
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

      // Create base64 auth string (Node.js/Vercel serverless environment)
      const authString = `${this.config.companyId}+${this.config.publicKey}:${this.config.privateKey}`

      // Validate auth string components
      if (!this.config.companyId || !this.config.publicKey || !this.config.privateKey) {
        throw new Error('Missing authentication credentials')
      }

      // Buffer is always available in Node.js/Vercel serverless
      const auth = Buffer.from(authString).toString('base64')

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

      const data = await response.json()
      return data
    } catch (urlError: any) {
      // Handle URL construction or fetch errors
      if (urlError instanceof TypeError && urlError.message.includes('Invalid URL')) {
        throw new Error(`Invalid ConnectWise API URL: ${this.config.baseUrl}`)
      }
      throw urlError
    }
  }

  /**
   * Fetch all pages of results by automatically paginating through all available pages
   * This is useful when you need ALL records, not just the first 1000
   */
  async requestAllPages<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T[]> {
    let allResults: T[] = []
    let page = 1
    const pageSize = 1000
    let hasMore = true

    console.log(`[ConnectWise] Fetching all pages for ${endpoint}...`)

    while (hasMore) {
      try {
        const results = await this.request<T[]>(endpoint, {
          ...options,
          page,
          pageSize,
        })

        if (Array.isArray(results)) {
          allResults.push(...results)
          hasMore = results.length === pageSize
          console.log(`[ConnectWise] Page ${page}: ${results.length} records (total: ${allResults.length})`)
          page++
        } else {
          // If result is not an array, it might be a single object or different format
          console.warn(`[ConnectWise] Unexpected response format for ${endpoint} on page ${page}`)
          hasMore = false
        }
      } catch (error: any) {
        console.error(`[ConnectWise] Error fetching page ${page} of ${endpoint}:`, error.message)
        // If we got at least one page successfully, return what we have
        if (allResults.length > 0) {
          console.warn(`[ConnectWise] Returning ${allResults.length} records despite error on page ${page}`)
          return allResults
        }
        throw error
      }
    }

    console.log(`[ConnectWise] ✅ Fetched all pages for ${endpoint}: ${allResults.length} total records`)
    return allResults
  }

  /**
   * Fetch members (engineers) - basic info and identifiers only
   */
  async getMembers(options: RequestOptions = {}): Promise<any[]> {
    const conditions = 'inactiveFlag=false'
    return this.requestAllPages<any[]>('/system/members', {
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
   * @param modifiedSince - Only fetch records modified after this date (for incremental sync)
   */
  async getTimeEntries(
    startDate?: Date,
    endDate?: Date,
    memberIds?: number[],
    options: RequestOptions = {},
    modifiedSince?: Date
  ): Promise<any[]> {
    let conditions = ''

    if (startDate || endDate) {
      const dateConditions: string[] = []
      if (startDate) {
        dateConditions.push(`timeStart >= [${startDate.toISOString()}]`)
      }
      if (endDate) {
        dateConditions.push(`timeStart <= [${endDate.toISOString()}]`)
      }
      conditions = dateConditions.join(' AND ')
    }

    if (memberIds && memberIds.length > 0) {
      const memberCondition = `member/id IN (${memberIds.join(',')})`
      conditions = conditions
        ? `${conditions} AND ${memberCondition}`
        : memberCondition
    }

    // Incremental sync: only fetch records modified since last sync
    if (modifiedSince) {
      const modifiedCondition = `_info/lastUpdated > [${modifiedSince.toISOString()}]`
      conditions = conditions
        ? `${conditions} AND ${modifiedCondition}`
        : modifiedCondition
      console.log(`[ConnectWise] Incremental sync: fetching time entries modified since ${modifiedSince.toISOString()}`)
    }

    return this.requestAllPages<any[]>('/time/entries', {
      ...options,
      conditions: conditions || undefined,
      orderBy: 'timeStart desc',
      fields: options.fields || 'id,member/id,ticket/id,hours,actualHours,billableOption,notes,internalNotes,timeStart,timeEnd',
    })
  }

  /**
   * Fetch tickets - ID, summary, board (MS/PS), status, dates, type, priority, owner for resolution time
   * @param modifiedSince - Only fetch records modified after this date (for incremental sync)
   */
  async getTickets(
    boardIds?: number[],
    startDate?: Date,
    endDate?: Date,
    memberIdentifiers?: string[],
    options: RequestOptions = {},
    modifiedSince?: Date
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

    // Build member filter conditions
    if (memberIdentifiers && memberIdentifiers.length > 0) {
      // Filter by owner OR resources (team member)
      // We use team/identifier for resources condition
      const memberConditions: string[] = []
      memberIdentifiers.forEach(id => {
        memberConditions.push(`owner/identifier="${id}"`)
        memberConditions.push(`resources like "%${id}%"`)
      })

      const memberRefFilter = `(${memberConditions.join(' OR ')})`
      conditions = conditions
        ? `${conditions} AND ${memberRefFilter}`
        : memberRefFilter
    }

    // Incremental sync: only fetch records modified since last sync
    if (modifiedSince) {
      const modifiedCondition = `_info/lastUpdated > [${modifiedSince.toISOString()}]`
      conditions = conditions
        ? `${conditions} AND ${modifiedCondition}`
        : modifiedCondition
      console.log(`[ConnectWise] Incremental sync: fetching tickets modified since ${modifiedSince.toISOString()}`)
    }

    return this.requestAllPages<any[]>('/service/tickets', {
      ...options,
      conditions: conditions || undefined,
      orderBy: 'dateEntered desc',
      // Include additional fields: type, priority, owner, company, team members
      fields: options.fields || 'id,summary,board/id,status/name,closedDate,closedFlag,dateEntered,resolvedDate,type/name,priority/name,owner/identifier,company/name,estimatedHours,actualHours,team/id,teamMember/identifier,_info/dateEntered,_info/dateResolved,_info/closedDate',
    })
  }

  /**
   * Fetch boards - MS and PS board IDs only
   */
  async getBoards(type?: 'MS' | 'PS', options: RequestOptions = {}): Promise<any[]> {
    const conditions = type ? `name LIKE '%${type}%'` : undefined
    return this.requestAllPages<any[]>('/service/boards', {
      ...options,
      conditions: options.conditions
        ? (conditions ? `${conditions} AND ${options.conditions}` : options.conditions)
        : conditions,
      fields: options.fields || 'id,name',
    })
  }

  /**
   * Fetch projects from ConnectWise Projects API
   * Returns actual project management entities with status, manager, dates, etc.
   * @param modifiedSince - Only fetch records modified after this date (for incremental sync)
   */
  async getProjects(
    managerIds?: string[], // Manager identifiers like 'DSolomon', 'EHammond'
    options: RequestOptions = {},
    modifiedSince?: Date
  ): Promise<any[]> {
    let conditions = ''

    if (managerIds && managerIds.length > 0) {
      // Filter by manager identifier
      const managerConditions = managerIds.map(id => `manager/identifier='${id}'`).join(' OR ')
      conditions = `(${managerConditions})`
    }

    // Incremental sync: only fetch records modified since last sync
    if (modifiedSince) {
      const modifiedCondition = `_info/lastUpdated > [${modifiedSince.toISOString()}]`
      conditions = conditions
        ? `${conditions} AND ${modifiedCondition}`
        : modifiedCondition
      console.log(`[ConnectWise] Incremental sync: fetching projects modified since ${modifiedSince.toISOString()}`)
    }

    return this.requestAllPages<any[]>('/project/projects', {
      ...options,
      conditions: conditions || undefined,
      orderBy: options.orderBy || 'id desc',
      // Include key project fields for analytics
      fields: options.fields || 'id,name,status/name,company/name,manager/identifier,manager/name,board/name,estimatedStart,estimatedEnd,actualStart,actualEnd,actualHours,estimatedHours,percentComplete,type/name,closedFlag,description',
    })
  }

  /**
   * Fetch project phases for a specific project
   */
  async getProjectPhases(projectId: number, options: RequestOptions = {}): Promise<any[]> {
    return this.request<any[]>(`/project/projects/${projectId}/phases`, {
      ...options,
      fields: options.fields || 'id,description,board/name,status/name,scheduledStart,scheduledEnd,actualStart,actualEnd,actualHours,budgetHours',
    })
  }

  /**
   * Fetch project tickets - these are tickets that belong to projects
   * Different from service tickets - accessed via /project/tickets
   * @param modifiedSince - Only fetch records modified after this date (for incremental sync)
   */
  async getProjectTickets(
    projectId?: number,
    options: RequestOptions = {},
    modifiedSince?: Date
  ): Promise<any[]> {
    let conditions = ''

    if (projectId) {
      conditions = `project/id=${projectId}`
    }

    // Incremental sync: only fetch records modified since last sync
    if (modifiedSince) {
      const modifiedCondition = `_info/lastUpdated > [${modifiedSince.toISOString()}]`
      conditions = conditions
        ? `${conditions} AND ${modifiedCondition}`
        : modifiedCondition
      console.log(`[ConnectWise] Incremental sync: fetching project tickets modified since ${modifiedSince.toISOString()}`)
    }

    return this.requestAllPages<any[]>('/project/tickets', {
      ...options,
      conditions: conditions || undefined,
      orderBy: options.orderBy || 'id desc',
      // Include key fields for project ticket analysis
      fields: options.fields || 'id,summary,project/id,project/name,phase/id,phase/name,board/id,board/name,status/name,company/name,resources,closedFlag,priority/name,type/name,wbsCode,actualHours,budgetHours,dateEntered,closedDate,_info/dateEntered,_info/closedDate',
    })
  }
  /**
   * Fetch audit trail for a specific member/record
   * This is used to find history of changes (e.g. who closed a project)
   */
  async getAuditTrail(type: string, id: number, options: RequestOptions = {}): Promise<any[]> {
    return this.requestAllPages<any[]>(`/system/auditTrail`, {
      ...options,
      conditions: `type="${type}" AND id=${id}`,
      orderBy: 'dateEntered desc',
    })
  }
}

export default ConnectWiseClient

