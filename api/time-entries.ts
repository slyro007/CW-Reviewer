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
    const { startDate, endDate, memberIds } = req.query

    console.log('[API /time-entries] Query params:', { startDate, endDate, memberIds })

    // Build where clause
    const where: any = {}

    if (startDate || endDate) {
      where.dateStart = {}
      if (startDate) {
        where.dateStart.gte = new Date(startDate as string)
      }
      if (endDate) {
        where.dateStart.lte = new Date(endDate as string)
      }
    }

    if (memberIds) {
      const memberIdArray = (memberIds as string).split(',').map(Number)
      where.memberId = { in: memberIdArray }
    }

    console.log('[API /time-entries] Fetching time entries from database...')
    
    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        member: true,
        ticket: true,
      },
      orderBy: {
        dateStart: 'desc',
      },
    })

    console.log(`[API /time-entries] Returning ${entries.length} time entries from database`)
    
    // Transform to match expected format
    const transformed = entries.map(e => ({
      id: e.id,
      memberId: e.memberId,
      ticketId: e.ticketId,
      hours: e.hours,
      billableOption: e.billableOption,
      notes: e.notes,
      dateStart: e.dateStart.toISOString(),
      dateEnd: e.dateEnd?.toISOString(),
      internalNotes: e.internalNotes,
    }))

    return res.status(200).json(transformed)
  } catch (error: any) {
    console.error('[API /time-entries] Error:', error)
    return res.status(500).json({ error: error.message || 'Failed to fetch time entries' })
  }
}
