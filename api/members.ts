import type { VercelRequest, VercelResponse } from '@vercel/node'

import ConnectWiseClient from './connectwise'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Top-level error handler to prevent function crashes
  try {
    console.log('[API /members] Request received:', req.method)
    
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    // Validate environment variables
    const clientId = process.env.CW_CLIENT_ID || process.env.VITE_CW_CLIENT_ID
    const publicKey = process.env.CW_PUBLIC_KEY || process.env.VITE_CW_PUBLIC_KEY
    const privateKey = process.env.CW_PRIVATE_KEY
    const baseUrl = process.env.CW_BASE_URL || process.env.VITE_CW_BASE_URL
    const companyId = process.env.CW_COMPANY_ID || process.env.VITE_CW_COMPANY_ID

    console.log('[API /members] Environment check:', {
      hasClientId: !!clientId,
      hasPublicKey: !!publicKey,
      hasPrivateKey: !!privateKey,
      hasBaseUrl: !!baseUrl,
      hasCompanyId: !!companyId,
    })

    if (!clientId || !publicKey || !privateKey || !baseUrl || !companyId) {
      const missing = []
      if (!clientId) missing.push('CW_CLIENT_ID')
      if (!publicKey) missing.push('CW_PUBLIC_KEY')
      if (!privateKey) missing.push('CW_PRIVATE_KEY')
      if (!baseUrl) missing.push('CW_BASE_URL')
      if (!companyId) missing.push('CW_COMPANY_ID')
      
      console.error('[API /members] Missing environment variables:', missing)
      return res.status(500).json({ 
        error: `Missing required environment variables: ${missing.join(', ')}` 
      })
    }

    console.log('[API /members] Creating ConnectWise client...')
    const client = new ConnectWiseClient({
      clientId,
      publicKey,
      privateKey,
      baseUrl,
      companyId,
    })

    console.log('[API /members] Fetching members from ConnectWise...')
    const members = await client.getMembers()
    console.log(`[API /members] Received ${members?.length || 0} members`)
    
    // Validate members is an array
    if (!Array.isArray(members)) {
      console.error('[API /members] Members is not an array:', typeof members)
      return res.status(500).json({ 
        error: 'Invalid response format from ConnectWise API'
      })
    }
    
    // Transform to only include necessary fields with validation
    const transformed = members.map((m: any) => {
      // Validate required fields exist
      if (!m || typeof m !== 'object') {
        console.warn('[API /members] Invalid member object:', m)
        return null
      }
      
      return {
        id: m.id || null,
        identifier: m.identifier || '',
        firstName: m.firstName || '',
        lastName: m.lastName || '',
        email: m.emailAddress || m.email || '',
        inactiveFlag: m.inactiveFlag || false,
      }
    }).filter(m => m !== null && m.id !== null) // Remove invalid entries

    console.log('[API /members] Returning transformed members')
    return res.status(200).json(transformed)
  } catch (error: any) {
    console.error('[API /members] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    })
    
    // Return detailed error information
    const errorMessage = error.message || 'Failed to fetch members'
    const statusCode = error.message?.includes('401') || error.message?.includes('Unauthorized') 
      ? 401 
      : error.message?.includes('404') || error.message?.includes('Not Found')
      ? 404
      : 500
    
    // Ensure we always return a response
    if (!res.headersSent) {
      return res.status(statusCode).json({ 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    }
  }
}

