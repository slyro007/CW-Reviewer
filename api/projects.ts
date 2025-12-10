/**
 * Projects API Endpoint
 * 
 * Fetches project data from ConnectWise Projects API
 * Returns actual project management entities with status, manager, dates, etc.
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
      console.error('[Projects API] Missing config:', missing)
      return res.status(500).json({ 
        error: 'Server configuration error',
        details: `Missing: ${missing.join(', ')}`
      })
    }

    const client = new ConnectWiseClient(config)

    // Parse query params
    const { managerIds } = req.query

    // Parse manager IDs if provided (comma-separated)
    const managers = managerIds 
      ? (typeof managerIds === 'string' ? managerIds.split(',') : managerIds as string[])
      : undefined

    console.log('[Projects API] Fetching ALL projects', { managers })

    // Fetch all projects - no limit (pageSize 1000 is CW max per request)
    const projects = await client.getProjects(managers, {
      pageSize: 1000,
    })

    console.log(`[Projects API] Fetched ${projects.length} projects`)

    return res.status(200).json(projects)
  } catch (error: any) {
    console.error('[Projects API] Error:', error.message)
    return res.status(500).json({ 
      error: 'Failed to fetch projects',
      message: error.message 
    })
  }
}

