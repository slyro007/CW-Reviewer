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
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400') // Members barely change, cache longer

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // ... (rest of validation)

  try {
    console.log('[API /members] Fetching members from database...')

    // Select ONLY what we need - Truncating info from DB
    const members = await prisma.member.findMany({
      // Fetch all members (active and inactive)
      select: {
        id: true,
        identifier: true,
        firstName: true,
        lastName: true,
        email: true,
        inactiveFlag: true,
        startDate: true,
        endDate: true,
        isActive: true
      },
      orderBy: {
        firstName: 'asc',
      },
    })

    console.log(`[API /members] Returning ${members.length} members from database`)

    // Transform to match expected format
    const transformed = members.map(m => ({
      id: m.id,
      identifier: m.identifier,
      firstName: m.firstName || '',
      lastName: m.lastName || '',
      email: m.email || '',
      inactiveFlag: m.inactiveFlag,
      isActive: m.isActive,
      startDate: m.startDate,
      endDate: m.endDate,
    }))

    return res.status(200).json(transformed)
  } catch (error: any) {
    console.error('[API /members] Error:', error)
    return res.status(500).json({
      error: error.message || 'Failed to fetch members'
    })
  }
}
