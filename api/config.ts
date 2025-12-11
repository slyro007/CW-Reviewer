/**
 * Shared Configuration
 * 
 * Configuration values used by API routes
 */

// Only these 7 engineers should have data synced (case-insensitive)
export const ALLOWED_ENGINEER_IDENTIFIERS = [
  'bwolff',    // Bryan Wolff
  'kmoreno',   // Kevin Moreno
  'scano',     // Shyanne Johnson-Cano
  'pcounts',   // Philip Counts
  'ehammond',  // Ezekiel Hammond
  'dcooper',   // Daniel Cooper
  'dsolomon',  // Daniel Solomon
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

