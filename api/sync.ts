/**
 * Sync API Route
 * 
 * Syncs data from ConnectWise to the Neon database.
 * Only syncs data for the 7 allowed engineers.
 * Checks if data is stale (>1 hour) before syncing.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import prisma from './db.js'
import ConnectWiseClient from './connectwise.js'
import {
  ALLOWED_ENGINEER_IDENTIFIERS,
  SERVICE_BOARD_NAMES,
  SYNC_STALE_THRESHOLD_MS,
  SYNC_INCREMENTAL_FALLBACK
} from './config.js'

interface SyncStatus {
  entity: string
  synced: boolean
  count: number
  message: string
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // GET: Check sync status
  if (req.method === 'GET') {
    try {
      const syncLogs = await prisma.syncLog.findMany()
      const now = new Date()

      const status = {
        isStale: false,
        lastSync: null as Date | null,
        entities: {} as Record<string, { lastSync: Date | null; isStale: boolean; count: number }>
      }

      const entityTypes = ['members', 'boards', 'tickets', 'timeEntries', 'projects', 'projectTickets']

      for (const entityType of entityTypes) {
        const log = syncLogs.find(l => l.entityType === entityType)
        const lastSync = log?.lastSyncAt || null
        const isStale = !lastSync || (now.getTime() - lastSync.getTime() > SYNC_STALE_THRESHOLD_MS)

        status.entities[entityType] = {
          lastSync,
          isStale,
          count: log?.recordCount || 0
        }

        if (isStale) {
          status.isStale = true
        }

        if (lastSync && (!status.lastSync || lastSync > status.lastSync)) {
          status.lastSync = lastSync
        }
      }

      return res.status(200).json(status)
    } catch (error: any) {
      console.error('Error checking sync status:', error)
      return res.status(500).json({ error: error.message || 'Failed to check sync status' })
    }
  }

  // POST: Perform sync
  if (req.method === 'POST') {
    const { force = false, entities = [] } = req.body || {}

    try {
      const client = new ConnectWiseClient({
        clientId: process.env.CW_CLIENT_ID || process.env.VITE_CW_CLIENT_ID || '',
        publicKey: process.env.CW_PUBLIC_KEY || process.env.VITE_CW_PUBLIC_KEY || '',
        privateKey: process.env.CW_PRIVATE_KEY || '',
        baseUrl: process.env.CW_BASE_URL || process.env.VITE_CW_BASE_URL || '',
        companyId: process.env.CW_COMPANY_ID || process.env.VITE_CW_COMPANY_ID || '',
      })

      const results: SyncStatus[] = []
      const now = new Date()

      // Determine which entities to sync
      const entitiesToSync = entities.length > 0
        ? entities
        : ['members', 'boards', 'tickets', 'timeEntries', 'projects', 'projectTickets']

      // Check staleness for each entity
      const syncLogs = await prisma.syncLog.findMany()

      // First, sync members to get the allowed member IDs
      let allowedMemberIds: number[] = []

      for (const entityType of entitiesToSync) {
        const log = syncLogs.find(l => l.entityType === entityType)
        const lastSyncAt = log?.lastSyncAt || null
        const isStale = !lastSyncAt || (now.getTime() - lastSyncAt.getTime() > SYNC_STALE_THRESHOLD_MS)

        if (!isStale && !force) {
          results.push({
            entity: entityType,
            synced: false,
            count: log?.recordCount || 0,
            message: 'Data is fresh, skipping sync'
          })
          continue
        }

        // Determine if this is an incremental sync or full sync
        // Full sync: first time (no lastSyncAt), force=true, or for members/boards (small datasets)
        const isIncrementalSync = Boolean(lastSyncAt && !force && !['members', 'boards'].includes(entityType))
        const syncMode = isIncrementalSync ? 'incremental' : 'full'

        console.log(`[Sync] Starting ${syncMode} sync for ${entityType}...`)
        if (isIncrementalSync && lastSyncAt) {
          console.log(`[Sync] Fetching records modified since ${lastSyncAt.toISOString()}`)
        }

        // Mark as in progress
        await prisma.syncLog.upsert({
          where: { entityType },
          create: { entityType, lastSyncAt: now, status: 'in_progress' },
          update: { status: 'in_progress' }
        })

        // Helper function to perform the actual sync
        const performEntitySync = async (useIncremental: boolean): Promise<{ count: number; message: string }> => {
          let count = 0
          let message = ''

          switch (entityType) {
            case 'members':
              // Members always do full sync (small dataset, important to stay current)
              const memberResult = await syncMembers(client)
              count = memberResult.count
              allowedMemberIds = memberResult.memberIds
              message = `Full sync: ${count} engineers`
              break
            case 'boards':
              // Boards always do full sync (small dataset)
              count = await syncBoards(client)
              message = `Full sync: ${count} boards`
              break
            case 'tickets':
              // Get member IDs if not yet loaded
              if (allowedMemberIds.length === 0) {
                const members = await prisma.member.findMany()
                allowedMemberIds = members.map(m => m.id)
              }
              // Pass lastSyncAt for incremental sync
              count = await syncTickets(client, allowedMemberIds, useIncremental ? lastSyncAt! : undefined)
              message = useIncremental ? `Incremental: ${count} modified tickets` : `Full sync: ${count} tickets`
              break
            case 'timeEntries':
              // Get member IDs if not yet loaded
              if (allowedMemberIds.length === 0) {
                const members = await prisma.member.findMany()
                allowedMemberIds = members.map(m => m.id)
              }
              // Pass lastSyncAt for incremental sync
              count = await syncTimeEntries(client, allowedMemberIds, useIncremental ? lastSyncAt! : undefined)
              message = useIncremental ? `Incremental: ${count} modified entries` : `Full sync: ${count} entries`
              break
            case 'projects':
              // Pass lastSyncAt for incremental sync
              count = await syncProjects(client, useIncremental ? lastSyncAt! : undefined)
              message = useIncremental ? `Incremental: ${count} modified projects` : `Full sync: ${count} projects`
              break
            case 'projectTickets':
              // Pass lastSyncAt for incremental sync
              count = await syncProjectTickets(client, useIncremental ? lastSyncAt! : undefined)
              message = useIncremental ? `Incremental: ${count} modified tickets` : `Full sync: ${count} tickets`
              break
          }

          return { count, message }
        }

        try {
          let count = 0
          let message = ''
          let usedIncremental = isIncrementalSync

          try {
            // Attempt sync (incremental if applicable)
            const result = await performEntitySync(isIncrementalSync)
            count = result.count
            message = result.message
          } catch (syncError: any) {
            // If incremental sync failed and fallback is enabled, retry with full sync
            if (isIncrementalSync && SYNC_INCREMENTAL_FALLBACK) {
              console.warn(`[Sync] Incremental sync failed for ${entityType}, falling back to full sync...`)
              console.warn(`[Sync] Error was: ${syncError.message}`)

              usedIncremental = false
              const result = await performEntitySync(false) // Full sync
              count = result.count
              message = `Fallback full sync: ${count} records (incremental failed)`
            } else {
              // Re-throw if no fallback or not incremental
              throw syncError
            }
          }

          // For incremental sync, add to existing count
          const existingCount = log?.recordCount || 0
          const newTotalCount = usedIncremental ? existingCount : count

          // Update sync log
          await prisma.syncLog.upsert({
            where: { entityType },
            create: { entityType, lastSyncAt: now, recordCount: newTotalCount, status: 'success' },
            update: { lastSyncAt: now, recordCount: newTotalCount, status: 'success', errorMessage: null }
          })

          results.push({
            entity: entityType,
            synced: true,
            count,
            message
          })
        } catch (error: any) {
          console.error(`[Sync] Error syncing ${entityType}:`, error)
          // Update sync log with error
          await prisma.syncLog.upsert({
            where: { entityType },
            create: { entityType, lastSyncAt: now, status: 'failed', errorMessage: error.message },
            update: { status: 'failed', errorMessage: error.message }
          })

          results.push({
            entity: entityType,
            synced: false,
            count: 0,
            message: `Failed: ${error.message}`
          })
        }
      }

      return res.status(200).json({ results, syncedAt: now })
    } catch (error: any) {
      console.error('Error performing sync:', error)
      return res.status(500).json({ error: error.message || 'Failed to perform sync' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// Sync functions for each entity type

async function syncMembers(client: any): Promise<{ count: number; memberIds: number[] }> {
  console.log('[Sync] Fetching members from ConnectWise...')
  const allMembers = await client.getMembers()

  // Filter to only the 7 allowed engineers
  const allowedMembers = allMembers.filter((m: any) =>
    ALLOWED_ENGINEER_IDENTIFIERS.includes(m.identifier?.toLowerCase())
  )

  console.log(`[Sync] Found ${allMembers.length} total members, filtering to ${allowedMembers.length} allowed engineers`)

  const memberIds: number[] = []

  for (const member of allowedMembers) {
    memberIds.push(member.id)
    await prisma.member.upsert({
      where: { id: member.id },
      create: {
        id: member.id,
        identifier: member.identifier,
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.emailAddress,
        inactiveFlag: member.inactiveFlag || false,
      },
      update: {
        identifier: member.identifier,
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.emailAddress,
        inactiveFlag: member.inactiveFlag || false,
      }
    })
  }

  console.log(`[Sync] ✅ Synced ${allowedMembers.length} allowed engineers:`,
    allowedMembers.map((m: any) => m.identifier).join(', '))

  return { count: allowedMembers.length, memberIds }
}

async function syncBoards(client: any): Promise<number> {
  console.log('[Sync] Fetching boards from ConnectWise...')
  const boards = await client.getBoards()

  console.log(`[Sync] Upserting ${boards.length} boards to database...`)
  for (const board of boards) {
    const type = board.name?.includes('MS') ? 'MS' : 'PS'
    await prisma.board.upsert({
      where: { id: board.id },
      create: {
        id: board.id,
        name: board.name,
        type,
      },
      update: {
        name: board.name,
        type,
      }
    })

    // Track service boards
    if (SERVICE_BOARD_NAMES.some(name =>
      board.name?.toLowerCase().includes(name.toLowerCase().replace('(ms)', '').replace('(ts)', '').trim()) ||
      name.toLowerCase().includes(board.name?.toLowerCase())
    )) {
      await prisma.serviceBoard.upsert({
        where: { boardId: board.id },
        create: {
          id: board.id,
          boardId: board.id,
          name: board.name,
        },
        update: {
          name: board.name,
        }
      })
    }
  }

  return boards.length
}

async function syncTickets(client: any, allowedMemberIds: number[], modifiedSince?: Date): Promise<number> {
  console.log('[Sync] Fetching boards to get service board IDs...')
  const boards = await client.getBoards()

  // Get allowed member identifiers for filtering
  const allowedMembers = await prisma.member.findMany({
    where: { id: { in: allowedMemberIds } }
  })
  const allowedIdentifiers = allowedMembers.map(m => m.identifier.toLowerCase())

  // Find service board IDs
  const serviceBoardIds = boards
    .filter((b: any) => SERVICE_BOARD_NAMES.some(name =>
      b.name?.toLowerCase().includes(name.toLowerCase().replace('(ms)', '').replace('(ts)', '').trim()) ||
      name.toLowerCase().includes(b.name?.toLowerCase())
    ))
    .map((b: any) => b.id)

  const syncMode = modifiedSince ? 'incremental' : 'full'
  console.log(`[Sync] Found ${serviceBoardIds.length} service boards, fetching tickets (${syncMode})...`)

  // Fetch tickets from service boards - pass modifiedSince for incremental sync
  const allTickets = await client.getTickets(serviceBoardIds, undefined, undefined, {}, modifiedSince)

  // Filter tickets to only those owned by or assigned to allowed engineers
  const relevantTickets = allTickets.filter((t: any) => {
    const owner = t.owner?.identifier?.toLowerCase() || t.owner?.toLowerCase() || ''
    const resources = t.teamMember?.toLowerCase() || t.resources?.toLowerCase() || ''

    // Include ticket if owner or any resource is an allowed engineer
    return allowedIdentifiers.includes(owner) ||
      allowedIdentifiers.some(id => resources.includes(id))
  })

  console.log(`[Sync] ${syncMode === 'incremental' ? 'Incremental: ' : ''}Filtered ${allTickets.length} tickets to ${relevantTickets.length} relevant to allowed engineers`)

  for (const ticket of relevantTickets) {
    const boardId = ticket.board?.id || ticket.boardId
    if (!boardId) continue

    // Ensure board exists
    const boardExists = await prisma.board.findUnique({ where: { id: boardId } })
    if (!boardExists) {
      await prisma.board.create({
        data: {
          id: boardId,
          name: `Board ${boardId}`,
          type: 'MS',
        }
      })
    }

    await prisma.ticket.upsert({
      where: { id: ticket.id },
      create: {
        id: ticket.id,
        summary: ticket.summary,
        boardId,
        status: ticket.status?.name || ticket.status,
        closedDate: ticket.closedDate ? new Date(ticket.closedDate) : null,
        closedFlag: ticket.closedFlag || false,
        dateEntered: ticket.dateEntered ? new Date(ticket.dateEntered) : null,
        resolvedDate: ticket.resolvedDate ? new Date(ticket.resolvedDate) : null,
        owner: ticket.owner?.identifier || ticket.owner,
        company: ticket.company?.name || ticket.company,
        type: ticket.type?.name || ticket.type,
        priority: ticket.priority?.name || ticket.priority,
        resources: ticket.teamMember || ticket.resources,
        estimatedHours: ticket.estimatedHours,
        actualHours: ticket.actualHours,
      },
      update: {
        summary: ticket.summary,
        boardId,
        status: ticket.status?.name || ticket.status,
        closedDate: ticket.closedDate ? new Date(ticket.closedDate) : null,
        closedFlag: ticket.closedFlag || false,
        dateEntered: ticket.dateEntered ? new Date(ticket.dateEntered) : null,
        resolvedDate: ticket.resolvedDate ? new Date(ticket.resolvedDate) : null,
        owner: ticket.owner?.identifier || ticket.owner,
        company: ticket.company?.name || ticket.company,
        type: ticket.type?.name || ticket.type,
        priority: ticket.priority?.name || ticket.priority,
        resources: ticket.teamMember || ticket.resources,
        estimatedHours: ticket.estimatedHours,
        actualHours: ticket.actualHours,
      }
    })
  }

  return relevantTickets.length
}

async function syncTimeEntries(client: any, allowedMemberIds: number[], modifiedSince?: Date): Promise<number> {
  const syncMode = modifiedSince ? 'incremental' : 'full'
  console.log(`[Sync] Fetching time entries for allowed engineers from ConnectWise (${syncMode})...`)

  // Fetch time entries only for allowed member IDs - pass modifiedSince for incremental sync
  const entries = await client.getTimeEntries(undefined, undefined, allowedMemberIds, {}, modifiedSince)

  console.log(`[Sync] ${syncMode === 'incremental' ? 'Incremental: ' : ''}Fetched ${entries.length} time entries for ${allowedMemberIds.length} allowed engineers`)

  let syncedCount = 0
  for (const entry of entries) {
    const memberId = entry.member?.id || entry.memberId
    if (!memberId) continue

    // Only sync if member is in allowed list
    if (!allowedMemberIds.includes(memberId)) continue

    // Ensure member exists
    const memberExists = await prisma.member.findUnique({ where: { id: memberId } })
    if (!memberExists) continue // Skip if member not in our allowed list

    // Handle ticket reference - create placeholder if needed
    const ticketId = entry.ticket?.id || entry.ticketId
    if (ticketId) {
      const ticketExists = await prisma.ticket.findUnique({ where: { id: ticketId } })
      if (!ticketExists) {
        // Check if we need to create a placeholder board first
        const boardExists = await prisma.board.findUnique({ where: { id: 1 } })
        if (!boardExists) {
          await prisma.board.create({
            data: { id: 1, name: 'Default Board', type: 'MS' }
          })
        }
        // Create placeholder ticket
        await prisma.ticket.create({
          data: {
            id: ticketId,
            boardId: 1,
            summary: 'Placeholder - synced via time entry',
          }
        }).catch(() => { }) // Ignore if already exists
      }
    }

    await prisma.timeEntry.upsert({
      where: { id: entry.id },
      create: {
        id: entry.id,
        memberId,
        ticketId: ticketId || null,
        hours: entry.hours || entry.actualHours || 0,
        billableOption: entry.billableOption,
        notes: entry.notes,
        dateStart: new Date(entry.timeStart),
        dateEnd: entry.timeEnd ? new Date(entry.timeEnd) : null,
        internalNotes: entry.internalNotes,
      },
      update: {
        memberId,
        ticketId: ticketId || null,
        hours: entry.hours || entry.actualHours || 0,
        billableOption: entry.billableOption,
        notes: entry.notes,
        dateStart: new Date(entry.timeStart),
        dateEnd: entry.timeEnd ? new Date(entry.timeEnd) : null,
        internalNotes: entry.internalNotes,
      }
    })
    syncedCount++
  }

  return syncedCount
}

async function syncProjects(client: any, modifiedSince?: Date): Promise<number> {
  const syncMode = modifiedSince ? 'incremental' : 'full'
  console.log(`[Sync] Fetching projects from ConnectWise (${syncMode})...`)

  // Fetch projects managed by allowed engineers - pass modifiedSince for incremental sync
  const allProjects = await client.getProjects(ALLOWED_ENGINEER_IDENTIFIERS, {}, modifiedSince)

  console.log(`[Sync] ${syncMode === 'incremental' ? 'Incremental: ' : ''}Fetched ${allProjects.length} projects managed by allowed engineers`)

  // Track which projects need audit trail sync (Closed/Ready to Close)
  const auditProjectIds: number[] = []

  for (const project of allProjects) {
    // Check if status is "Ready to Close" or "Closed" to trigger audit sync
    // We want to capture the history of when it entered this state
    const statusName = project.status?.name || project.status
    if (statusName === 'Ready to Close' || statusName === 'Closed') {
      auditProjectIds.push(project.id)
    }

    await prisma.project.upsert({
      where: { id: project.id },
      create: {
        id: project.id,
        name: project.name,
        status: project.status?.name || project.status,
        company: project.company?.name || project.company,
        managerIdentifier: project.manager?.identifier,
        managerName: project.manager?.name,
        boardName: project.board?.name,
        estimatedStart: project.estimatedStart ? new Date(project.estimatedStart) : null,
        estimatedEnd: project.estimatedEnd ? new Date(project.estimatedEnd) : null,
        actualStart: project.actualStart ? new Date(project.actualStart) : null,
        actualEnd: project.actualEnd ? new Date(project.actualEnd) : null,
        estimatedHours: project.estimatedHours,
        actualHours: project.actualHours,
        percentComplete: project.percentComplete,
        type: project.type?.name || project.type,
        closedFlag: project.closedFlag || false,
        description: project.description,
      },
      update: {
        name: project.name,
        status: project.status?.name || project.status,
        company: project.company?.name || project.company,
        managerIdentifier: project.manager?.identifier,
        managerName: project.manager?.name,
        boardName: project.board?.name,
        estimatedStart: project.estimatedStart ? new Date(project.estimatedStart) : null,
        estimatedEnd: project.estimatedEnd ? new Date(project.estimatedEnd) : null,
        actualStart: project.actualStart ? new Date(project.actualStart) : null,
        actualEnd: project.actualEnd ? new Date(project.actualEnd) : null,
        estimatedHours: project.estimatedHours,
        actualHours: project.actualHours,
        percentComplete: project.percentComplete,
        type: project.type?.name || project.type,
        closedFlag: project.closedFlag || false,
        description: project.description,
      }
    })
  }

  // Sync audit trails for relevant projects
  if (auditProjectIds.length > 0) {
    console.log(`[Sync] Syncing audit trails for ${auditProjectIds.length} closed/ready-to-close projects...`)
    await syncProjectAudits(client, auditProjectIds)
  }

  return allProjects.length
}

async function syncProjectAudits(client: any, projectIds: number[]): Promise<void> {
  for (const projectId of projectIds) {
    try {
      // Fetch audit trail for this project
      const audits = await client.getAuditTrail('Project', projectId)

      // Filter for status changes to "Ready to Close" or "Closed"
      const statusAudits = audits.filter((a: any) =>
        a.auditType === 'Status' || // CW implementation detail: check actual field name
        a.message?.includes('status changed') ||
        (a.newValue && (a.newValue.includes('Ready to Close') || a.newValue.includes('Closed')))
      )

      for (const audit of statusAudits) {
        // Only interested if it moved TO Ready to Close or Closed using the message or new value
        // The audit object structure varies, assuming standard fields:
        // enteredBy, dateEntered, message, oldValue, newValue

        await prisma.projectAudit.create({
          data: {
            projectId,
            status: audit.newValue,
            previousStatus: audit.oldValue,
            changedBy: audit.enteredBy,
            dateEntered: new Date(audit.dateEntered),
            message: audit.message
          }
        }).catch(() => { }) // Ignore duplicates if needed, or better: use upsert if we have a stable ID
      }
    } catch (error) {
      console.error(`[Sync] Error syncing audit for project ${projectId}:`, error)
      // Continue to next project
    }
  }
}

async function syncProjectTickets(client: any, modifiedSince?: Date): Promise<number> {
  const syncMode = modifiedSince ? 'incremental' : 'full'
  console.log(`[Sync] Fetching project tickets from ConnectWise (${syncMode})...`)

  // Get all projects in our database (already filtered to allowed managers)
  const projects = await prisma.project.findMany()
  const projectIds = projects.map(p => p.id)

  if (projectIds.length === 0) {
    console.log('[Sync] No projects to sync tickets for')
    return 0
  }

  // Fetch project tickets - pass modifiedSince for incremental sync
  const allTickets = await client.getProjectTickets(undefined, {}, modifiedSince)

  // Filter to only tickets for our projects
  const relevantTickets = allTickets.filter((t: any) =>
    projectIds.includes(t.project?.id)
  )

  console.log(`[Sync] ${syncMode === 'incremental' ? 'Incremental: ' : ''}Filtered ${allTickets.length} project tickets to ${relevantTickets.length} for allowed engineers' projects`)

  for (const ticket of relevantTickets) {
    const projectId = ticket.project?.id
    if (!projectId) continue

    await prisma.projectTicket.upsert({
      where: { id: ticket.id },
      create: {
        id: ticket.id,
        summary: ticket.summary,
        projectId,
        projectName: ticket.project?.name,
        phaseId: ticket.phase?.id,
        phaseName: ticket.phase?.name,
        boardId: ticket.board?.id,
        boardName: ticket.board?.name,
        status: ticket.status?.name || ticket.status,
        company: ticket.company?.name || ticket.company,
        resources: ticket.resources,
        closedFlag: ticket.closedFlag || false,
        priority: ticket.priority?.name || ticket.priority,
        type: ticket.type?.name || ticket.type,
        wbsCode: ticket.wbsCode,
        budgetHours: ticket.budgetHours,
        actualHours: ticket.actualHours,
        dateEntered: ticket.dateEntered ? new Date(ticket.dateEntered) : null,
        closedDate: ticket.closedDate ? new Date(ticket.closedDate) : null,
      },
      update: {
        summary: ticket.summary,
        projectId,
        projectName: ticket.project?.name,
        phaseId: ticket.phase?.id,
        phaseName: ticket.phase?.name,
        boardId: ticket.board?.id,
        boardName: ticket.board?.name,
        status: ticket.status?.name || ticket.status,
        company: ticket.company?.name || ticket.company,
        resources: ticket.resources,
        closedFlag: ticket.closedFlag || false,
        priority: ticket.priority?.name || ticket.priority,
        type: ticket.type?.name || ticket.type,
        wbsCode: ticket.wbsCode,
        budgetHours: ticket.budgetHours,
        actualHours: ticket.actualHours,
        dateEntered: ticket.dateEntered ? new Date(ticket.dateEntered) : null,
        closedDate: ticket.closedDate ? new Date(ticket.closedDate) : null,
      }
    })
  }

  return relevantTickets.length
}
