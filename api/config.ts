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

// Sync configuration
export const SYNC_STALE_THRESHOLD_MS = 60 * 60 * 1000 // 1 hour

// Incremental sync settings
export const SYNC_INCREMENTAL_FALLBACK = true // If incremental sync fails, fall back to full sync

