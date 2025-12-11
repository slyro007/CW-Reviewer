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
    const { startDate, endDate, memberIds, projectId, modifiedSince } = req.query

    console.log('[API /time-entries] Query params:', { startDate, endDate, memberIds, projectId, modifiedSince })

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

    if (projectId) {
      where.projectId = parseInt(projectId as string, 10)
    }

    // Incremental fetch support
    if (modifiedSince) {
      where.updatedAt = {
        gt: new Date(modifiedSince as string)
      }
    }

    console.log('[API /time-entries] Fetching time entries from database...')

    // Select ONLY what we need - Truncating info from DB
    const entries = await prisma.timeEntry.findMany({
      where,
      select: {
        id: true,
        memberId: true,
        ticketId: true,
        projectId: true,
        hours: true,
        billableOption: true,
        notes: true,
        internalNotes: true,
        dateStart: true,
        dateEnd: true,
        updatedAt: true, // Needed for incremental sync merge
        // Only fetch minimal relation data if needed, or rely on IDs
        member: {
          select: {
            id: true,
            identifier: true,
            firstName: true,
            lastName: true
          }
        }
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
      projectId: e.projectId,
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
