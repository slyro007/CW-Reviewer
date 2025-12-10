import { create } from 'zustand'
import type { Member } from '@/types'
import { api } from '@/lib/api'

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
  fetchMembers: () => Promise<void>
}

export const useMembersStore = create<MembersState>((set, get) => ({
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
  fetchMembers: async () => {
    const { isLoading } = get()
    if (isLoading) return // Prevent duplicate fetches
    
    set({ isLoading: true, error: null })
    try {
      const data = await api.getMembers()
      
      // Transform API response to Member type
      const members: Member[] = data.map((m: any) => ({
        id: m.id,
        identifier: m.identifier || '',
        firstName: m.firstName || '',
        lastName: m.lastName || '',
        email: m.email || m.emailAddress || '',
        inactiveFlag: m.inactiveFlag || false,
      }))
      
      set({ members, isLoading: false })
      
      // Test: Check if "dsolomon" exists
      const dsolomon = members.find(m => 
        m.identifier?.toLowerCase().includes('dsolomon') ||
        m.firstName?.toLowerCase().includes('dsolomon') ||
        m.lastName?.toLowerCase().includes('dsolomon') ||
        m.email?.toLowerCase().includes('dsolomon')
      )
      
      if (dsolomon) {
        console.log('✅ Found dsolomon:', dsolomon)
      } else {
        console.log('⚠️ dsolomon not found. Available members:', members.map(m => ({
          identifier: m.identifier,
          name: `${m.firstName} ${m.lastName}`,
          email: m.email
        })))
      }
    } catch (error: any) {
      console.error('Error fetching members:', error)
      set({ error: error.message || 'Failed to fetch members', isLoading: false })
    }
  },
}))

