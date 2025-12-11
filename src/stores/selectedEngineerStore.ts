import { create } from 'zustand'

export const TEAM_DEFINITIONS = {
  'All Company': null, // null means all
  'Service Desk': ['dcooper', 'scano', 'kmoreno'],
  'Professional Services': ['ehammond', 'dsolomon'],
  'Professional Services + Management': ['bwolff', 'pcounts', 'ehammond', 'dsolomon'],
  'Management': ['bwolff', 'pcounts'],
  'Past Employees': [
    'CCorder', 'PErnst', 'JFlynn', 'BJSmith', 'sjalagam', 'ADay',
    'JAFlynn', 'JKnee', 'JVerchr', 'MJacobson', 'RPinto',
    'fflores', 'eMontgomery', 'ekorzeniewski', 'JBritt',
    'KRoberson', 'Gwalker'
  ]
}

export type TeamName = keyof typeof TEAM_DEFINITIONS

interface SelectedEngineerState {
  selectedEngineerId: number | null // null means "All Engineers"
  selectedTeam: TeamName
  setSelectedEngineer: (engineerId: number | null) => void
  setSelectedTeam: (team: TeamName) => void
}

export const useSelectedEngineerStore = create<SelectedEngineerState>((set) => ({
  selectedEngineerId: null, // Default to "All Engineers"
  selectedTeam: 'All Company',
  setSelectedEngineer: (engineerId) => set({ selectedEngineerId: engineerId }),
  setSelectedTeam: (team) => set({ selectedTeam: team }),
}))

