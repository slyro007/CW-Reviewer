
import { ConnectWiseClient } from '../api/connectwise'
import * as dotenv from 'dotenv'

dotenv.config()

async function main() {
    console.log('🔍 Fetching Comprehensive Member History from ConnectWise...')

    const config = {
        clientId: process.env.CW_CLIENT_ID || process.env.VITE_CW_CLIENT_ID || '',
        publicKey: process.env.CW_PUBLIC_KEY || process.env.VITE_CW_PUBLIC_KEY || '',
        privateKey: process.env.CW_PRIVATE_KEY || '',
        baseUrl: process.env.CW_BASE_URL || process.env.VITE_CW_BASE_URL || '',
        companyId: process.env.CW_COMPANY_ID || process.env.VITE_CW_COMPANY_ID || ''
    }

    console.log('Environment Check:')
    const keys = Object.keys(process.env).filter(k => k.includes('CW_'))
    console.log('Available CW Keys:', keys)
    console.log('Config loaded:', {
        clientId: config.clientId ? 'OK' : 'MISSING',
        publicKey: config.publicKey ? 'OK' : 'MISSING',
        privateKey: config.privateKey ? 'OK' : 'MISSING',
        baseUrl: config.baseUrl ? 'OK' : 'MISSING',
        companyId: config.companyId ? 'OK' : 'MISSING'
    })

    if (!config.clientId || !config.publicKey || !config.privateKey || !config.baseUrl || !config.companyId) {
        throw new Error('Missing environment variables. Make sure .env is loaded.')
    }

    const client = new ConnectWiseClient(config)

    // 1. Get ALL members (unfiltered)
    console.log('Fetching member list...')
    const members = await client.requestAllPages<any>('/system/members', {
        fields: 'id,identifier,firstName,lastName,inactiveFlag',
        conditions: 'inactiveFlag=false OR inactiveFlag=true', // Explicitly try to get all
        orderBy: 'identifier asc'
    })

    console.log(`Found ${members.length} total members in ConnectWise.`)
    console.log('Fetching first/last time entries for each member (this may take a moment)...')
    console.log('\nName | Identifier | Active? | First Entry | Last Entry')
    console.log('-'.repeat(90))


    let report = '# Member History Report\n\n'
    report += '| Name | Identifier | Active in CW? | First Entry | Last Entry |\n'
    report += '|---|---|---|---|---|\n'

    // Sort chunks or results? Better to collect results then sort.
    const results: any[] = []

    console.log(`Using Company ID: ${config.companyId}`)

    const chunks = []
    const CHUNK_SIZE = 10
    for (let i = 0; i < members.length; i += CHUNK_SIZE) {
        chunks.push(members.slice(i, i + CHUNK_SIZE))
    }

    for (const chunk of chunks) {
        await Promise.all(chunk.map(async (member: any) => {
            const name = `${member.firstName} ${member.lastName}`
            const id = member.identifier
            const active = !member.inactiveFlag ? 'Yes' : 'No'

            try {
                // Get First Entry
                const firstRes = await client.request<any[]>('/time/entries', {
                    conditions: `member/id=${member.id}`,
                    orderBy: 'timeStart asc',
                    pageSize: 1,
                    fields: 'timeStart'
                })
                const firstDate = firstRes.length > 0 ? new Date(firstRes[0].timeStart) : null
                const firstDateStr = firstDate ? firstDate.toLocaleDateString() : 'N/A'

                // Get Last Entry
                const lastRes = await client.request<any[]>('/time/entries', {
                    conditions: `member/id=${member.id}`,
                    orderBy: 'timeStart desc',
                    pageSize: 1,
                    fields: 'timeStart'
                })
                const lastDate = lastRes.length > 0 ? new Date(lastRes[0].timeStart) : null
                const lastDateStr = lastDate ? lastDate.toLocaleDateString() : 'N/A'

                // Only include if they have ANY time entries
                if (firstDate) {
                    results.push({ name, id, active, firstDate, lastDate, firstDateStr, lastDateStr })
                }
            } catch (e) {
                console.error(`Error processing ${id}:`, e)
            }
        }))
    }

    // Sort by Last Entry descending (most recent first)
    results.sort((a, b) => (b.lastDate?.getTime() || 0) - (a.lastDate?.getTime() || 0))

    results.forEach(r => {
        report += `| ${r.name} | ${r.id} | ${r.active} | ${r.firstDateStr} | ${r.lastDateStr} |\n`
    })

    const fs = await import('fs')
    fs.writeFileSync('member_history_report.md', report)
    console.log('✅ Report saved to member_history_report.md')
}

main().catch(console.error)
