import { create } from 'zustand'

interface SelectedEngineerState {
  selectedEngineerId: number | null // null means "All Engineers"
  setSelectedEngineer: (engineerId: number | null) => void
}

export const useSelectedEngineerStore = create<SelectedEngineerState>((set) => ({
  selectedEngineerId: null, // Default to "All Engineers"
  setSelectedEngineer: (engineerId) => set({ selectedEngineerId: engineerId }),
}))

