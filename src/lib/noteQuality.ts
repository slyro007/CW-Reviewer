/**
 * Note Quality Scoring
 * 
 * Multi-factor analysis of time entry notes to determine documentation quality.
 * Considers completeness, context, actionability, and length.
 */

export interface NoteQualityScore {
  overall: number          // 0-100 overall score
  completeness: number     // 0-100: Has problem + resolution
  context: number          // 0-100: References ticket/client/systems
  actionability: number    // 0-100: Contains action verbs
  length: number           // 0-100: Adequate detail
  rating: 'excellent' | 'good' | 'fair' | 'poor'
  suggestions: string[]
}

// Action verbs indicating work done
const ACTION_VERBS = [
  'installed', 'configured', 'resolved', 'fixed', 'updated', 'created',
  'troubleshoot', 'reviewed', 'tested', 'deployed', 'migrated', 'upgraded',
  'enabled', 'disabled', 'removed', 'added', 'modified', 'set up', 'setup',
  'diagnosed', 'investigated', 'analyzed', 'documented', 'verified', 'confirmed',
  'restored', 'recovered', 'backed up', 'backup', 'cleaned', 'optimized',
  'patched', 'rebooted', 'restarted', 'reset', 'cleared', 'replaced',
  'connected', 'disconnected', 'synced', 'imported', 'exported', 'mapped',
  'escalated', 'assigned', 'transferred', 'completed', 'closed', 'followed up',
]

// Problem indicators
const PROBLEM_INDICATORS = [
  'issue', 'problem', 'error', 'unable', 'cannot', 'can\'t', 'won\'t',
  'not working', 'failed', 'failure', 'broken', 'down', 'slow', 'crash',
  'reported', 'complained', 'requested', 'asking', 'needed', 'required',
  'user reported', 'client reported', 'customer reported',
]

// Resolution indicators
const RESOLUTION_INDICATORS = [
  'resolved', 'fixed', 'completed', 'working', 'restored', 'recovered',
  'issue resolved', 'problem solved', 'now working', 'back up', 'back online',
  'successfully', 'confirmed working', 'tested and working', 'verified',
]

// Context indicators (technical/specific)
const CONTEXT_INDICATORS = [
  'ticket', 'user', 'client', 'customer', 'server', 'workstation', 'laptop',
  'desktop', 'printer', 'network', 'firewall', 'switch', 'router', 'vpn',
  'email', 'outlook', 'office', 'microsoft', 'windows', 'mac', 'apple',
  'backup', 'antivirus', 'security', 'password', 'account', 'permission',
  'database', 'sql', 'application', 'software', 'hardware', 'drive',
]

/**
 * Calculate note quality score
 */
export function calculateNoteQuality(
  note: string | null | undefined,
  ticketSummary?: string | null
): NoteQualityScore {
  const suggestions: string[] = []
  
  if (!note || note.trim().length === 0) {
    return {
      overall: 0,
      completeness: 0,
      context: 0,
      actionability: 0,
      length: 0,
      rating: 'poor',
      suggestions: ['Add notes to document what work was done'],
    }
  }

  const noteLower = note.toLowerCase()
  const noteLength = note.trim().length

  // 1. Length Score (20% weight)
  let lengthScore = 0
  if (noteLength >= 200) {
    lengthScore = 100
  } else if (noteLength >= 100) {
    lengthScore = 80
  } else if (noteLength >= 50) {
    lengthScore = 60
  } else if (noteLength >= 30) {
    lengthScore = 40
  } else if (noteLength >= 10) {
    lengthScore = 20
  }
  
  if (noteLength < 50) {
    suggestions.push('Add more detail to your notes (aim for 50+ characters)')
  }

  // 2. Actionability Score (25% weight)
  const actionCount = ACTION_VERBS.filter(verb => noteLower.includes(verb)).length
  let actionabilityScore = Math.min(100, actionCount * 25)
  
  if (actionCount === 0) {
    suggestions.push('Include action verbs describing what was done (e.g., installed, configured, resolved)')
  }

  // 3. Completeness Score (30% weight)
  const hasProblem = PROBLEM_INDICATORS.some(p => noteLower.includes(p))
  const hasResolution = RESOLUTION_INDICATORS.some(r => noteLower.includes(r))
  
  let completenessScore = 0
  if (hasProblem && hasResolution) {
    completenessScore = 100
  } else if (hasProblem || hasResolution) {
    completenessScore = 50
  } else if (actionCount > 0) {
    completenessScore = 30
  }
  
  if (!hasProblem) {
    suggestions.push('Describe the issue/request that was addressed')
  }
  if (!hasResolution) {
    suggestions.push('Document the resolution or outcome')
  }

  // 4. Context Score (25% weight)
  const contextCount = CONTEXT_INDICATORS.filter(c => noteLower.includes(c)).length
  let contextScore = Math.min(100, contextCount * 20)
  
  // Bonus for referencing ticket summary context
  if (ticketSummary) {
    const summaryWords = ticketSummary.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    const matchingWords = summaryWords.filter(w => noteLower.includes(w))
    if (matchingWords.length > 0) {
      contextScore = Math.min(100, contextScore + matchingWords.length * 10)
    }
  }
  
  if (contextCount === 0) {
    suggestions.push('Reference specific systems, users, or technical details')
  }

  // Calculate overall score with weights
  const overall = Math.round(
    (lengthScore * 0.20) +
    (actionabilityScore * 0.25) +
    (completenessScore * 0.30) +
    (contextScore * 0.25)
  )

  // Determine rating
  let rating: 'excellent' | 'good' | 'fair' | 'poor'
  if (overall >= 80) {
    rating = 'excellent'
  } else if (overall >= 60) {
    rating = 'good'
  } else if (overall >= 40) {
    rating = 'fair'
  } else {
    rating = 'poor'
  }

  return {
    overall,
    completeness: completenessScore,
    context: contextScore,
    actionability: actionabilityScore,
    length: lengthScore,
    rating,
    suggestions: suggestions.slice(0, 3), // Max 3 suggestions
  }
}

