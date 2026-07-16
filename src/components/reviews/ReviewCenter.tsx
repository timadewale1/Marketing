"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { ChevronLeft, ChevronRight, MessageSquareHeart, Star } from "lucide-react"
import toast from "react-hot-toast"
import { auth } from "@/lib/firebase"

type ReviewRole = "earner" | "advertiser" | "vendor" | "customer"

type ReviewPrompt = {
  id: string
  userId: string
  role: ReviewRole
  targetType: string
  targetId: string
  targetName: string
  sourceId: string
  sourceLabel: string
  message: string
}

type ReviewItem = {
  id: string
  authorName?: string
  role?: string
  rating?: number
  comment?: string
  targetName?: string
  createdAt?: unknown
}

const starOptions = [1, 2, 3, 4, 5]

function getSessionDismissKey(promptId: string) {
  return `pamba-review-dismissed-${promptId}`
}

function getFallbackPrompt(role: ReviewRole): ReviewPrompt {
  const roleLabel = role === "vendor" ? "vendor" : role === "advertiser" ? "advertiser" : role === "customer" ? "customer" : "earner"
  const targetLabel = role === "vendor" ? "your vendor experience" : role === "advertiser" ? "your advertiser experience" : role === "customer" ? "your customer experience" : "your earner experience"
  return {
    id: `fallback-${role}`,
    userId: "",
    role,
    targetType: "campaign",
    targetId: `platform-${role}`,
    targetName: `Pamba ${roleLabel} experience`,
    sourceId: `${role}-dashboard`,
    sourceLabel: `${roleLabel.charAt(0).toUpperCase()}${roleLabel.slice(1)} dashboard`,
    message: `Tell us how ${targetLabel} on Pamba is going.`,
  }
}

function ReviewStars({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {starOptions.map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className={`rounded-full p-1 transition ${star <= value ? "text-amber-500" : "text-stone-300 hover:text-stone-400"}`}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
        >
          <Star className="h-5 w-5 fill-current" />
        </button>
      ))}
    </div>
  )
}

