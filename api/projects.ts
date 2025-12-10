/**
 * Projects API Endpoint
 * 
 * Fetches project data from the database (synced from ConnectWise)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import prisma from './db.js'
import { ALLOWED_ENGINEER_IDENTIFIERS } from './config.js'

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
    const { managerIds } = req.query

    console.log('[API /projects] Query params:', { managerIds })

    // Build where clause
    const where: any = {}

    if (managerIds) {
      const managers = typeof managerIds === 'string' 
        ? managerIds.split(',') 
        : managerIds as string[]
      where.managerIdentifier = { in: managers }
    } else {
      // Default to only allowed engineers if no specific managers requested
      where.managerIdentifier = { in: ALLOWED_ENGINEER_IDENTIFIERS }
    }

    console.log('[API /projects] Fetching projects from database...')
    
    const projects = await prisma.project.findMany({
      where,
      orderBy: {
        id: 'desc',
      },
    })

    console.log(`[API /projects] Returning ${projects.length} projects from database`)
    
    // Transform to match expected format (matching CW API structure)
    const transformed = projects.map(p => ({
      id: p.id,
      name: p.name,
      status: { name: p.status },
      company: { name: p.company },
      manager: { 
        identifier: p.managerIdentifier,
        name: p.managerName,
      },
      board: { name: p.boardName },
      estimatedStart: p.estimatedStart?.toISOString(),
      estimatedEnd: p.estimatedEnd?.toISOString(),
      actualStart: p.actualStart?.toISOString(),
      actualEnd: p.actualEnd?.toISOString(),
      estimatedHours: p.estimatedHours,
      actualHours: p.actualHours,
      percentComplete: p.percentComplete,
      type: { name: p.type },
      closedFlag: p.closedFlag,
      description: p.description,
    }))

    return res.status(200).json(transformed)
  } catch (error: any) {
    console.error('[API /projects] Error:', error)
    return res.status(500).json({ 
      error: 'Failed to fetch projects',
      message: error.message 
    })
  }
}
