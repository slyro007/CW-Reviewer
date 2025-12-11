
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
    const client = new ConnectWiseClient(config)

    console.log('--- Test 1: Default getMembers (inactiveFlag=false OR inactiveFlag=true) ---')
    try {
        const res1 = await client.getMembers()
        console.log(`Result 1 Count: ${res1.length}`)
    } catch (e: any) { console.error('Error 1:', e.message) }

    console.log('\n--- Test 2: No conditions ---')
    try {
        const res2 = await client.requestAllPages('/system/members', { fields: 'id,identifier,inactiveFlag' })
        console.log(`Result 2 Count: ${res2.length}`)
        const inactiveCount = res2.filter((m: any) => m.inactiveFlag).length
        console.log(`Inactive Count: ${inactiveCount}`)
    } catch (e: any) { console.error('Error 2:', e.message) }
}

main()
