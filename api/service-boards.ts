/**
 * Service Boards API Endpoint
 * 
 * Returns the list of service board IDs for filtering service tickets
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import prisma from './db.js'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('[API /service-boards] Fetching service boards from database...')
    
    const serviceBoards = await prisma.serviceBoard.findMany({
      orderBy: {
        name: 'asc',
      },
    })

    console.log(`[API /service-boards] Returning ${serviceBoards.length} service boards from database`)
    
    // Transform to match expected format
    const transformed = serviceBoards.map(b => ({
      id: b.boardId,
      name: b.name,
    }))

    return res.status(200).json(transformed)
  } catch (error: any) {
    console.error('[API /service-boards] Error:', error)
    return res.status(500).json({ error: error.message || 'Failed to fetch service boards' })
  }
}

