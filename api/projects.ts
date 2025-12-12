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
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // ... (rest of validation)

  try {
    const { managerIds } = req.query

    console.log('[API /projects] Query params:', { managerIds })
    const { status, managerIdentifier, modifiedSince } = req.query

    console.log('[API /projects] Query params:', { status, managerIdentifier, modifiedSince })

    // Build where clause
    const where: any = {}

    if (status) {
      where.status = status as string
    }

    if (managerIdentifier) {
      where.managerIdentifier = managerIdentifier as string
    }
    // Removed default filter to allow fetching projects where engineers are resources but not managers


    // Incremental fetch support
    if (modifiedSince) {
      where.updatedAt = {
        gt: new Date(modifiedSince as string)
      }
    }

    console.log('[API /projects] Fetching projects from database...')

    // Select ONLY necessary fields
    const projects = await prisma.project.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
        company: true,
        managerIdentifier: true,
        managerName: true,
        boardName: true,
        estimatedStart: true,
        estimatedEnd: true,
        actualStart: true,
        actualEnd: true,
        estimatedHours: true,
        actualHours: true,
        percentComplete: true,
        type: true,
        closedFlag: true,
        description: true,
        updatedAt: true, // For incremental sync
        audits: {
          orderBy: {
            dateEntered: 'desc'
          },
          take: 5 // Only need the most recent status changes
        }
      },
      orderBy: {
        name: 'asc',
      },
    })

    console.log(`[API /projects] Returning ${projects.length} projects from database`)

    // Transform to match expected format (matching CW API structure)
    const transformed = projects.map(p => {
      // Find the audit that set it to Closed/Ready to Close
      const closingAudit = p.audits?.find(a =>
        (a.status?.includes('Closed') || a.status?.includes('Ready to Close'))
      )

      return {
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
        description: p.description || undefined,
        // Enhanced audit info
        auditClosedBy: closingAudit?.changedBy || undefined,
        auditClosedDate: closingAudit?.dateEntered ? closingAudit.dateEntered.toISOString() : undefined,
      }
    })

    return res.status(200).json(transformed)
  } catch (error: any) {
    console.error('[API /projects] Error:', error)
    return res.status(500).json({
      error: 'Failed to fetch projects',
      message: error.message
    })
  }
}
