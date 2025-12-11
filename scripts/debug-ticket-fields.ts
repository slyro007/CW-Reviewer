
import { ConnectWiseClient } from '../api/connectwise'
import * as dotenv from 'dotenv'

dotenv.config()

async function main() {
    const companyId = process.env.VITE_CW_COMPANY_ID || process.env.CW_COMPANY_ID
    const publicKey = process.env.VITE_CW_PUBLIC_KEY || process.env.CW_PUBLIC_KEY
    const privateKey = process.env.VITE_CW_PRIVATE_KEY || process.env.CW_PRIVATE_KEY
    const clientId = process.env.VITE_CW_CLIENT_ID || process.env.CW_CLIENT_ID

    if (!companyId || !publicKey || !privateKey || !clientId) {
        console.error('Missing env vars')
        process.exit(1)
    }

    const client = new ConnectWiseClient(companyId, publicKey, privateKey, clientId)

    console.log('Fetching 1 service ticket to inspect fields...')
    try {
        const tickets = await client.request('/service/tickets', {
            pageSize: 1,
            orderBy: 'dateEntered desc',
            fields: 'id,summary,dateEntered,dateResolved,closedDate,closedFlag' // Ask for specific date fields to check names
        })

        if (tickets.length > 0) {
            console.log('Raw Ticket Data:', JSON.stringify(tickets[0], null, 2))
        } else {
            console.log('No tickets found.')
        }
    } catch (err: any) {
        console.error('Error:', err.message)
        if (err.response) {
            console.error('Response:', err.response.data)
        }
    }
}

main()
