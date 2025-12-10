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
    const { startDate, endDate, memberIds } = req.query

    const client = new ConnectWiseClient({
      clientId: process.env.CW_CLIENT_ID || process.env.VITE_CW_CLIENT_ID || '',
      publicKey: process.env.CW_PUBLIC_KEY || process.env.VITE_CW_PUBLIC_KEY || '',
      privateKey: process.env.CW_PRIVATE_KEY || '',
      baseUrl: process.env.CW_BASE_URL || process.env.VITE_CW_BASE_URL || '',
      companyId: process.env.CW_COMPANY_ID || process.env.VITE_CW_COMPANY_ID || '',
    })

    const start = startDate ? new Date(startDate as string) : undefined
    const end = endDate ? new Date(endDate as string) : undefined
    const memberIdArray = memberIds 
      ? (memberIds as string).split(',').map(Number)
      : undefined

    const entries = await client.getTimeEntries(start, end, memberIdArray)
    
    // Transform to only include necessary fields
    const transformed = entries.map((e: any) => ({
      id: e.id,
      memberId: e.member?.id,
      ticketId: e.ticket?.id,
      hours: e.actualHours || e.hours,
      billableOption: e.billableOption,
      notes: e.notes,
      dateStart: e.timeStart || e.dateStart,
      dateEnd: e.timeEnd || e.dateEnd,
      internalNotes: e.internalNotes,
    }))

    res.status(200).json(transformed)
  } catch (error: any) {
    console.error('Error fetching time entries:', error)
    res.status(500).json({ error: error.message || 'Failed to fetch time entries' })
  }
}

