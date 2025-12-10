import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAIClient from './openai.js'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { template, data, options } = req.body

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' })
    }

    const client = new OpenAIClient(process.env.OPENAI_API_KEY)
    const analysis = await client.generateAnalysis(template, data, options)

    res.status(200).json({ analysis })
  } catch (error: any) {
    console.error('Error generating analysis:', error)
    res.status(500).json({ error: error.message || 'Failed to generate analysis' })
  }
}

