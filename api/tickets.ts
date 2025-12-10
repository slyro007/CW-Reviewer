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
    const { boardIds, startDate, endDate } = req.query

    const client = new ConnectWiseClient({
      clientId: process.env.CW_CLIENT_ID || process.env.VITE_CW_CLIENT_ID || '',
      publicKey: process.env.CW_PUBLIC_KEY || process.env.VITE_CW_PUBLIC_KEY || '',
      privateKey: process.env.CW_PRIVATE_KEY || '',
      baseUrl: process.env.CW_BASE_URL || process.env.VITE_CW_BASE_URL || '',
      companyId: process.env.CW_COMPANY_ID || process.env.VITE_CW_COMPANY_ID || '',
    })

    const boardIdArray = boardIds 
      ? (boardIds as string).split(',').map(Number)
      : undefined
    const start = startDate ? new Date(startDate as string) : undefined
    const end = endDate ? new Date(endDate as string) : undefined

    const tickets = await client.getTickets(boardIdArray, start, end)
    
    // Transform to only include necessary fields
    const transformed = tickets.map((t: any) => ({
      id: t.id,
      summary: t.summary,
      boardId: t.board?.id,
      status: t.status?.name,
      closedDate: t.closedDate,
      closedFlag: t.closedFlag || false,
      dateEntered: t.dateEntered,
      resolvedDate: t.resolvedDate || t.actualHours,
    }))

    res.status(200).json(transformed)
  } catch (error: any) {
    console.error('Error fetching tickets:', error)
    res.status(500).json({ error: error.message || 'Failed to fetch tickets' })
  }
}

