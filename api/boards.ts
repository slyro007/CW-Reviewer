import type { VercelRequest, VercelResponse } from '@vercel/node'
import ConnectWiseClient from './connectwise.js'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { type } = req.query

    const client = new ConnectWiseClient({
      clientId: process.env.CW_CLIENT_ID || process.env.VITE_CW_CLIENT_ID || '',
      publicKey: process.env.CW_PUBLIC_KEY || process.env.VITE_CW_PUBLIC_KEY || '',
      privateKey: process.env.CW_PRIVATE_KEY || '',
      baseUrl: process.env.CW_BASE_URL || process.env.VITE_CW_BASE_URL || '',
      companyId: process.env.CW_COMPANY_ID || process.env.VITE_CW_COMPANY_ID || '',
    })

    const boards = await client.getBoards(type as 'MS' | 'PS' | undefined)
    
    // Transform to only include necessary fields
    const transformed = boards.map((b: any) => ({
      id: b.id,
      name: b.name,
      type: b.name.includes('MS') ? 'MS' : b.name.includes('PS') ? 'PS' : 'OTHER',
    }))

    res.status(200).json(transformed)
  } catch (error: any) {
    console.error('Error fetching boards:', error)
    res.status(500).json({ error: error.message || 'Failed to fetch boards' })
  }
}

