import { create } from 'zustand'
import type { Member } from '@/types'

interface MembersState {
  members: Member[]
  selectedMembers: number[] // For comparison feature
  isLoading: boolean
  error: string | null
  setMembers: (members: Member[]) => void
  addMember: (member: Member) => void
  updateMember: (id: number, updates: Partial<Member>) => void
  toggleMemberSelection: (memberId: number) => void
  clearSelection: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useMembersStore = create<MembersState>((set) => ({
  members: [],
  selectedMembers: [],
  isLoading: false,
  error: null,
  setMembers: (members) => set({ members }),
  addMember: (member) => set((state) => ({
    members: [...state.members, member]
  })),
  updateMember: (id, updates) => set((state) => ({
    members: state.members.map(m => m.id === id ? { ...m, ...updates } : m)
  })),
  toggleMemberSelection: (memberId) => set((state) => ({
    selectedMembers: state.selectedMembers.includes(memberId)
      ? state.selectedMembers.filter(id => id !== memberId)
      : [...state.selectedMembers, memberId]
  })),
  clearSelection: () => set({ selectedMembers: [] }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}))

