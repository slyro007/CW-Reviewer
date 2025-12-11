/**
 * Shared Configuration
 * 
 * Configuration values used by API routes
 */

// Active Team Members
export const ACTIVE_ENGINEERS = [
  'bwolff',    // Bryan Wolff
  'kmoreno',   // Kevin Moreno
  'scano',     // Shyanne Johnson-Cano
  'pcounts',   // Philip Counts
  'ehammond',  // Ezekiel Hammond
  'dcooper',   // Daniel Cooper
  'dsolomon',  // Daniel Solomon
]

// Inactive/Former Members (for historical data)
export const INACTIVE_ENGINEERS: { identifier: string; name: string; startDate: string; endDate: string }[] = [
  { identifier: 'CCorder', name: 'Cheyanne Corder', startDate: '2023-08-26', endDate: '2025-12-05' },
  { identifier: 'PErnst', name: 'Phillip Ernst', startDate: '2022-11-15', endDate: '2025-10-06' },
  { identifier: 'JFlynn', name: 'Joy Flynn', startDate: '2019-07-16', endDate: '2025-09-16' },
  { identifier: 'BJSmith', name: 'Brent Smith', startDate: '2015-09-04', endDate: '2025-09-03' },
  { identifier: 'sjalagam', name: 'Srujan Jalagam', startDate: '2025-05-27', endDate: '2025-07-18' },
  { identifier: 'ADay', name: 'Austin Day', startDate: '2024-11-18', endDate: '2025-04-03' },
  { identifier: 'JAFlynn', name: 'Jason Flynn', startDate: '2021-04-19', endDate: '2022-09-09' },
  { identifier: 'JKnee', name: 'Jeremy Knee', startDate: '2021-09-13', endDate: '2022-07-01' },
  { identifier: 'JVerchr', name: 'Jonothon Vercher', startDate: '2020-05-18', endDate: '2022-02-22' },
  { identifier: 'MJacobson', name: 'Margaret Jacobson', startDate: '2021-08-02', endDate: '2022-01-28' },
  { identifier: 'RPinto', name: 'Ryan Pinto', startDate: '2019-08-05', endDate: '2021-10-14' },
  { identifier: 'fflores', name: 'Frank Flores', startDate: '2021-02-01', endDate: '2021-10-15' },
  { identifier: 'eMontgomery', name: 'Ethan Montgomery', startDate: '2021-05-27', endDate: '2021-12-08' },
  { identifier: 'ekorzeniewski', name: 'Erin Korzeniewski', startDate: '2020-09-08', endDate: '2021-05-28' },
  { identifier: 'JBritt', name: 'John Britt', startDate: '2018-05-21', endDate: '2019-07-23' },
  { identifier: 'KRoberson', name: 'Kyle Roberson', startDate: '2022-10-03', endDate: '2024-08-16' },
  { identifier: 'Gwalker', name: 'Gloria Walker', startDate: '2024-01-29', endDate: '2024-04-18' },
  // Adding others from the "inactive employees" list provided by user if identifiers match
]

// Combined list for Sync filtering
export const ALLOWED_ENGINEER_IDENTIFIERS = [
  ...ACTIVE_ENGINEERS,
  ...INACTIVE_ENGINEERS.map(e => e.identifier)
]

// Service board names to sync
export const SERVICE_BOARD_NAMES = [
  'Escalations(MS)',
  'HelpDesk (MS)',
  'HelpDesk (TS)',
  'Triage',
  'RMM-Continuum',
  'WL Internal',
]

// Sync configuration - STRICT LIMITS to avoid network transfer overages
export const SYNC_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000 // 24 hours - only sync once per day

// Incremental sync settings
export const SYNC_INCREMENTAL_FALLBACK = false // DISABLED - do not fall back to full sync to save bandwidth

// Maximum sync frequency - prevent accidental over-syncing
export const MINIMUM_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours minimum between syncs

// Cache TTL for foundational/structural data - rarely changes
export const BOARD_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days - boards rarely change
export const MEMBER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days - engineer list is stable

// Enable/disable foundational data caching
export const ENABLE_FOUNDATIONAL_CACHE = true // Set to false to always fetch boards/members

