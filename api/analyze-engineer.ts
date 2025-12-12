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
                const data = cached.data as any
                if (data && data.analysis) {
                    return res.status(200).json({
                        analysis: data.analysis,
                        stats: {
                            ...data.stats,
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
        const allTimeEntries = await prisma.timeEntry.findMany({
            where: { memberId: member.id },
            orderBy: { dateStart: 'desc' },
            select: {
                dateStart: true,
                hours: true,
                notes: true,
                ticket: {
                    select: {
                        summary: true,
                        type: true,
                        subtype: true,
                        item: true,
                        initialDescription: true
                    }
                },
                project: { select: { name: true } }
            }
        })

        // Stats (always based on full data)
        const totalEntries = allTimeEntries.length
        const totalHours = allTimeEntries.reduce((sum, t) => sum + t.hours, 0)

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

        const baseStats = {
            totalEntries,
            totalHours,
            projectsCount: projects.length,
            analyzedAt: new Date().toISOString()
        }

        // 4. Fallback Strategy Logic
        const strategies = [
            { name: 'Full History', limit: undefined },
            { name: 'Recent History (Heavy)', limit: 1500 },
            { name: 'Recent History (Medium)', limit: 800 },
            { name: 'Recent History (Light)', limit: 400 }
        ]

        let analysis = null
        let usedStrategy = null
        let errorDetails = null

        const client = new OpenAIClient(process.env.OPENAI_API_KEY)

        // Prepare project history once (it's usually small enough)
        const projectHistory = projects.map(p => {
            const role = p.managerIdentifier === memberIdentifier ? 'M' : 'C'
            return `${p.name}|${p.status}|${role}|${p.percentComplete}%`
        })

        for (const strategy of strategies) {
            try {
                console.log(`Attempting analysis with strategy: ${strategy.name}`)

                // Slice data if limit exists
                const entriesToUse = strategy.limit
                    ? allTimeEntries.slice(0, strategy.limit)
                    : allTimeEntries

                // Compress
                const recentWork = entriesToUse.map(t => {
                    // Format: "Date|Hours|Context|Description|Notes"
                    const title = t.ticket?.summary || t.project?.name || 'No Title'

                    // Build rich context string: "Type > Subtype > Item"
                    let context = ''
                    if (t.ticket) {
                        const parts = [t.ticket.type, t.ticket.subtype, t.ticket.item].filter(Boolean)
                        context = parts.length > 0 ? parts.join(' > ') : 'Ticket'
                    } else {
                        context = 'Project'
                    }

                    const cleanTitle = title.replace(/\|/g, '-').substring(0, 50)
                    const cleanNotes = (t.notes || '').replace(/\s+/g, ' ').replace(/\|/g, '-').substring(0, 100)

                    // Include initial description if available (truncated)
                    const description = t.ticket?.initialDescription
                        ? t.ticket.initialDescription.replace(/\s+/g, ' ').replace(/\|/g, '-').substring(0, 500)
                        : ''

                    return `${formatDate(t.dateStart)}|${t.hours}|${cleanTitle}|${context}|${description}|${cleanNotes}`
                }).join('\n')

                // Attempt Generation
                analysis = await client.generateAnalysis('deepAssessment', {
                    member,
                    stats: { ...baseStats, strategy: strategy.name }, // Pass strategy context to AI
                    recentWork,
                    projectHistory
                }, { model: 'gpt-4o' })

                usedStrategy = strategy.name
                break // Success!

            } catch (err: any) {
                console.warn(`Strategy ${strategy.name} failed: ${err.message}`)
                errorDetails = err.message

                // Only continue if it's a rate limit or context length error
                // 429 = Rate Limit, 400 = Bad Request (often Context Length)
                const isRetryable = err.message.includes('429') ||
                    err.message.includes('400') ||
                    err.message.includes('context_length_exceeded') ||
                    err.message.includes('string too long')

                if (!isRetryable) {
                    throw err // Fatal error (auth, network, etc)
                }
            }
        }

        if (!analysis) {
            throw new Error(`Analysis failed after all retries. Last error: ${errorDetails}`)
        }

        // Add footer note if fallback was used
        if (usedStrategy !== 'Full History') {
            analysis += `\n\n> [!NOTE]\n> **Data Volume Limit**: Due to the massive size of the history, this analysis focused on the ${usedStrategy} most recent records to respect API constraints.`
        }

        // 5. Save to DB Cache
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 30)

        const finalStats = { ...baseStats, strategy: usedStrategy }

        await prisma.analysisCache.upsert({
            where: { cacheKey },
            create: {
                cacheKey,
                cacheType: 'ai_assessment',
                data: { analysis, stats: finalStats },
                expiresAt
            },
            update: {
                data: { analysis, stats: finalStats },
                expiresAt,
                updatedAt: new Date()
            }
        })

        res.status(200).json({
            analysis,
            stats: { ...finalStats, cached: false, lastUpdated: new Date().toISOString() }
        })

    } catch (error: any) {
        console.error('Error generating analysis:', error)
        res.status(500).json({ error: error.message || 'Failed to generate analysis' })
    }
}
