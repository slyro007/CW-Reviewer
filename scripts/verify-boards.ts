/**
 * Script to verify service desk boards exist and can be fetched
 * Run with: npx tsx scripts/verify-boards.ts
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load environment variables
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function loadEnv() {
  try {
    const envPath = join(__dirname, '..', '.env')
    const envContent = readFileSync(envPath, 'utf-8')
    
    envContent.split('\n').forEach(line => {
      line = line.trim()
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=')
        const value = valueParts.join('=').replace(/^["']|["']$/g, '')
        process.env[key] = value
      }
    })
  } catch (error) {
    console.error('Warning: Could not load .env file. Using environment variables.')
  }
}

loadEnv()

import ConnectWiseClient from '../api/connectwise.js'

const SERVICE_BOARD_NAMES = [
  'Escalations(MS)',
  'HelpDesk (MS)', // Note: Exact capitalization from API
  'HelpDesk (TS)', // Note: Exact capitalization from API
  'Triage',
  'RMM-Continuum',
  'WL Internal',
]

async function verifyBoards() {
  const client = new ConnectWiseClient({
    clientId: process.env.CW_CLIENT_ID || process.env.VITE_CW_CLIENT_ID || '',
    publicKey: process.env.CW_PUBLIC_KEY || process.env.VITE_CW_PUBLIC_KEY || '',
    privateKey: process.env.CW_PRIVATE_KEY || '',
    baseUrl: process.env.CW_BASE_URL || process.env.VITE_CW_BASE_URL || '',
    companyId: process.env.CW_COMPANY_ID || process.env.VITE_CW_COMPANY_ID || '',
  })

  console.log('🔍 Fetching all boards...\n')
  
  try {
    // Fetch all boards
    const allBoards = await client.getBoards()
    console.log(`✅ Found ${allBoards.length} total boards\n`)
    
    // Try to find each service board
    const foundBoards: Array<{ name: string; id: number; found: boolean }> = []
    const notFoundBoards: string[] = []
    
    for (const boardName of SERVICE_BOARD_NAMES) {
      // Try exact match first
      let board = allBoards.find((b: any) => b.name === boardName)
      
      // Try case-insensitive match
      if (!board) {
        board = allBoards.find((b: any) => 
          b.name.toLowerCase() === boardName.toLowerCase()
        )
      }
      
      // Try partial match
      if (!board) {
        board = allBoards.find((b: any) => 
          b.name.toLowerCase().includes(boardName.toLowerCase()) ||
          boardName.toLowerCase().includes(b.name.toLowerCase())
        )
      }
      
      if (board) {
        foundBoards.push({ name: board.name, id: board.id, found: true })
        console.log(`✅ Found: "${board.name}" (ID: ${board.id})`)
      } else {
        notFoundBoards.push(boardName)
        console.log(`❌ Not found: "${boardName}"`)
      }
    }
    
    console.log('\n' + '='.repeat(60))
    console.log(`Found: ${foundBoards.length}/${SERVICE_BOARD_NAMES.length} boards`)
    
    if (foundBoards.length > 0) {
      console.log('\n📋 Board IDs to use:')
      console.log(foundBoards.map(b => `  ${b.name}: ${b.id}`).join('\n'))
      console.log('\nBoard IDs array:', foundBoards.map(b => b.id).join(', '))
    }
    
    if (notFoundBoards.length > 0) {
      console.log(`\n⚠️  Not found boards: ${notFoundBoards.join(', ')}`)
      console.log('\n💡 Similar board names:')
      notFoundBoards.forEach(name => {
        const similar = allBoards.filter((b: any) => 
          b.name.toLowerCase().includes(name.toLowerCase().split(/[()]/)[0]) ||
          name.toLowerCase().includes(b.name.toLowerCase().split(/[()]/)[0])
        )
        if (similar.length > 0) {
          console.log(`  "${name}" might be: ${similar.map((b: any) => `"${b.name}" (${b.id})`).join(', ')}`)
        }
      })
    }
    
    // Test fetching tickets from found boards
    if (foundBoards.length > 0) {
      console.log('\n' + '='.repeat(60))
      console.log('🧪 Testing ticket fetch from found boards...\n')
      
      const boardIds = foundBoards.map(b => b.id)
      const oneWeekAgo = new Date()
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
      
      try {
        const tickets = await client.getTickets(boardIds, oneWeekAgo, new Date())
        console.log(`✅ Successfully fetched ${tickets.length} tickets from service boards`)
        console.log(`   (Last 7 days, from ${foundBoards.length} boards)`)
        
        // Show ticket distribution by board
        const byBoard: Record<number, number> = {}
        tickets.forEach((t: any) => {
          const boardId = t.board?.id || t.boardId
          byBoard[boardId] = (byBoard[boardId] || 0) + 1
        })
        
        console.log('\n   Ticket distribution:')
        foundBoards.forEach(b => {
          const count = byBoard[b.id] || 0
          console.log(`     ${b.name}: ${count} tickets`)
        })
      } catch (error: any) {
        console.error('❌ Error fetching tickets:', error.message)
      }
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

verifyBoards()

