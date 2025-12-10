/**
 * OpenAI API Integration
 * 
 * Extensible prompt system for various analysis types:
 * - Time entry analysis (notes quality, tracking accuracy)
 * - Quarterly summaries
 * - CW Wrapped generation
 * - MSP standards review (future-ready)
 * - Engineer comparison analysis (future-ready)
 */

interface PromptTemplate {
  name: string
  systemPrompt: string
  userPrompt: (data: any) => string
}

const PROMPT_TEMPLATES: Record<string, PromptTemplate> = {
  timeEntryAnalysis: {
    name: 'timeEntryAnalysis',
    systemPrompt: `You are an expert at analyzing time tracking entries for MSP (Managed Service Provider) engineers. 
    Analyze time entries for quality of notes, tracking accuracy, and adherence to best practices.
    Provide specific, actionable feedback.`,
    userPrompt: (data: { entries: any[]; member: any }) => {
      return `Analyze the following time entries for engineer ${data.member.firstName} ${data.member.lastName}:
      
      ${JSON.stringify(data.entries, null, 2)}
      
      Evaluate:
      1. Quality of notes (detail, context, clarity)
      2. Time tracking accuracy
      3. Billability appropriateness
      4. Areas for improvement
      
      Provide a structured analysis.`
    },
  },
  quarterlySummary: {
    name: 'quarterlySummary',
    systemPrompt: `You are an expert at creating comprehensive quarterly summaries for MSP engineers.
    Summarize their work, achievements, and areas for improvement in a clear, professional format.`,
    userPrompt: (data: { entries: any[]; tickets: any[]; member: any; period: { start: Date; end: Date } }) => {
      return `Create a quarterly summary for engineer ${data.member.firstName} ${data.member.lastName}
      for the period ${data.period.start.toISOString()} to ${data.period.end.toISOString()}.
      
      Time Entries: ${data.entries.length}
      Tickets Worked: ${data.tickets.length}
      
      Provide:
      1. Overview of work completed
      2. Key achievements
      3. Productivity metrics
      4. Areas for improvement
      5. Recommendations`
    },
  },
  cwWrapped: {
    name: 'cwWrapped',
    systemPrompt: `You are creating a fun, engaging annual summary similar to Spotify Wrapped.
    Make it visually appealing with emojis and celebrate the engineer's achievements.`,
    userPrompt: (data: { member: any; stats: any; year: number }) => {
      return `Create a CW Wrapped summary for ${data.member.firstName} ${data.member.lastName} for ${data.year}:
      
      ${JSON.stringify(data.stats, null, 2)}
      
      Make it fun, engaging, and celebratory!`
    },
  },
  mspStandardsReview: {
    name: 'mspStandardsReview',
    systemPrompt: `You are an expert at reviewing MSP engineer performance against industry standards.
    Evaluate time tracking, notes quality, billability, and productivity.
    Provide scores (0-100) and detailed recommendations.`,
    userPrompt: (data: { member: any; entries: any[]; tickets: any[]; period: { start: Date; end: Date } }) => {
      return `Review engineer ${data.member.firstName} ${data.member.lastName} against MSP standards
      for the period ${data.period.start.toISOString()} to ${data.period.end.toISOString()}.
      
      Provide scores and recommendations for:
      1. Time Tracking Quality
      2. Notes Quality
      3. Billability
      4. Productivity
      5. Overall Performance`
    },
  },
  engineerComparison: {
    name: 'engineerComparison',
    systemPrompt: `You are an expert at comparing multiple engineers' performance.
    Provide objective, fair comparisons highlighting strengths and differences.`,
    userPrompt: (data: { members: any[]; comparisonData: any }) => {
      return `Compare the following engineers:
      
      ${JSON.stringify(data.members, null, 2)}
      
      Comparison Data:
      ${JSON.stringify(data.comparisonData, null, 2)}
      
      Provide insights on similarities, differences, and recommendations.`
    },
  },
}

class OpenAIClient {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async generateAnalysis(
    templateName: string,
    data: any,
    options: { model?: string; temperature?: number } = {}
  ): Promise<string> {
    const template = PROMPT_TEMPLATES[templateName]
    if (!template) {
      throw new Error(`Template ${templateName} not found`)
    }

    const { model = 'gpt-4', temperature = 0.7 } = options

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: template.systemPrompt },
          { role: 'user', content: template.userPrompt(data) },
        ],
        temperature,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`)
    }

    const result = await response.json()
    return result.choices[0]?.message?.content || ''
  }

  /**
   * Add a new prompt template (for future extensibility)
   */
  static addTemplate(name: string, template: PromptTemplate): void {
    PROMPT_TEMPLATES[name] = template
  }
}

export default OpenAIClient
export { PROMPT_TEMPLATES }

