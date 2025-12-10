/**
 * Project Tickets API Endpoint
 * 
 * Fetches project tickets from ConnectWise /project/tickets API
 * These are tickets that belong to projects (different from service tickets)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import ConnectWiseClient from './connectwise.js'

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
    const config = {
      clientId: process.env.CW_CLIENT_ID || '',
      publicKey: process.env.CW_PUBLIC_KEY || '',
      privateKey: process.env.CW_PRIVATE_KEY || '',
      baseUrl: process.env.CW_BASE_URL || '',
      companyId: process.env.CW_COMPANY_ID || '',
    }

    // Validate config
    const missing = Object.entries(config)
      .filter(([, value]) => !value)
      .map(([key]) => key)

    if (missing.length > 0) {
      console.error('[Project Tickets API] Missing config:', missing)
      return res.status(500).json({ 
        error: 'Server configuration error',
        details: `Missing: ${missing.join(', ')}`
      })
    }

    const client = new ConnectWiseClient(config)

    // Parse query params
    const { projectId } = req.query

    // Parse project ID if provided
    const projId = projectId 
      ? parseInt(projectId as string, 10)
      : undefined

    console.log('[Project Tickets API] Fetching ALL project tickets', { projectId: projId })

    // Fetch all project tickets - no limit (pageSize 1000 is CW max per request)
    const tickets = await client.getProjectTickets(projId, {
      pageSize: 1000,
    })

    console.log(`[Project Tickets API] Fetched ${tickets.length} project tickets`)

    return res.status(200).json(tickets)
  } catch (error: any) {
    console.error('[Project Tickets API] Error:', error.message)
    return res.status(500).json({ 
      error: 'Failed to fetch project tickets',
      message: error.message 
    })
  }
}

