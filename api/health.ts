import type { VercelRequest, VercelResponse } from '@vercel/node'
import ConnectWiseClient from './connectwise'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const startTime = Date.now()

    // Check environment variables (without exposing values)
    const clientId = process.env.CW_CLIENT_ID || process.env.VITE_CW_CLIENT_ID
    const publicKey = process.env.CW_PUBLIC_KEY || process.env.VITE_CW_PUBLIC_KEY
    const privateKey = process.env.CW_PRIVATE_KEY
    const baseUrl = process.env.CW_BASE_URL || process.env.VITE_CW_BASE_URL
    const companyId = process.env.CW_COMPANY_ID || process.env.VITE_CW_COMPANY_ID
    const codebase = process.env.CW_CODEBASE

    const envCheck = {
      hasClientId: !!clientId,
      hasPublicKey: !!publicKey,
      hasPrivateKey: !!privateKey,
      hasBaseUrl: !!baseUrl,
      hasCompanyId: !!companyId,
      hasCodebase: !!codebase,
      codebaseValue: codebase || '(auto-detect)',
    }

    const allPresent = envCheck.hasClientId && envCheck.hasPublicKey && 
                       envCheck.hasPrivateKey && envCheck.hasBaseUrl && 
                       envCheck.hasCompanyId

    // If test=true query param, also test ConnectWise connectivity
    const testConnectivity = req.query.test === 'true'
    let connectivityTest: any = { skipped: true }

    if (testConnectivity && allPresent) {
      console.log('[Health] Testing ConnectWise connectivity...')
      try {
        const client = new ConnectWiseClient({
          clientId: clientId!,
          publicKey: publicKey!,
          privateKey: privateKey!,
          baseUrl: baseUrl!,
          companyId: companyId!,
        })

        const testStart = Date.now()
        const members = await client.getMembers({ pageSize: 1 })
        const testDuration = Date.now() - testStart

        connectivityTest = {
          success: true,
          responseTime: testDuration,
          membersFound: Array.isArray(members) ? members.length : 0,
        }
        console.log('[Health] Connectivity test passed:', connectivityTest)
      } catch (testError: any) {
        connectivityTest = {
          success: false,
          error: testError.message || 'Connectivity test failed',
        }
        console.error('[Health] Connectivity test failed:', testError.message)
      }
    }

    const responseTime = Date.now() - startTime

    const status = allPresent ? 'ok' : 'misconfigured'
    const warnings = []
    
    if (!codebase) {
      warnings.push('CW_CODEBASE not set - auto-detection may be unreliable in serverless environment')
    }
    if (testConnectivity && !connectivityTest.success && connectivityTest.error) {
      warnings.push(`Connectivity test failed: ${connectivityTest.error}`)
    }

    res.status(allPresent ? 200 : 500).json({
      status,
      timestamp: new Date().toISOString(),
      responseTime,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
      },
      config: envCheck,
      connectivity: testConnectivity ? connectivityTest : { info: 'Add ?test=true to test ConnectWise API connectivity' },
      warnings: warnings.length > 0 ? warnings : undefined,
    })
  } catch (error: any) {
    console.error('[Health] Error:', error)
    res.status(500).json({
      status: 'error',
      error: error.message || 'Health check failed',
      timestamp: new Date().toISOString(),
    })
  }
}

