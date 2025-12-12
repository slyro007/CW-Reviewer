import type { VercelRequest, VercelResponse } from '@vercel/node'
import prisma from './db.js'
import OpenAIClient from './openai.js'
import fs from 'fs'
import path from 'path'

// Helper to format date concisely
const formatDate = (d: Date) => d.toISOString().split('T')[0]

// Helper to sanitize filename
const getAssessmentPath = (identifier: string) => {
    // Determine root dir (process.cwd() usually works in Vercel/Node for local dev)
    const rootDir = process.cwd()
    const dir = path.join(rootDir, 'assessments')
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    return path.join(dir, `${identifier}.md`)
}

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

        // 1. Check for existing file
        const filePath = getAssessmentPath(memberIdentifier)
        if (fs.existsSync(filePath) && !forceRefresh) {
            const stats = fs.statSync(filePath)
            const content = fs.readFileSync(filePath, 'utf-8')

            // Extract persisted metadata if possible, or just return basic stats
            // For simplicity, we'll return the content and let the client assume it's valid
            return res.status(200).json({
                analysis: content,
                stats: {
                    cached: true,
                    lastUpdated: stats.mtime.toISOString()
                }
            })
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

        // 3. Fetch ALL Data (No limits)
        // We will fetch everything but select only necessary fields to reduce DB load
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

        // Calculate aggregate stats
        const totalEntries = timeEntries.length
        const totalHours = timeEntries.reduce((sum, t) => sum + t.hours, 0)

        // Fetch related projects
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

        // 4. Data Compression for Prompt
        // Format: "YYYY-MM-DD|Title|Notes(Truncated)"
        // We try to fit as much as possible. 
        // If > 2000 entries, we might only send detailed recent 2000 and summaries for older.
        // For now, let's just dump ALL and rely on "Smart Compression" (truncate notes).

        const recentWork = timeEntries.map(t => {
            const title = t.ticket?.summary || t.project?.name || 'No Title'
            const cleanTitle = title.replace(/\|/g, '-').substring(0, 50) // No pipes, max 50 chars
            const cleanNotes = (t.notes || '').replace(/\s+/g, ' ').replace(/\|/g, '-').substring(0, 100)
            return `${formatDate(t.dateStart)}|${t.hours}|${cleanTitle}|${cleanNotes}`
        }).join('\n')

        const projectHistory = projects.map(p => {
            const role = p.managerIdentifier === memberIdentifier ? 'M' : 'C'
            return `${p.name}|${p.status}|${role}|${p.percentComplete}%`
        })

        // 5. Call OpenAI
        const client = new OpenAIClient(process.env.OPENAI_API_KEY)

        // Note: 'gpt-4o' has 128k context.
        // Each line is approx 150 chars ~ 40 tokens.
        // 3000 lines ~ 120k tokens. It MIGHT hit the limit if very large history.
        // But for now, we try.

        const analysis = await client.generateAnalysis('deepAssessment', {
            member,
            stats,
            recentWork, // Passed as a massive string block now
            projectHistory
        }, { model: 'gpt-4o' })

        // 6. Write to file
        fs.writeFileSync(filePath, analysis)

        res.status(200).json({
            analysis,
            stats: { ...stats, cached: false, lastUpdated: stats.analyzedAt }
        })

    } catch (error: any) {
        console.error('Error generating analysis:', error)
        res.status(500).json({ error: error.message || 'Failed to generate analysis' })
    }
}