/**
 * Calculate average note quality for a collection of entries
 */
export function calculateAverageNoteQuality(
  entries: Array<{ notes?: string | null; ticketSummary?: string | null }>
): NoteQualityScore & { entriesWithNotes: number; totalEntries: number } {
  const entriesWithNotes = entries.filter(e => e.notes && e.notes.trim().length > 0)
  
  if (entriesWithNotes.length === 0) {
    return {
      overall: 0,
      completeness: 0,
      context: 0,
      actionability: 0,
      length: 0,
      rating: 'poor',
      suggestions: ['Start adding notes to your time entries'],
      entriesWithNotes: 0,
      totalEntries: entries.length,
    }
  }

  const scores = entriesWithNotes.map(e => 
    calculateNoteQuality(e.notes, e.ticketSummary)
  )

  const avgOverall = Math.round(scores.reduce((sum, s) => sum + s.overall, 0) / scores.length)
  const avgCompleteness = Math.round(scores.reduce((sum, s) => sum + s.completeness, 0) / scores.length)
  const avgContext = Math.round(scores.reduce((sum, s) => sum + s.context, 0) / scores.length)
  const avgActionability = Math.round(scores.reduce((sum, s) => sum + s.actionability, 0) / scores.length)
  const avgLength = Math.round(scores.reduce((sum, s) => sum + s.length, 0) / scores.length)

  // Determine rating
  let rating: 'excellent' | 'good' | 'fair' | 'poor'
  if (avgOverall >= 80) {
    rating = 'excellent'
  } else if (avgOverall >= 60) {
    rating = 'good'
  } else if (avgOverall >= 40) {
    rating = 'fair'
  } else {
    rating = 'poor'
  }

  // Aggregate suggestions
  const allSuggestions = scores.flatMap(s => s.suggestions)
  const suggestionCounts = allSuggestions.reduce((acc, s) => {
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  
  const topSuggestions = Object.entries(suggestionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([suggestion]) => suggestion)

  // Add coverage suggestion if needed
  const coveragePercent = (entriesWithNotes.length / entries.length) * 100
  if (coveragePercent < 80) {
    topSuggestions.unshift(`Improve notes coverage (currently ${coveragePercent.toFixed(0)}%)`)
  }

  return {
    overall: avgOverall,
    completeness: avgCompleteness,
    context: avgContext,
    actionability: avgActionability,
    length: avgLength,
    rating,
    suggestions: topSuggestions.slice(0, 3),
    entriesWithNotes: entriesWithNotes.length,
    totalEntries: entries.length,
  }
}

/**
 * Get color classes for a quality rating
 */
export function getQualityColor(rating: 'excellent' | 'good' | 'fair' | 'poor'): {
  bg: string
  text: string
  border: string
} {
  switch (rating) {
    case 'excellent':
      return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500' }
    case 'good':
      return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500' }
    case 'fair':
      return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500' }
    case 'poor':
      return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500' }
  }
}

