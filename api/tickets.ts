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
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // ... (rest of validation)

  try {
    const { boardIds, startDate, endDate, modifiedSince } = req.query

    console.log('[API /tickets] Query params:', { boardIds, startDate, endDate, modifiedSince })

    // Build where clause
    const where: any = {}

    if (boardIds) {
      const boardIdArray = (boardIds as string).split(',').map(Number)
      where.boardId = { in: boardIdArray }
    }

    if (startDate || endDate) {
      where.dateEntered = {}
      if (startDate) {
        where.dateEntered.gte = new Date(startDate as string)
      }
      if (endDate) {
        where.dateEntered.lte = new Date(endDate as string)
      }
    }

    // Incremental fetch support
    if (modifiedSince) {
      where.updatedAt = {
        gt: new Date(modifiedSince as string)
      }
    }

    console.log('[API /tickets] Fetching tickets from database...')

    // Select ONLY what we need - Truncating info from DB
    const tickets = await prisma.ticket.findMany({
      where,
      select: {
        id: true,
        summary: true,
        boardId: true,
        status: true,
        closedDate: true,
        closedFlag: true,
        dateEntered: true,
        resolvedDate: true,
        owner: true,
        company: true,
        type: true,
        priority: true,
        resources: true, // teamMember maps to this
        estimatedHours: true,
        actualHours: true,
        updatedAt: true, // Needed for client-side incremental merging
        board: {
          select: {
            id: true,
            name: true,
            type: true
          }
        }
      },
      orderBy: {
        dateEntered: 'desc',
      },
    })

    console.log(`[API /tickets] Returning ${tickets.length} tickets from database`)

    // Transform to match expected format
    const transformed = tickets.map(t => ({
      id: t.id,
      summary: t.summary,
      boardId: t.boardId,
      status: t.status,
      closedDate: t.closedDate?.toISOString(),
      closedFlag: t.closedFlag,
      dateEntered: t.dateEntered?.toISOString(),
      resolvedDate: t.resolvedDate?.toISOString(),
      owner: t.owner,
      company: t.company,
      type: t.type,
      priority: t.priority,
      estimatedHours: t.estimatedHours,
      actualHours: t.actualHours,
      teamMember: t.resources,
    }))

    return res.status(200).json(transformed)
  } catch (error: any) {
    console.error('[API /tickets] Error:', error)
    return res.status(500).json({ error: error.message || 'Failed to fetch tickets' })
  }
}