export default function ReviewCenter({ role }: { role: ReviewRole }) {
  const [prompts, setPrompts] = useState<ReviewPrompt[]>([])
  const [reviews, setReviews] = useState<ReviewItem[]>([])
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [promptIndex, setPromptIndex] = useState(0)
  const [reviewIndex, setReviewIndex] = useState(0)
  const [mounted, setMounted] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const fallbackPrompt = useMemo(() => getFallbackPrompt(role), [role])
  const activePrompt = useMemo(() => {
    if (prompts[promptIndex]) return prompts[promptIndex]
    if (dialogOpen) return fallbackPrompt
    return null
  }, [prompts, promptIndex, dialogOpen, fallbackPrompt])

  useEffect(() => {
    setMounted(true)
    const load = async () => {
      const user = auth.currentUser
      if (!user) return
      const idToken = await user.getIdToken()
      const [pendingRes, feedRes] = await Promise.all([
        fetch(`/api/reviews?mode=pending&role=${encodeURIComponent(role)}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
        fetch("/api/reviews?mode=feed&limit=8"),
      ])

      const pendingData = await pendingRes.json().catch(() => ({}))
      const feedData = await feedRes.json().catch(() => ({}))
      if (pendingRes.ok && pendingData?.prompts) {
        setPrompts(pendingData.prompts as ReviewPrompt[])
      }
      if (feedRes.ok && feedData?.reviews) {
        setReviews(feedData.reviews as ReviewItem[])
      }
    }

    void load().catch((error) => console.error("[reviews] load failed", error))
  }, [role])

  useEffect(() => {
    if (!prompts.length) return
    const timer = window.setInterval(() => {
      setPromptIndex((current) => (current + 1) % prompts.length)
    }, 7000)
    return () => window.clearInterval(timer)
  }, [prompts.length])

  useEffect(() => {
    if (!reviews.length) return
    const timer = window.setInterval(() => {
      setReviewIndex((current) => (current + 1) % reviews.length)
    }, 7000)
    return () => window.clearInterval(timer)
  }, [reviews.length])

  useEffect(() => {
    if (!activePrompt || !mounted) return
    try {
      if (window.sessionStorage.getItem(getSessionDismissKey(activePrompt.id))) return
    } catch {
      // ignore storage issues
    }
  }, [activePrompt, mounted])

  const closePrompt = () => {
    if (!activePrompt) return
    try {
      window.sessionStorage.setItem(getSessionDismissKey(activePrompt.id), "1")
    } catch {
      // ignore
    }
    if (prompts.some((prompt) => prompt.id === activePrompt.id)) {
      setPrompts((current) => current.filter((prompt) => prompt.id !== activePrompt.id))
    }
    setPromptIndex(0)
    setDialogOpen(false)
  }

  const submitReview = async () => {
    if (!activePrompt) return
    const user = auth.currentUser
    if (!user) {
      toast.error("Please sign in again")
      return
    }
    if (!comment.trim()) {
      toast.error("Please add a short note")
      return
    }

    setSubmitting(true)
    try {
      const idToken = await user.getIdToken()
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          rating,
          comment,
          targetType: activePrompt.targetType,
          targetId: activePrompt.targetId,
          targetName: activePrompt.targetName,
          sourceId: activePrompt.sourceId,
          sourceLabel: activePrompt.sourceLabel,
          promptId: activePrompt.id,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "Failed to submit review")
      }
      toast.success("Thanks for your review")
      setComment("")
      setRating(5)
      if (prompts.some((prompt) => prompt.id === activePrompt.id)) {
        setPrompts((current) => current.filter((prompt) => prompt.id !== activePrompt.id))
      }
      setDialogOpen(false)
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Failed to submit review")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <Dialog open={Boolean(activePrompt)} onOpenChange={(open) => {
        if (!open) {
          closePrompt()
        } else {
          setDialogOpen(true)
        }
      }}>
        <DialogContent className="max-w-xl rounded-[28px] border-stone-200 bg-white p-0">
          <div className="bg-gradient-to-r from-amber-50 via-white to-cyan-50 px-6 py-5">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-stone-900">Leave a quick review</DialogTitle>
              <DialogDescription className="text-sm text-stone-600">
                {activePrompt?.message || "Tell us how this experience went."}
              </DialogDescription>
            </DialogHeader>
          </div>
          <CardContent className="space-y-4 p-6">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">About</p>
              <p className="mt-1 text-sm font-medium text-stone-900">{activePrompt?.sourceLabel}</p>
              <p className="mt-1 text-xs text-stone-500">Reviewing: {activePrompt?.targetName}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-stone-800">Your rating</p>
              <ReviewStars value={rating} onChange={setRating} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-stone-800">What would you like to say?</p>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share a short note about the experience"
                className="min-h-[120px] rounded-2xl"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={submitReview} disabled={submitting} className="rounded-full bg-amber-600 hover:bg-amber-500">
                <MessageSquareHeart className="mr-2 h-4 w-4" />
                {submitting ? "Saving..." : "Submit review"}
              </Button>
              <Button variant="outline" className="rounded-full" onClick={closePrompt}>
                Maybe later
              </Button>
            </div>
          </CardContent>
        </DialogContent>
      </Dialog>

      <Card className="rounded-[28px] border-stone-200 bg-white/90 shadow-sm">
        <CardContent className="p-5 md:p-6">
          <div className="rounded-[24px] border border-amber-200 bg-gradient-to-r from-amber-100 via-white to-cyan-50 p-4 md:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">Share your feedback</p>
                <h3 className="mt-1 text-lg font-semibold text-stone-900">Leave a review anytime</h3>
                <p className="mt-1 text-sm text-stone-600">Tell us how your experience went, even if you did not get a prompt first.</p>
              </div>
              <Button
                className="rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-500"
                onClick={() => {
                  setPromptIndex(0)
                  setDialogOpen(true)
                }}
              >
                <MessageSquareHeart className="mr-2 h-4 w-4" />
                Leave a review
              </Button>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-500">Community voices</p>
              <h3 className="mt-1 text-lg font-semibold text-stone-900">Recent reviews</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                onClick={() => reviews.length ? setReviewIndex((current) => (current - 1 + reviews.length) % reviews.length) : undefined}
                disabled={reviews.length === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                onClick={() => reviews.length ? setReviewIndex((current) => (current + 1) % reviews.length) : undefined}
                disabled={reviews.length === 0}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-3xl border border-stone-100 bg-gradient-to-br from-amber-50/70 to-cyan-50/60 p-5">
            {reviews.length ? (
              <div className="transition-all">
                {reviews.map((review, index) => (
                  <div
                    key={review.id}
                    className={index === reviewIndex ? "block" : "hidden"}
                  >
                    <div className="flex items-center gap-2 text-amber-500">
                      {Array.from({ length: Math.max(1, Math.min(5, Number(review.rating || 0))) }).map((_, starIndex) => (
                        <Star key={starIndex} className="h-4 w-4 fill-current" />
                      ))}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-stone-700">{review.comment || "No comment provided."}</p>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-stone-900">{review.authorName || "User"}</p>
                        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">{String(review.role || "").toUpperCase()}</p>
                      </div>
                      <p className="text-xs text-stone-500">{review.targetName || "Platform"}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
