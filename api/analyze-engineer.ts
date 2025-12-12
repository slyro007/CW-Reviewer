import type { VercelRequest, VercelResponse } from '@vercel/node'
import prisma from './db.js'
import OpenAIClient from './openai.js'

// Helper to format date concisely
const formatDate = (d: Date) => d.toISOString().split('T')[0]

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
) {
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
        const { memberIdentifier, forceRefresh } = req.body

        if (!memberIdentifier) {
            return res.status(400).json({ error: 'memberIdentifier is required' })
        }

        const cacheKey = `assessment_${memberIdentifier}`

        // 1. Check DB Cache
        if (!forceRefresh) {
            const cached = await prisma.analysisCache.findUnique({
                where: { cacheKey }
            })

            if (cached && cached.expiresAt > new Date()) {
                // Type guard for the JSON data
                const data = cached.data as any
                if (data && data.analysis) {
                    return res.status(200).json({
                        analysis: data.analysis,
                        stats: {
                            ...data.stats, // Include cached stats if available
                            cached: true,
                            lastUpdated: cached.updatedAt.toISOString()
                        }
                    })
                }
            }
        }

        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ error: 'OpenAI API key not configured' })
        }

        // 2. Fetch Member
        const member = await prisma.member.findUnique({
            where: { identifier: memberIdentifier },
        })

        if (!member) {
            return res.status(404).json({ error: 'Member not found' })
        }

        // 3. Fetch ALL Data
        const timeEntries = await prisma.timeEntry.findMany({
            where: { memberId: member.id },
            orderBy: { dateStart: 'desc' },
            select: {
                dateStart: true,
                hours: true,
                notes: true,
                ticket: { select: { summary: true } },
                project: { select: { name: true } }
            }
        })

        // Stats
        const totalEntries = timeEntries.length
        const totalHours = timeEntries.reduce((sum, t) => sum + t.hours, 0)

        const projects = await prisma.project.findMany({
            where: {
                OR: [
                    { managerIdentifier: memberIdentifier },
                    { timeEntries: { some: { memberId: member.id } } }
                ]
            },
            orderBy: { updatedAt: 'desc' },
            select: {
                name: true,
                status: true,
                managerIdentifier: true,
                percentComplete: true
            }
        })

        const stats = {
            totalEntries,
            totalHours,
            projectsCount: projects.length,
            analyzedAt: new Date().toISOString()
        }

        // 4. Compress
        const recentWork = timeEntries.map(t => {
            const title = t.ticket?.summary || t.project?.name || 'No Title'
            const cleanTitle = title.replace(/\|/g, '-').substring(0, 50)
            const cleanNotes = (t.notes || '').replace(/\s+/g, ' ').replace(/\|/g, '-').substring(0, 100)
            return `${formatDate(t.dateStart)}|${t.hours}|${cleanTitle}|${cleanNotes}`
        }).join('\n')

        const projectHistory = projects.map(p => {
            const role = p.managerIdentifier === memberIdentifier ? 'M' : 'C'
            return `${p.name}|${p.status}|${role}|${p.percentComplete}%`
        })

        // 5. OpenAI
        const client = new OpenAIClient(process.env.OPENAI_API_KEY)

        const analysis = await client.generateAnalysis('deepAssessment', {
            member,
            stats,
            recentWork,
            projectHistory
        }, { model: 'gpt-4o' })

        // 6. Save to DB Cache
        // Expire in 30 days or similar (long term storage, but technically cache)
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 30)

        await prisma.analysisCache.upsert({
            where: { cacheKey },
            create: {
                cacheKey,
                cacheType: 'ai_assessment',
                data: { analysis, stats },
                expiresAt
            },
            update: {
                data: { analysis, stats },
                expiresAt,
                updatedAt: new Date()
            }
        })

        res.status(200).json({
            analysis,
            stats: { ...stats, cached: false, lastUpdated: new Date().toISOString() }
        })

    } catch (error: any) {
        console.error('Error generating analysis:', error)
        res.status(500).json({ error: error.message || 'Failed to generate analysis' })
    }
}
