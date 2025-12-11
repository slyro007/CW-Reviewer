
import { PrismaClient } from '@prisma/client'
import { INACTIVE_ENGINEERS } from '../api/config.js'

const prisma = new PrismaClient()

async function main() {
    console.log('🌱 Seeding Member Dates...')

    // 1. Update Inactive Engineers
    for (const emp of INACTIVE_ENGINEERS) {
        console.log(`Updating ${emp.name} (${emp.identifier})...`)

        // We try to update. If they don't exist, we can't seed them yet (they need to be synced from CW first).
        // Or we could create placeholders? Better to just update if exists.
        try {
            const result = await prisma.member.updateMany({
                where: { identifier: { equals: emp.identifier, mode: 'insensitive' } },
                data: {
                    startDate: new Date(emp.startDate),
                    endDate: new Date(emp.endDate),
                    isActive: false,
                    inactiveFlag: true // Ensure DB knows they are inactive
                }
            })
            if (result.count > 0) {
                console.log(`✅ Updated ${emp.name}`)
            } else {
                console.log(`⚠️  Member ${emp.name} not found in DB yet (will be synced later)`)
            }
        } catch (e) {
            console.error(`Error updating ${emp.name}:`, e)
        }
    }

    // 2. Update Active Engineers (set their startDate if we know it, otherwise leave as null or set default?)
    // For now, focusing on the Inactive requirement.

    console.log('🌱 Seeding Complete.')
}

main()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
