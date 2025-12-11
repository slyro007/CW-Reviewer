
import { PrismaClient } from '@prisma/client'
import ConnectWiseClient from '../api/connectwise'
import { ALLOWED_ENGINEER_IDENTIFIERS, SERVICE_BOARD_NAMES } from '../api/config'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const prisma = new PrismaClient()

// Initialize ConnectWise Client
const client = new ConnectWiseClient({
    clientId: process.env.CW_CLIENT_ID || process.env.VITE_CW_CLIENT_ID || '',
    publicKey: process.env.CW_PUBLIC_KEY || process.env.VITE_CW_PUBLIC_KEY || '',
    privateKey: process.env.CW_PRIVATE_KEY || '',
    baseUrl: process.env.CW_BASE_URL || process.env.VITE_CW_BASE_URL || '',
    companyId: process.env.CW_COMPANY_ID || process.env.VITE_CW_COMPANY_ID || '',
})

async function main() {
    console.log('🚀 Starting Force Full Sync (Restricted to 7 Engineers)')
    console.log('Allowed Engineers:', ALLOWED_ENGINEER_IDENTIFIERS)

    // 1. Sync Members
    console.log('\n--- Syncing Members ---')
    const allMembers = await client.getMembers({ conditions: 'inactiveFlag=false' })
    const allowedMembers = allMembers.filter((m: any) =>
        ALLOWED_ENGINEER_IDENTIFIERS.some(id => id.toLowerCase() === m.identifier?.toLowerCase())
    )
    console.log(`Found ${allowedMembers.length} allowed engineers out of ${allMembers.length} total.`)

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
    console.log('✅ Members synced.')

    // 2. Sync Boards (All)
    console.log('\n--- Syncing Boards ---')
    const boards = await client.getBoards()
    for (const board of boards) {
        const type = board.name?.includes('MS') ? 'MS' : 'PS'
        await prisma.board.upsert({
            where: { id: board.id },
            create: { id: board.id, name: board.name, type },
            update: { name: board.name, type }
        })
    }
    console.log('✅ Boards synced.')

    // Helper to find service boards
    const serviceBoardIds = boards
        .filter((b: any) => SERVICE_BOARD_NAMES.some(name =>
            b.name?.toLowerCase().includes(name.toLowerCase().replace('(ms)', '').replace('(ts)', '').trim()) ||
            name.toLowerCase().includes(b.name?.toLowerCase())
        ))
        .map((b: any) => b.id)
    console.log(`Identified ${serviceBoardIds.length} Service Boards.`)

    const touchedProjectIds = new Set<number>()
    const touchedTicketIds = new Set<number>()
    const startDate = new Date()
    startDate.setFullYear(startDate.getFullYear() - 5)

    console.log('\n--- Syncing Time Entries (Last 5 Years) ---')
    // const startDate = new Date()
    // startDate.setFullYear(startDate.getFullYear() - 5)
    console.log(`Fetching entries since: ${startDate.toISOString()}`)

    const timeEntries = await client.getTimeEntries(startDate, undefined, memberIds)
    console.log(`Fetched ${timeEntries.length} time entries.`)

    // const touchedProjectIds = new Set<number>()
    // const touchedTicketIds = new Set<number>()

    // Process in batches for performance
    console.log(`Processing ${timeEntries.length} entries in batches...`)

    const BATCH_SIZE = 50

    // Track touched items first (fast synchronous pass)
    for (const entry of timeEntries) {
        const memberId = entry.member?.id || entry.memberId
        if (!memberIds.includes(memberId)) continue

        if (entry.project?.id) touchedProjectIds.add(entry.project.id)
        if (entry.projectId) touchedProjectIds.add(entry.projectId)

        if (entry.ticket?.id) touchedTicketIds.add(entry.ticket.id)
        if (entry.ticketId) touchedTicketIds.add(entry.ticketId)
    }

    // Create processing chunks
    const validEntries = timeEntries.filter((e: any) => memberIds.includes(e.member?.id || e.memberId))
    const chunks = []
    for (let i = 0; i < validEntries.length; i += BATCH_SIZE) {
        chunks.push(validEntries.slice(i, i + BATCH_SIZE))
    }

    let processedCount = 0
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        await Promise.all(chunk.map(async (entry: any) => {
            const memberId = entry.member?.id || entry.memberId
            const ticketId = entry.ticket?.id || entry.ticketId

            // Handle placeholder tickets if needed
            if (ticketId) {
                const defaultBoard = await prisma.board.findFirst()
                await prisma.ticket.upsert({
                    where: { id: ticketId },
                    create: {
                        id: ticketId,
                        summary: 'Pending Sync',
                        boardId: defaultBoard?.id || 1
                    },
                    update: {}
                }).catch(() => { })
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
        }))
        processedCount += chunk.length
        if (i % 5 === 0) console.log(`Processed ${processedCount}/${validEntries.length} entries...`)
    }

    console.log(`✅ Synced ${validEntries.length} time entries.`)
    console.log(`Found ${touchedProjectIds.size} unique projects via time entries.`)
    console.log(`Found ${touchedTicketIds.size} unique tickets via time entries.`)


    // 4. Sync Projects
    console.log('\n--- Syncing Projects ---')
    // Fetch projects managed by allowed engineers
    // Note: getProjects in client enforces manager filter if used standard way.
    // We will assume touchedProjectIds coverage is key. 
    // But we also need managed projects.
    // Let's fetch managed projects first.
    const managedProjects = await client.getProjects(ALLOWED_ENGINEER_IDENTIFIERS)
    console.log(`Fetched ${managedProjects.length} managed projects.`)
    managedProjects.forEach(p => touchedProjectIds.add(p.id))

    const allProjectIds = Array.from(touchedProjectIds);
    console.log(`Total relevant projects to sync: ${allProjectIds.length}`)

    // Fetch in chunks of 50
    for (let i = 0; i < allProjectIds.length; i += 50) {
        const chunk = allProjectIds.slice(i, i + 50)
        const conditions = `id in (${chunk.join(',')})`

        // Use requesting all pages with condition
        const projects = await client.requestAllPages('/project/projects', {
            conditions
        })

        // Batch upsert projects
        await Promise.all(projects.map(async (project: any) => {
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
                    description: project.description,
                    estimatedStart: project.estimatedStart ? new Date(project.estimatedStart) : null,
                    estimatedEnd: project.estimatedEnd ? new Date(project.estimatedEnd) : null,
                    actualStart: project.actualStart ? new Date(project.actualStart) : null,
                    actualEnd: project.actualEnd ? new Date(project.actualEnd) : null,
                    estimatedHours: project.estimatedHours,
                    actualHours: project.actualHours,
                    percentComplete: project.percentComplete,
                    type: project.type?.name || project.type,
                    closedFlag: project.closedFlag || false,
                }
            })
        }))
        console.log(`Synced batch ${i / 50 + 1}`)
    }
    console.log('✅ Projects synced.')


    // 5. Sync Service Tickets
    console.log('\n--- Syncing Service Tickets ---')
    const assignedTickets = await client.getTickets(
        serviceBoardIds,
        startDate,
        undefined,
        ALLOWED_ENGINEER_IDENTIFIERS
    )
    console.log(`Fetched ${assignedTickets.length} assigned service tickets.`)

    const ticketsToSync = [...assignedTickets]
    const assignedIds = new Set(assignedTickets.map((t: any) => t.id))
    const extraIds = Array.from(touchedTicketIds).filter(id => !assignedIds.has(id))

    if (extraIds.length > 0) {
        console.log(`Fetching ${extraIds.length} extra tickets discovered via time entries...`)
        for (let i = 0; i < extraIds.length; i += 50) {
            const chunk = extraIds.slice(i, i + 50)
            const conditions = `id in (${chunk.join(',')})`
            const extraTickets = await client.requestAllPages<any>('/service/tickets', { conditions })

            for (const t of extraTickets) {
                const bId = t.board?.id || t.boardId
                if (serviceBoardIds.includes(bId)) {
                    ticketsToSync.push(t)
                }
            }
        }
    }

    console.log(`Total Service Tickets to sync: ${ticketsToSync.length}`)

    // Batch processing tickets
    const ticketChunks = []
    for (let i = 0; i < ticketsToSync.length; i += 50) {
        ticketChunks.push(ticketsToSync.slice(i, i + 50))
    }

    let tProcessed = 0
    for (const chunk of ticketChunks) {
        await Promise.all(chunk.map(async (ticket: any) => {
            const boardId = ticket.board?.id || ticket.boardId
            if (!boardId) return

            // Ensure board exists
            await prisma.board.upsert({
                where: { id: boardId },
                create: { id: boardId, name: ticket.board?.name || 'Unknown Board', type: 'MS' },
                update: {}
            }).catch(() => { })

            await prisma.ticket.upsert({
                where: { id: ticket.id },
                create: {
                    id: ticket.id,
                    summary: ticket.summary,
                    boardId,
                    status: ticket.status?.name || ticket.status,
                    closedDate: ticket.closedDate ? new Date(ticket.closedDate) : (ticket._info?.closedDate ? new Date(ticket._info.closedDate) : null),
                    closedFlag: ticket.closedFlag || false,
                    dateEntered: ticket.dateEntered ? new Date(ticket.dateEntered) : (ticket._info?.dateEntered ? new Date(ticket._info.dateEntered) : null),
                    resolvedDate: ticket.resolvedDate ? new Date(ticket.resolvedDate) : (ticket._info?.dateResolved ? new Date(ticket._info.dateResolved) : null),
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
                    closedDate: ticket.closedDate ? new Date(ticket.closedDate) : (ticket._info?.closedDate ? new Date(ticket._info.closedDate) : null),
                    closedFlag: ticket.closedFlag || false,
                    dateEntered: ticket.dateEntered ? new Date(ticket.dateEntered) : (ticket._info?.dateEntered ? new Date(ticket._info.dateEntered) : null),
                    resolvedDate: ticket.resolvedDate ? new Date(ticket.resolvedDate) : (ticket._info?.dateResolved ? new Date(ticket._info.dateResolved) : null),
                    owner: ticket.owner?.identifier || ticket.owner,
                    company: ticket.company?.name || ticket.company,
                    type: ticket.type?.name || ticket.type,
                    priority: ticket.priority?.name || ticket.priority,
                    resources: ticket.teamMember || ticket.resources,
                    estimatedHours: ticket.estimatedHours,
                    actualHours: ticket.actualHours,
                }
            })
        }))
        tProcessed += chunk.length
        if (tProcessed % 250 === 0) console.log(`Processed ${tProcessed} tickets...`)
    }
    console.log('✅ Service Tickets synced.')

    // 6. Project Tickets
    console.log('\n--- Syncing Project Tickets ---')
    if (allProjectIds.length > 0) {
        let ptCount = 0
        for (let i = 0; i < allProjectIds.length; i += 50) {
            const chunk = allProjectIds.slice(i, i + 50)
            const conditions = `project/id in (${chunk.join(',')})`

            const tickets = await client.requestAllPages('/project/tickets', { conditions })

            // Batch upsert project tickets
            await Promise.all(tickets.map(async (ticket: any) => {
                const projectId = ticket.project?.id
                if (!projectId) return

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
                        dateEntered: ticket.dateEntered ? new Date(ticket.dateEntered) : (ticket._info?.dateEntered ? new Date(ticket._info.dateEntered) : null),
                        closedDate: ticket.closedDate ? new Date(ticket.closedDate) : (ticket._info?.closedDate ? new Date(ticket._info.closedDate) : null),
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
                        dateEntered: ticket.dateEntered ? new Date(ticket.dateEntered) : (ticket._info?.dateEntered ? new Date(ticket._info.dateEntered) : null),
                        closedDate: ticket.closedDate ? new Date(ticket.closedDate) : (ticket._info?.closedDate ? new Date(ticket._info.closedDate) : null),
                    }
                })
            }))
            ptCount += tickets.length
        }
        console.log(`✅ Synced ${ptCount} project tickets.`)
    }


    // 7. Update Sync Logs
    console.log('\n--- Updating Sync Logs ---')
    const entities = ['members', 'boards', 'tickets', 'timeEntries', 'projects', 'projectTickets']
    const now = new Date()

    for (const entityType of entities) {
        await prisma.syncLog.upsert({
            where: { entityType },
            create: {
                entityType,
                lastSyncAt: now,
                status: 'success',
                recordCount: 0
            },
            update: {
                lastSyncAt: now,
                status: 'success',
                errorMessage: null
            }
        })
    }
    console.log('✅ Sync Logs updated.')

    console.log('\n🚀 FORCE SYNC COMPLETE 🚀')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
