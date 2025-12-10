import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Check environment variables (without exposing values)
    const envCheck = {
      hasClientId: !!(process.env.CW_CLIENT_ID || process.env.VITE_CW_CLIENT_ID),
      hasPublicKey: !!(process.env.CW_PUBLIC_KEY || process.env.VITE_CW_PUBLIC_KEY),
      hasPrivateKey: !!process.env.CW_PRIVATE_KEY,
      hasBaseUrl: !!(process.env.CW_BASE_URL || process.env.VITE_CW_BASE_URL),
      hasCompanyId: !!(process.env.CW_COMPANY_ID || process.env.VITE_CW_COMPANY_ID),
    }

    const allPresent = Object.values(envCheck).every(v => v === true)

    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
      },
      config: {
        ...envCheck,
        allConfigured: allPresent,
      },
    })
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      error: error.message || 'Health check failed',
    })
  }
}

