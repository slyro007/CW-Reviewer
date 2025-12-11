import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Checking Time Data...')
    const count = await prisma.timeEntry.count()
    console.log('Total Time Entries:', count)

    if (count > 0) {
        const min = await prisma.timeEntry.findFirst({ orderBy: { dateStart: 'asc' } })
        const max = await prisma.timeEntry.findFirst({ orderBy: { dateStart: 'desc' } })
        console.log('Earliest Entry:', min?.dateStart)
        console.log('Latest Entry:', max?.dateStart)
    }

    console.log('\nChecking Projects...')
    const pCount = await prisma.project.count()
    console.log('Total Projects:', pCount)

    const managers = await prisma.project.groupBy({
        by: ['managerIdentifier'],
        _count: true
    })
    console.log('Project Managers:', managers)
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect()
    })
