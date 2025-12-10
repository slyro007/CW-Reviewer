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
    const { type } = req.query

    console.log('[API /boards] Query params:', { type })

    // Build where clause
    const where: any = {}
    if (type) {
      where.type = type as string
    }

    console.log('[API /boards] Fetching boards from database...')
    
    const boards = await prisma.board.findMany({
      where,
      orderBy: {
        name: 'asc',
      },
    })

    console.log(`[API /boards] Returning ${boards.length} boards from database`)
    
    // Transform to match expected format
    const transformed = boards.map(b => ({
      id: b.id,
      name: b.name,
      type: b.type,
    }))

    return res.status(200).json(transformed)
  } catch (error: any) {
    console.error('[API /boards] Error:', error)
    return res.status(500).json({ error: error.message || 'Failed to fetch boards' })
  }
}
