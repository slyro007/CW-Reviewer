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
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // ... (rest of validation)

  try {
    console.log('[API /service-boards] Fetching service boards from database...')

    // Select ONLY what we need - Truncating info from DB
    const serviceBoards = await prisma.serviceBoard.findMany({
      select: {
        boardId: true,
        name: true
      },
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

