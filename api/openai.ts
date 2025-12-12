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
    userPrompt: (data: { entries: any[]; tickets: any[]; member: any; period: { start: Date | string; end: Date | string } }) => {
      // Handle both Date objects and ISO strings (from JSON serialization)
      const startDate = data.period.start instanceof Date ? data.period.start : new Date(data.period.start)
      const endDate = data.period.end instanceof Date ? data.period.end : new Date(data.period.end)

      return `Create a quarterly summary for engineer ${data.member.firstName} ${data.member.lastName}
      for the period ${startDate.toISOString()} to ${endDate.toISOString()}.
      
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
    Make it visually appealing with emojis and celebrate the engineer's achievements.
    
    IMPORTANT: You must respond in valid JSON format matching this schema:
    {
      "title": "string (e.g., '2024 Unwrapped' or 'Q4 Review')",
      "opening": "string (Energetic intro paragraph)",
      "topAchievements": [
        { "emoji": "string", "text": "string (Short punchy achievement)" }
      ],
      "funStats": [
        { "label": "string", "value": "string", "comment": "string (Witty remark)" }
      ],
      "closing": "string (Motivational outro)"
    }`,
    userPrompt: (data: { member: any; stats: any; year: number }) => {
      return `Create a CW Wrapped summary for ${data.member.firstName} ${data.member.lastName} for ${data.year}.
      
      Stats:
      ${JSON.stringify(data.stats, null, 2)}
      
      Return valid JSON.`
    },
  },
  mspStandardsReview: {
    name: 'mspStandardsReview',
    systemPrompt: `You are an expert at reviewing MSP engineer performance against industry standards.
    Evaluate time tracking, notes quality, billability, and productivity.
    
    IMPORTANT: You must respond in valid JSON format matching this schema:
    {
      "summary": "markdown string",
      "scores": {
        "timeTracking": number (0-100),
        "notesQuality": number (0-100),
        "billability": number (0-100),
        "productivity": number (0-100),
        "overall": number (0-100)
      },
      "strengths": ["string"],
      "weaknesses": ["string"],
      "recommendations": ["string"],
      "actionPlan": [
        { "step": "string", "priority": "High|Medium|Low" }
      ]
    }`,
    userPrompt: (data: { member: any; entries: any[]; tickets: any[]; period: { start: Date | string; end: Date | string } }) => {
      // Handle both Date objects and ISO strings (from JSON serialization)
      const startDate = data.period.start instanceof Date ? data.period.start : new Date(data.period.start)
      const endDate = data.period.end instanceof Date ? data.period.end : new Date(data.period.end)

      return `Review engineer ${data.member.firstName} ${data.member.lastName} against MSP standards
      for the period ${startDate.toISOString()} to ${endDate.toISOString()}.
      
      Time Entries: ${data.entries.length}
      Tickets Worked: ${data.tickets.length}
      
      Return valid JSON.`
    },
  },
  engineerComparison: {
    name: 'engineerComparison',
    systemPrompt: `You are an expert at comparing multiple engineers' performance.
    Provide objective, fair comparisons highlighting strengths and differences.
    
    IMPORTANT: You must respond in valid JSON format matching this schema:
    {
      "summary": "markdown string (Executive summary of the comparison)",
      "comparisonPoints": [
        { "category": "string (e.g. Activity, Efficiency, Quality)", "observation": "string", "advantage": "string (Name of engineer with advantage, or 'Neutral')" }
      ],
      "recommendations": ["string"]
    }`,
    userPrompt: (data: { members: any[]; comparisonData: any }) => {
      return `Compare the following engineers:
      
      ${JSON.stringify(data.members, null, 2)}
      
      Comparison Data:
      ${JSON.stringify(data.comparisonData, null, 2)}
      
      Return valid JSON.`
    },
  },
  engineerAnalysis: {
    name: 'engineerAnalysis',
    systemPrompt: `You are an expert MSP (Managed Service Provider) performance analyst. 
    You provide insightful, actionable analysis of engineer time tracking data.
    Be professional, constructive, and specific in your recommendations.
    Format your response with clear sections and bullet points.`,
    userPrompt: (data: { prompt: string; data: any }) => {
      return data.prompt
    },
  },
  deepAssessment: {
    name: 'deepAssessment',
    systemPrompt: `You are a CTO and Senior Engineering Manager conducting a deep, comprehensive assessment of an engineer's performance.
    Your goal is to provide a candid, professional, and actionable review based on their work history.
    
    Style Guide:
    - Tone: Professional, authoritative, yet constructive.
    - Format: Markdown with rich formatting (headers, bolding, lists).
    - Content: Highlight technical strengths, identifying patterns in debugging (via ticket notes), assessing communication skills, and pointing out potential burnout risks or efficiency gaps.`,
    userPrompt: (data: { member: any; stats: any; recentWork: any[]; projectHistory: any[] }) => {
      return `Analyze the following engineer profile for ${data.member.firstName} ${data.member.lastName}:
      
      ## Aggregate Stats
      ${JSON.stringify(data.stats, null, 2)}
      
      ## Recent Work Samples (Time Entries & Tickets)
      ${JSON.stringify(data.recentWork, null, 2)}
      
      ## Project History
      ${JSON.stringify(data.projectHistory, null, 2)}
      
      Produce a report including:
      1. **Executive Summary**: A high-level paragraph summarizing their standing.
      2. **Key Strengths**: Technical and soft skills evidenced by the data.
      3. **Areas for Improvement**: Specific flaws or gaps (e.g., vague notes, slow resolution).
      4. **Productivity Analysis**: Comment on their output volume and consistency.
      5. **Growth Recommendations**: What should they focus on next?`
    }
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
    options: { model?: string; temperature?: number; json?: boolean } = {}
  ): Promise<string> {
    const template = PROMPT_TEMPLATES[templateName]
    if (!template) {
      throw new Error(`Template ${templateName} not found`)
    }

    const { model = 'gpt-3.5-turbo-1106', temperature = 0.7, json = false } = options

    const body: any = {
      model,
      messages: [
        { role: 'system', content: template.systemPrompt },
        { role: 'user', content: template.userPrompt(data) },
      ],
      temperature,
    }

    if (json) {
      body.response_format = { type: 'json_object' }
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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

