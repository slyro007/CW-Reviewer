// Time Entry types
export interface TimeEntry {
  id: number
  memberId: number
  ticketId?: number
  hours: number
  billableOption?: string
  notes?: string
  dateStart: Date
  dateEnd?: Date
  internalNotes?: string
  // Quality metrics (computed)
  notesQuality?: NotesQuality
  trackingAccuracy?: number
}

export interface NotesQuality {
  hasNotes: boolean
  noteLength: number
  hasDetails: boolean
  hasContext: boolean
  score: number // 0-100
}

// Member/Engineer types
export interface Member {
  id: number
  identifier: string
  firstName?: string
  lastName?: string
  email?: string
  inactiveFlag: boolean
  // Comparison-friendly fields
  totalHours?: number
  billableHours?: number
  averageHoursPerDay?: number
}

// Ticket types
export interface Ticket {
  id: number
  summary?: string
  boardId: number
  status?: string
  closedDate?: Date
  closedFlag: boolean
  dateEntered?: Date
  resolvedDate?: Date
  resolutionTime?: number // in hours
  // Additional project fields
  type?: string // Project type/category
  priority?: string
  owner?: string // Owner identifier
  company?: string // Client/company name
  estimatedHours?: number
  actualHours?: number
}

// Board types
export interface Board {
  id: number
  name: string
  type: 'MS' | 'PS'
}

// Trend data types
export interface TrendData {
  date: Date
  hours: number
  billableHours: number
  ticketCount: number
  averageResolutionTime?: number
}

export interface TrendSeries {
  memberId: number
  memberName: string
  data: TrendData[]
}

// Comparison types
export interface ComparisonResult {
  members: Member[]
  periodStart: Date
  periodEnd: Date
  metrics: {
    totalHours: Record<number, number>
    billableHours: Record<number, number>
    averageHoursPerDay: Record<number, number>
    ticketCount: Record<number, number>
    notesQualityScore: Record<number, number>
  }
  insights: string[]
}

// Review types
export interface ReviewResult {
  id: string
  memberId: number
  reviewType: 'msp_standards' | 'quarterly' | 'annual'
  periodStart: Date
  periodEnd: Date
  summary: string
  details: ReviewDetails
  score?: number
}

export interface ReviewDetails {
  timeTracking: {
    score: number
    issues: string[]
    recommendations: string[]
  }
  notesQuality: {
    score: number
    issues: string[]
    recommendations: string[]
  }
  billability: {
    score: number
    billablePercentage: number
    issues: string[]
    recommendations: string[]
  }
  productivity: {
    score: number
    ticketsResolved: number
    averageResolutionTime: number
    issues: string[]
    recommendations: string[]
  }
  overallScore: number
}

