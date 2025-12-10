import { create } from 'zustand'
import type { ReviewResult } from '@/types'

interface ReviewsState {
  reviews: ReviewResult[]
  isLoading: boolean
  error: string | null
  setReviews: (reviews: ReviewResult[]) => void
  addReview: (review: ReviewResult) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  getReviewByMember: (memberId: number, reviewType: ReviewResult['reviewType']) => ReviewResult | undefined
}

export const useReviewsStore = create<ReviewsState>((set, get) => ({
  reviews: [],
  isLoading: false,
  error: null,
  setReviews: (reviews) => set({ reviews }),
  addReview: (review) => set((state) => ({
    reviews: [...state.reviews, review]
  })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  getReviewByMember: (memberId, reviewType) => {
    return get().reviews.find(
      r => r.memberId === memberId && r.reviewType === reviewType
    )
  },
}))

