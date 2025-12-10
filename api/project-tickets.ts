/**
 * Project Tickets API Endpoint
 * 
 * Fetches project tickets from the database (synced from ConnectWise)
 * These are tickets that belong to projects (different from service tickets)
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
    const { projectId } = req.query

    console.log('[API /project-tickets] Query params:', { projectId })

    // Build where clause
    const where: any = {}

    if (projectId) {
      where.projectId = parseInt(projectId as string, 10)
    }

    console.log('[API /project-tickets] Fetching project tickets from database...')
    
    const tickets = await prisma.projectTicket.findMany({
      where,
      include: {
        project: true,
      },
      orderBy: {
        id: 'desc',
      },
    })

    console.log(`[API /project-tickets] Returning ${tickets.length} project tickets from database`)
    
    // Transform to match expected format (matching CW API structure)
    const transformed = tickets.map(t => ({
      id: t.id,
      summary: t.summary,
      project: { 
        id: t.projectId, 
        name: t.projectName || t.project?.name 
      },
      phase: t.phaseId ? { id: t.phaseId, name: t.phaseName } : null,
      board: t.boardId ? { id: t.boardId, name: t.boardName } : null,
      status: { name: t.status },
      company: { name: t.company },
      resources: t.resources,
      closedFlag: t.closedFlag,
      priority: { name: t.priority },
      type: { name: t.type },
      wbsCode: t.wbsCode,
      budgetHours: t.budgetHours,
      actualHours: t.actualHours,
      dateEntered: t.dateEntered?.toISOString(),
      closedDate: t.closedDate?.toISOString(),
    }))

    return res.status(200).json(transformed)
  } catch (error: any) {
    console.error('[API /project-tickets] Error:', error)
    return res.status(500).json({ 
      error: 'Failed to fetch project tickets',
      message: error.message 
    })
  }
}
