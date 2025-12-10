import type { VercelRequest, VercelResponse } from '@vercel/node'

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

    try {
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
    
    // Dynamic import to handle potential module resolution issues
    let ConnectWiseClient
    try {
      const connectwiseModule = await import('./connectwise')
      ConnectWiseClient = connectwiseModule.default || connectwiseModule.ConnectWiseClient
      
      if (!ConnectWiseClient) {
        throw new Error('ConnectWiseClient not found in module')
      }
    } catch (importError: any) {
      console.error('[API /members] Failed to import ConnectWiseClient:', importError)
      return res.status(500).json({ 
        error: 'Failed to load ConnectWise client',
        details: importError?.message
      })
    }
    
    // Validate client is a constructor
    if (typeof ConnectWiseClient !== 'function') {
      console.error('[API /members] ConnectWiseClient is not a constructor:', typeof ConnectWiseClient)
      return res.status(500).json({ 
        error: 'Invalid ConnectWise client configuration'
      })
    }
    
    const client = new ConnectWiseClient({
      clientId,
      publicKey,
      privateKey,
      baseUrl,
      companyId,
    })
    
    // Validate client was created successfully
    if (!client) {
      return res.status(500).json({ 
        error: 'Failed to create ConnectWise client instance'
      })
    }

    console.log('[API /members] Fetching members from ConnectWise...')
    
    // Validate client has getMembers method
    if (typeof client.getMembers !== 'function') {
      return res.status(500).json({ 
        error: 'ConnectWise client missing getMembers method'
      })
    }
    
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
    }).filter(m => m !== null) // Remove invalid entries

    console.log('[API /members] Returning transformed members')
    res.status(200).json(transformed)
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
    
    res.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
    } catch (innerError: any) {
      // If error handler itself fails, return generic error
      console.error('[API /members] Error in error handler:', innerError)
      return res.status(500).json({ 
        error: 'Internal server error',
        message: 'An unexpected error occurred while processing the request'
      })
    }
  } catch (outerError: any) {
    // Catch any errors that occur outside the main try-catch (e.g., import errors)
    console.error('[API /members] Top-level error:', {
      message: outerError?.message,
      stack: outerError?.stack,
      name: outerError?.name,
    })
    
    // Ensure we always return a response
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Function invocation failed',
        message: outerError?.message || 'An unexpected error occurred',
        type: 'FUNCTION_INVOCATION_FAILED'
      })
    }
  }
}

