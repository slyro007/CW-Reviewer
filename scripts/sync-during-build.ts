/**
 * Build-time Sync Script
 * 
 * Runs during Vercel build to sync data from ConnectWise to Neon database.
 * - First build: Full sync of all data for 7 engineers
 * - Subsequent builds: Incremental sync (only changed records)
 * 
 * This runs BEFORE the build completes, ensuring data is ready when the app deploys.
 */

import { PrismaClient } from '@prisma/client'
import ConnectWiseClient from '../api/connectwise.js'
import {
  ALLOWED_ENGINEER_IDENTIFIERS,
  SERVICE_BOARD_NAMES,
  SYNC_STALE_THRESHOLD_MS,
  SYNC_INCREMENTAL_FALLBACK,
  BOARD_CACHE_TTL_MS,
  MEMBER_CACHE_TTL_MS,
  ENABLE_FOUNDATIONAL_CACHE
} from '../api/config.js'
import crypto from 'crypto'

const prisma = new PrismaClient()

interface SyncResult {
  entity: string
  synced: boolean
  count: number
  message: string
}

// Verbose logging
function log(message: string, data?: any) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] [Build Sync] ${message}`, data || '')
}

// Helper function to generate checksum for cache validation
function generateChecksum(data: any): string {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex')
}

// Helper function to check if cached data is still valid
async function isCacheValid(entityType: string, ttlMs: number): Promise<boolean> {
  if (!ENABLE_FOUNDATIONAL_CACHE) {
    log(`   ⚠️  Cache disabled via config, will fetch fresh data`)
    return false
  }

  const now = new Date()
  const cacheEntries = await prisma.entityCache.findMany({
    where: {
      entityType,
      expiresAt: { gt: now }
    }
  })

  if (cacheEntries.length === 0) {
    log(`   ℹ️  No valid cache found for ${entityType}`)
    return false
  }

  log(`   ✅ Found ${cacheEntries.length} valid cached ${entityType} entries`)
  return true
}

// Helper function to update cache for an entity
async function updateEntityCache(
  entityType: string,
  entityId: number,
  ttlMs: number,
  metadata?: any
): Promise<void> {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlMs)
  const checksum = metadata ? generateChecksum(metadata) : null

  await prisma.entityCache.upsert({
    where: {
      entityType_entityId: { entityType, entityId }
    },
    create: {
      entityType,
      entityId,
      lastFetchedAt: now,
      expiresAt,
      metadata,
      checksum
    },
    update: {
      lastFetchedAt: now,
      expiresAt,
      metadata,
      checksum
    }
  })
}

async function performBuildSync() {
  log('🚀 Starting build-time data sync...')

  try {
    // Initialize ConnectWise client
    const client = new ConnectWiseClient({
      clientId: process.env.CW_CLIENT_ID || process.env.VITE_CW_CLIENT_ID || '',
      publicKey: process.env.CW_PUBLIC_KEY || process.env.VITE_CW_PUBLIC_KEY || '',
      privateKey: process.env.CW_PRIVATE_KEY || '',
      baseUrl: process.env.CW_BASE_URL || process.env.VITE_CW_BASE_URL || '',
      companyId: process.env.CW_COMPANY_ID || process.env.VITE_CW_COMPANY_ID || '',
    })

    log('✅ ConnectWise client initialized')

    const results: SyncResult[] = []
    const now = new Date()
    const entitiesToSync = ['members', 'boards', 'tickets', 'timeEntries', 'projects', 'projectTickets']

    // Check existing sync logs
    const syncLogs = await prisma.syncLog.findMany()
    log(`📊 Found ${syncLogs.length} existing sync logs`)

    let allowedMemberIds: number[] = []

    for (const entityType of entitiesToSync) {
      const syncLogEntry = syncLogs.find(l => l.entityType === entityType)
      const lastSyncAt = syncLogEntry?.lastSyncAt || null
      const isStale = !lastSyncAt || (now.getTime() - lastSyncAt.getTime() > SYNC_STALE_THRESHOLD_MS)

      // SAFETY CHECK: Enforce minimum sync interval to prevent excessive database calls
      if (lastSyncAt) {
        const timeSinceLastSync = now.getTime() - lastSyncAt.getTime()
        const { MINIMUM_SYNC_INTERVAL_MS } = await import('../api/config.js')

        if (timeSinceLastSync < MINIMUM_SYNC_INTERVAL_MS) {
          const hoursRemaining = ((MINIMUM_SYNC_INTERVAL_MS - timeSinceLastSync) / (1000 * 60 * 60)).toFixed(1)
          log(`⏸️  Skipping ${entityType} - synced ${(timeSinceLastSync / (1000 * 60 * 60)).toFixed(1)}h ago. Minimum interval: 6h. Try again in ${hoursRemaining}h.`)
          results.push({ entity: entityType, synced: false, count: 0, message: `Skipped - minimum interval not met (${hoursRemaining}h remaining)` })
          continue
        }
      }

      // Determine sync mode
      const isIncrementalSync = Boolean(lastSyncAt && !['members', 'boards'].includes(entityType))
      const syncMode = isIncrementalSync ? 'incremental' : 'full'

      log(`\n📦 Syncing ${entityType} (${syncMode})...`)
      if (isIncrementalSync && lastSyncAt) {
        log(`   Last sync: ${lastSyncAt.toISOString()}`)
        log(`   Fetching records modified since last sync`)
      } else {
        log(`   Performing full sync (first time or forced)`)
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
            log(`   Fetching members from ConnectWise...`)
            const memberResult = await syncMembers(client)
            count = memberResult.count
            allowedMemberIds = memberResult.memberIds
            message = memberResult.cached
              ? `Using cache: ${count} engineers`
              : `Fresh sync: ${count} engineers`
            log(`   ✅ ${message}`)
            break
          case 'boards':
            log(`   Fetching boards from ConnectWise...`)
            const boardResult = await syncBoards(client)
            count = boardResult.count
            message = boardResult.cached
              ? `Using cache: ${count} boards`
              : `Fresh sync: ${count} boards`
            log(`   ✅ ${message}`)
            break
          case 'tickets':
            if (allowedMemberIds.length === 0) {
              const members = await prisma.member.findMany()
              allowedMemberIds = members.map(m => m.id)
            }
            log(`   Fetching tickets for ${allowedMemberIds.length} engineers...`)
            count = await syncTickets(client, allowedMemberIds, useIncremental ? lastSyncAt! : undefined)
            message = useIncremental ? `Incremental: ${count} modified tickets` : `Full sync: ${count} tickets`
            log(`   ✅ Synced ${count} tickets`)
            break
          case 'timeEntries':
            if (allowedMemberIds.length === 0) {
              const members = await prisma.member.findMany()
              allowedMemberIds = members.map(m => m.id)
            }
            log(`   Fetching time entries for ${allowedMemberIds.length} engineers...`)
            count = await syncTimeEntries(client, allowedMemberIds, useIncremental ? lastSyncAt! : undefined)
            message = useIncremental ? `Incremental: ${count} modified entries` : `Full sync: ${count} entries`
            log(`   ✅ Synced ${count} time entries`)
            break
          case 'projects':
            log(`   Fetching projects for ${ALLOWED_ENGINEER_IDENTIFIERS.length} engineers...`)
            count = await syncProjects(client, useIncremental ? lastSyncAt! : undefined)
            message = useIncremental ? `Incremental: ${count} modified projects` : `Full sync: ${count} projects`
            log(`   ✅ Synced ${count} projects`)
            break
          case 'projectTickets':
            log(`   Fetching project tickets...`)
            count = await syncProjectTickets(client, useIncremental ? lastSyncAt! : undefined)
            message = useIncremental ? `Incremental: ${count} modified tickets` : `Full sync: ${count} tickets`
            log(`   ✅ Synced ${count} project tickets`)
            break
        }

        return { count, message }
      }

      try {
        let count = 0
        let message = ''
        let usedIncremental = isIncrementalSync

        try {
          const result = await performEntitySync(isIncrementalSync)
          count = result.count
          message = result.message
        } catch (syncError: any) {
          if (isIncrementalSync && SYNC_INCREMENTAL_FALLBACK) {
            log(`   ⚠️  Incremental sync failed, falling back to full sync...`)
            log(`   Error: ${syncError.message}`)
            usedIncremental = false
            const result = await performEntitySync(false)
            count = result.count
            message = `Fallback full sync: ${count} records (incremental failed)`
          } else {
            throw syncError
          }
        }

        const existingCount = syncLogEntry?.recordCount || 0
        const newTotalCount = usedIncremental ? existingCount : count

        // Calculate cache metrics for foundational entities
        const isCachedEntity = ['members', 'boards'].includes(entityType)
        const cachedCount = isCachedEntity && message.includes('Using cache') ? count : 0
        const freshCount = isCachedEntity && !message.includes('Using cache') ? count : (usedIncremental ? count : 0)
        const hitRate = isCachedEntity && count > 0 ? (cachedCount / count) * 100 : null

        await prisma.syncLog.upsert({
          where: { entityType },
          create: {
            entityType,
            lastSyncAt: now,
            recordCount: newTotalCount,
            cachedRecordCount: cachedCount,
            freshRecordCount: freshCount,
            cacheHitRate: hitRate,
            status: 'success'
          },
          update: {
            lastSyncAt: now,
            recordCount: newTotalCount,
            cachedRecordCount: cachedCount,
            freshRecordCount: freshCount,
            cacheHitRate: hitRate,
            status: 'success',
            errorMessage: null
          }
        })

        results.push({ entity: entityType, synced: true, count, message })
        log(`   ✅ ${entityType} sync completed: ${message}`)
      } catch (error: any) {
        log(`   ❌ Error syncing ${entityType}: ${error.message}`)
        await prisma.syncLog.upsert({
          where: { entityType },
          create: { entityType, lastSyncAt: now, status: 'failed', errorMessage: error.message },
          update: { status: 'failed', errorMessage: error.message }
        })
        results.push({ entity: entityType, synced: false, count: 0, message: `Failed: ${error.message}` })
      }
    }

    log('\n📊 Sync Summary:')
    results.forEach(r => {
      const icon = r.synced ? '✅' : '❌'
      log(`   ${icon} ${r.entity}: ${r.message}`)
    })

    const totalSynced = results.filter(r => r.synced).length
    const totalFailed = results.filter(r => !r.synced).length

    log(`\n🎉 Build sync completed!`)
    log(`   Successfully synced: ${totalSynced}/${results.length} entities`)
    if (totalFailed > 0) {
      log(`   ⚠️  Failed: ${totalFailed} entities`)
    }

    return { results, syncedAt: now }
  } catch (error: any) {
    log(`❌ Build sync failed: ${error.message}`)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Import sync functions from sync.ts (we'll need to extract them)
async function syncMembers(client: any): Promise<{ count: number; memberIds: number[]; cached: boolean }> {
  // Check if we have valid cached member data
  const cacheValid = await isCacheValid('member', MEMBER_CACHE_TTL_MS)

  if (cacheValid) {
    // Use cached data - just return existing members from DB
    const cachedMembers = await prisma.member.findMany()
    const memberIds = cachedMembers.map(m => m.id)
    log(`   ✅ Using ${cachedMembers.length} cached members (no API call needed)`)
    return { count: cachedMembers.length, memberIds, cached: true }
  }

  // Cache miss or expired - fetch fresh data from API
  log(`   🔄 Fetching fresh member data from ConnectWise API...`)
  const allMembers = await client.getMembers()
  const allowedMembers = allMembers.filter((m: any) =>
    ALLOWED_ENGINEER_IDENTIFIERS.includes(m.identifier?.toLowerCase())
  )

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

    // Update cache for this member
    await updateEntityCache('member', member.id, MEMBER_CACHE_TTL_MS, {
      identifier: member.identifier,
      firstName: member.firstName,
      lastName: member.lastName
    })
  }

  log(`   ✅ Cached ${allowedMembers.length} members for ${MEMBER_CACHE_TTL_MS / (24 * 60 * 60 * 1000)} days`)
  return { count: allowedMembers.length, memberIds, cached: false }
}

async function syncBoards(client: any): Promise<{ count: number; cached: boolean }> {
  // Check if we have valid cached board data
  const cacheValid = await isCacheValid('board', BOARD_CACHE_TTL_MS)

  if (cacheValid) {
    // Use cached data - just return existing boards from DB
    const cachedBoards = await prisma.board.findMany()
    log(`   ✅ Using ${cachedBoards.length} cached boards (no API call needed)`)
    return { count: cachedBoards.length, cached: true }
  }

  // Cache miss or expired - fetch fresh data from API
  log(`   🔄 Fetching fresh board data from ConnectWise API...`)
  const boards = await client.getBoards()
  for (const board of boards) {
    const type = board.name?.includes('MS') ? 'MS' : 'PS'
    await prisma.board.upsert({
      where: { id: board.id },
      create: { id: board.id, name: board.name, type },
      update: { name: board.name, type }
    })

    // Update cache for this board
    await updateEntityCache('board', board.id, BOARD_CACHE_TTL_MS, {
      name: board.name,
      type
    })

    if (SERVICE_BOARD_NAMES.some(name =>
      board.name?.toLowerCase().includes(name.toLowerCase().replace('(ms)', '').replace('(ts)', '').trim()) ||
      name.toLowerCase().includes(board.name?.toLowerCase())
    )) {
      await prisma.serviceBoard.upsert({
        where: { boardId: board.id },
        create: { id: board.id, boardId: board.id, name: board.name },
        update: { name: board.name }
      })
    }
  }

  log(`   ✅ Cached ${boards.length} boards for ${BOARD_CACHE_TTL_MS / (24 * 60 * 60 * 1000)} days`)
  return { count: boards.length, cached: false }
}

async function syncTickets(client: any, allowedMemberIds: number[], modifiedSince?: Date): Promise<number> {
  const boards = await client.getBoards()
  const allowedMembers = await prisma.member.findMany({ where: { id: { in: allowedMemberIds } } })
  const allowedIdentifiers = allowedMembers.map(m => m.identifier.toLowerCase())
  const serviceBoardIds = boards
    .filter((b: any) => SERVICE_BOARD_NAMES.some(name =>
      b.name?.toLowerCase().includes(name.toLowerCase().replace('(ms)', '').replace('(ts)', '').trim()) ||
      name.toLowerCase().includes(b.name?.toLowerCase())
    ))
    .map((b: any) => b.id)
  const allTickets = await client.getTickets(
    serviceBoardIds,
    undefined,
    undefined,
    allowedIdentifiers, // Pass member identifiers for server-side filtering
    {},
    modifiedSince
  )
  const relevantTickets = allTickets.filter((t: any) => {
    const owner = t.owner?.identifier?.toLowerCase() || t.owner?.toLowerCase() || ''
    const resources = t.teamMember?.toLowerCase() || t.resources?.toLowerCase() || ''
    return allowedIdentifiers.includes(owner) ||
      allowedIdentifiers.some(id => resources.includes(id))
  })
  for (const ticket of relevantTickets) {
    const boardId = ticket.board?.id || ticket.boardId
    if (!boardId) continue
    const boardExists = await prisma.board.findUnique({ where: { id: boardId } })
    if (!boardExists) {
      await prisma.board.create({ data: { id: boardId, name: `Board ${boardId}`, type: 'MS' } })
    }
    await prisma.ticket.upsert({
      where: { id: ticket.id },
      create: {
        id: ticket.id, summary: ticket.summary, boardId,
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
        summary: ticket.summary, boardId,
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
  const entries = await client.getTimeEntries(undefined, undefined, allowedMemberIds, {}, modifiedSince)
  let syncedCount = 0
  for (const entry of entries) {
    const memberId = entry.member?.id || entry.memberId
    if (!memberId || !allowedMemberIds.includes(memberId)) continue
    const memberExists = await prisma.member.findUnique({ where: { id: memberId } })
    if (!memberExists) continue
    const ticketId = entry.ticket?.id || entry.ticketId
    if (ticketId) {
      const ticketExists = await prisma.ticket.findUnique({ where: { id: ticketId } })
      if (!ticketExists) {
        const boardExists = await prisma.board.findUnique({ where: { id: 1 } })
        if (!boardExists) {
          await prisma.board.create({ data: { id: 1, name: 'Default Board', type: 'MS' } })
        }
        await prisma.ticket.create({
          data: { id: ticketId, boardId: 1, summary: 'Placeholder - synced via time entry' }
        }).catch(() => { })
      }
    }
    await prisma.timeEntry.upsert({
      where: { id: entry.id },
      create: {
        id: entry.id, memberId, ticketId: ticketId || null,
        hours: entry.hours || entry.actualHours || 0,
        billableOption: entry.billableOption,
        notes: entry.notes,
        dateStart: new Date(entry.timeStart),
        dateEnd: entry.timeEnd ? new Date(entry.timeEnd) : null,
        internalNotes: entry.internalNotes,
      },
      update: {
        memberId, ticketId: ticketId || null,
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
  const allProjects = await client.getProjects(ALLOWED_ENGINEER_IDENTIFIERS, {}, modifiedSince)
  for (const project of allProjects) {
    await prisma.project.upsert({
      where: { id: project.id },
      create: {
        id: project.id, name: project.name,
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
  return allProjects.length
}

async function syncProjectTickets(client: any, modifiedSince?: Date): Promise<number> {
  const projects = await prisma.project.findMany()
  const projectIds = projects.map(p => p.id)
  if (projectIds.length === 0) return 0
  const allTickets = await client.getProjectTickets(undefined, {}, modifiedSince)
  const relevantTickets = allTickets.filter((t: any) => projectIds.includes(t.project?.id))
  for (const ticket of relevantTickets) {
    const projectId = ticket.project?.id
    if (!projectId) continue
    await prisma.projectTicket.upsert({
      where: { id: ticket.id },
      create: {
        id: ticket.id, summary: ticket.summary, projectId,
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
        summary: ticket.summary, projectId,
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

// Run sync when script is executed
// Set a timeout to prevent hanging (Vercel builds have limits, but this should complete)
const SYNC_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes max

const syncPromise = performBuildSync()

const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => {
    reject(new Error('Sync timeout after 10 minutes - build will continue'))
  }, SYNC_TIMEOUT_MS)
})

Promise.race([syncPromise, timeoutPromise])
  .then(() => {
    log('✅ Build sync script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    log(`⚠️  Build sync script encountered an issue: ${error.message}`)
    log('⚠️  Build will continue - sync can be triggered manually via API')
    console.error(error)
    // Don't fail the build - exit with 0 so build continues
    // The data will sync on next deployment or via manual trigger
    process.exit(0)
  })

