import type { VercelRequest, VercelResponse } from '@vercel/node'

import ConnectWiseClient from './connectwise.js'

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
    const codebase = process.env.CW_CODEBASE // Optional: manual codebase configuration

    console.log('[API /members] Environment check:', {
      hasClientId: !!clientId,
      hasPublicKey: !!publicKey,
      hasPrivateKey: !!privateKey,
      hasBaseUrl: !!baseUrl,
      hasCompanyId: !!companyId,
      hasCodebase: !!codebase,
      codebase: codebase || '(will auto-detect)',
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

    // Recommend setting CW_CODEBASE for production
    if (!codebase) {
      console.warn('[API /members] ⚠️  CW_CODEBASE not set - will attempt auto-detection (may be unreliable in serverless)')
    }

    console.log('[API /members] Creating ConnectWise client...')
    let client
    try {
      client = new ConnectWiseClient({
        clientId,
        publicKey,
        privateKey,
        baseUrl,
        companyId,
      })
    } catch (clientError: any) {
      console.error('[API /members] Failed to create ConnectWise client:', clientError.message)
      return res.status(500).json({ 
        error: 'Failed to initialize ConnectWise client',
        details: clientError.message
      })
    }

    console.log('[API /members] Fetching members from ConnectWise...')
    let members
    try {
      members = await client.getMembers()
    } catch (fetchError: any) {
      console.error('[API /members] Failed to fetch members:', {
        message: fetchError.message,
        stack: fetchError.stack,
      })
      
      // Provide specific error message
      const errorMessage = fetchError.message || 'Failed to fetch members from ConnectWise'
      const statusCode = fetchError.message?.includes('401') || fetchError.message?.includes('Unauthorized') 
        ? 401 
        : fetchError.message?.includes('404') || fetchError.message?.includes('Not Found')
        ? 404
        : 500
      
      return res.status(statusCode).json({ 
        error: errorMessage,
        hint: !codebase ? 'Consider setting CW_CODEBASE environment variable for more reliable operation' : undefined
      })
    }
    
    console.log(`[API /members] Received ${members?.length || 0} members`)
    
    // Validate members is an array
    if (!Array.isArray(members)) {
      console.error('[API /members] Members is not an array:', typeof members)
      return res.status(500).json({ 
        error: 'Invalid response format from ConnectWise API',
        receivedType: typeof members
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

    console.log('[API /members] Returning %d transformed members', transformed.length)
    return res.status(200).json(transformed)
  } catch (error: any) {
    // Ultimate fallback - catch ANY unhandled error
    console.error('[API /members] UNHANDLED ERROR:', {
      message: error?.message || 'Unknown error',
      stack: error?.stack || 'No stack trace',
      name: error?.name || 'Unknown',
      type: typeof error,
    })
    
    // ALWAYS return a response to prevent function invocation failure
    try {
      if (!res.headersSent) {
        return res.status(500).json({ 
          error: 'Internal server error',
          message: error?.message || 'An unexpected error occurred',
          hint: 'Check Vercel function logs for details'
        })
      }
    } catch (responseError) {
      // If even sending the error response fails, log it
      console.error('[API /members] Failed to send error response:', responseError)
    }
  }
}

