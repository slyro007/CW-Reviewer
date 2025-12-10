import { create } from 'zustand'
import type { Member } from '@/types'
import { api } from '@/lib/api'

// Only these 7 engineers should appear in the app (case-insensitive matching)
const ALLOWED_MEMBER_IDENTIFIERS = [
  'bwolff',    // Bryan Wolff
  'kmoreno',   // Kevin Moreno
  'scano',     // Shyanne Johnson-Cano
  'pcounts',   // Philip Counts
  'ehammond',  // Ezekiel Hammond
  'dcooper',   // Daniel Cooper
  'dsolomon',  // Daniel Solomon
]

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
      const allMembers: Member[] = data.map((m: any) => ({
        id: m.id,
        identifier: m.identifier || '',
        firstName: m.firstName || '',
        lastName: m.lastName || '',
        email: m.email || m.emailAddress || '',
        inactiveFlag: m.inactiveFlag || false,
      }))
      
      // Filter to only include the allowed engineers (case-insensitive)
      const members = allMembers.filter(m => 
        ALLOWED_MEMBER_IDENTIFIERS.includes(m.identifier.toLowerCase())
      )
      
      console.log(`✅ Fetched ${allMembers.length} total members, filtered to ${members.length} allowed engineers:`)
      members.forEach(m => console.log(`   - ${m.firstName} ${m.lastName} (${m.identifier})`))
      
      set({ members, isLoading: false })
    } catch (error: any) {
      console.error('Error fetching members:', error)
      set({ error: error.message || 'Failed to fetch members', isLoading: false })
    }
  },
}))

