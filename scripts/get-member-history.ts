
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('🔍 Analyzing Member History...')

    // 1. Get all members
    const members = await prisma.member.findMany({
        orderBy: { lastName: 'asc' }
    })

    console.log(`Found ${members.length} members in database.`)
    console.log('\n--- Member History ---')
    console.log('Name | Identifier | First Entry | Last Entry | Status Estimate')
    console.log('-'.repeat(80))

    const results = []

    // 2. For each member, find first and last time entry
    for (const member of members) {
        const firstEntry = await prisma.timeEntry.findFirst({
            where: { memberId: member.id },
            orderBy: { dateStart: 'asc' },
            select: { dateStart: true }
        })

        const lastEntry = await prisma.timeEntry.findFirst({
            where: { memberId: member.id },
            orderBy: { dateStart: 'desc' },
            select: { dateStart: true }
        })

        if (firstEntry && lastEntry) {
            const isInactive = member.inactiveFlag
            // If last entry is older than 6 months and not explicitly flagged, maybe inactive?
            // But we will stick to factual dates.

            results.push({
                name: `${member.firstName} ${member.lastName}`,
                identifier: member.identifier,
                firstDate: firstEntry.dateStart,
                lastDate: lastEntry.dateStart,
                inactiveInDB: member.inactiveFlag
            })
        } else {
            // Member with no time entries
            results.push({
                name: `${member.firstName} ${member.lastName}`,
                identifier: member.identifier,
                firstDate: null,
                lastDate: null,
                inactiveInDB: member.inactiveFlag
            })
        }
    }

    // Sort by Last Entry desc (active people usually at top)
    results.sort((a, b) => {
        if (!a.lastDate) return 1
        if (!b.lastDate) return -1
        return b.lastDate.getTime() - a.lastDate.getTime()
    })

    // Output formatted table
    for (const r of results) {
        const startStr = r.firstDate ? r.firstDate.toLocaleDateString() : 'N/A'
        const endStr = r.lastDate ? r.lastDate.toLocaleDateString() : 'N/A'

        // Status Logic for display
        const lastDate = r.lastDate
        const now = new Date()
        const daysSinceLast = lastDate ? Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)) : 9999

        let status = 'Active'
        if (r.inactiveInDB) status = 'Inactive (DB)'
        else if (daysSinceLast > 90) status = `Inactive? (${daysSinceLast} days ago)`

        console.log(`${r.name.padEnd(20)} | ${r.identifier.padEnd(10)} | ${startStr.padEnd(12)} | ${endStr.padEnd(12)} | ${status}`)
    }

    console.log('-'.repeat(80))
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
