
import { ConnectWiseClient } from '../api/connectwise'
import * as dotenv from 'dotenv'

dotenv.config()

const config = {
    clientId: process.env.VITE_CW_CLIENT_ID || process.env.CW_CLIENT_ID || '',
    companyId: process.env.VITE_CW_COMPANY_ID || process.env.CW_COMPANY_ID || '',
    publicKey: process.env.VITE_CW_PUBLIC_KEY || process.env.CW_PUBLIC_KEY || '',
    privateKey: process.env.CW_PRIVATE_KEY || '',
    baseUrl: process.env.VITE_CW_BASE_URL || process.env.CW_BASE_URL || 'https://api-na.myconnectwise.net/v4_6_release/apis/3.0'
}

async function main() {
    console.log('Searching for members...')
    const client = new ConnectWiseClient(config)

    try {
        const members = await client.getMembers()
        const fs = await import('fs')
        const lines = members.map((m: any) => `${m.firstName} ${m.lastName} | ID: ${m.identifier} | Inactive: ${m.inactiveFlag}`)
        fs.writeFileSync('all_members.txt', lines.join('\n'))
        console.log('Saved to all_members.txt')
    } catch (e) {
        console.error(e)
    }
}

main()
