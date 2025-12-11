
import { PrismaClient } from '@prisma/client'
import { differenceInHours, differenceInDays, subDays } from 'date-fns'

const prisma = new PrismaClient()

const TEAM_DEFINITIONS = {
    'Service Desk': ['dcooper', 'scano', 'kmoreno'],
    'Professional Services': ['ehammond', 'dsolomon'],
}

async function main() {
    console.log('🔍 Starting Database Metrics Verification...')

    // 1. Fetch Data
    const tickets = await prisma.ticket.findMany({
        include: {
            board: true
        }
    })
    const projects = await prisma.project.findMany({
        include: {
            timeEntries: true
        }
    })

    console.log(`\n📊 Data Overview:`)
    console.log(`- Total Tickets in DB: ${tickets.length}`)
    console.log(`- Total Projects in DB: ${projects.length}`)

    // 2. Default Team Members (Service Desk) to match UI default
    const sdMembers = TEAM_DEFINITIONS['Service Desk']
    console.log(`\n👥 Team Analysis: Service Desk (${sdMembers.join(', ')})`)

    // Filter Tickets for Service Desk (Owner or Resource match) - Simplified approximation
    // Real app uses inclusive filter, here we'll check Owner for simplicity to verify data quality
    const sdTickets = tickets.filter(t =>
        t.owner && sdMembers.some(m => t.owner!.toLowerCase().includes(m.toLowerCase()))
    )
    console.log(`- Tickets Owned by Service Desk: ${sdTickets.length}`)

    // 3. Verify Date Fields on SD Tickets
    const withEnteredDate = sdTickets.filter(t => t.dateEntered)
    const withResolvedDate = sdTickets.filter(t => t.resolvedDate)
    const withClosedDate = sdTickets.filter(t => t.closedDate)

    console.log(`\n📅 Date Field Integrity (Service Desk Tickets):`)
    console.log(`- Have dateEntered: ${withEnteredDate.length} / ${sdTickets.length}`)
    console.log(`- Have resolvedDate: ${withResolvedDate.length} / ${sdTickets.length}`)
    console.log(`- Have closedDate: ${withClosedDate.length} / ${sdTickets.length}`)

    // 4. Calculate Metrics (Resolution Time)
    let totalResolutionHours = 0
    let resolvedCount = 0

    sdTickets.forEach(t => {
        if (t.dateEntered && (t.resolvedDate || t.closedDate)) {
            const end = t.resolvedDate || t.closedDate
            const hours = differenceInHours(end!, t.dateEntered)
            if (hours >= 0) { // sanity check
                totalResolutionHours += hours
                resolvedCount++
            }
        }
    })

    const avgResTime = resolvedCount > 0 ? (totalResolutionHours / resolvedCount).toFixed(1) : '0.0'
    console.log(`\n⏱️ Resolution Time Metric:`)
    console.log(`- Avg Resolution Time: ${avgResTime} hours (based on ${resolvedCount} resolved tickets)`)

    // 5. Calculate Metrics (Ticket Age for Open Tickets)
    const openStatuses = ['New', 'In Progress', 'Scheduled', 'Waiting']
    // Simplified status check, real app might compare against ClosedFlag
    const openTickets = sdTickets.filter(t => !t.closedFlag && t.dateEntered)

    const now = new Date()
    const totalAgeDays = openTickets.reduce((sum, t) => {
        return sum + differenceInDays(now, t.dateEntered!)
    }, 0)

    const avgAge = openTickets.length > 0 ? (totalAgeDays / openTickets.length).toFixed(1) : '0.0'
    console.log(`\n⏳ Ticket Age Metric:`)
    console.log(`- Avg Open Ticket Age: ${avgAge} days (based on ${openTickets.length} open tickets)`)


    // 6. Active Projects Verification
    console.log(`\n🚀 Active Projects (Last 14 Days):`)
    const activeThreshold = subDays(new Date(), 14)
    let activeCount = 0

    projects.forEach(p => {
        const hasRecentTime = p.timeEntries.some(te => te.dateStart >= activeThreshold)
        if (hasRecentTime) activeCount++

        // Print first few active ones
        if (hasRecentTime && activeCount <= 3) {
            console.log(`  - [Active] ${p.name} (Last Entry: ${p.timeEntries.sort((a, b) => b.dateStart.getTime() - a.dateStart.getTime())[0].dateStart.toISOString().split('T')[0]})`)
        }
    })
    console.log(`- Total Active Projects Detected: ${activeCount}`)

    // 7. Sample Dump
    if (sdTickets.length > 0) {
        console.log(`\n📝 Sample Ticket Data (First 3):`)
        sdTickets.slice(0, 3).forEach(t => {
            console.log({
                id: t.id,
                summary: t.summary?.substring(0, 30),
                dateEntered: t.dateEntered,
                resolvedDate: t.resolvedDate,
                closedDate: t.closedDate,
                resolutionHours: (t.dateEntered && (t.resolvedDate || t.closedDate))
                    ? differenceInHours(t.resolvedDate || t.closedDate!, t.dateEntered)
                    : 'N/A'
            })
        })
    }

}

main()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
