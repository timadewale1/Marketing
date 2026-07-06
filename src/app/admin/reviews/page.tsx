"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, Trash2, Star } from "lucide-react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { AdminPageHeader, EmptyState, MetricCard, SectionCard, StatusBadge } from "@/app/admin/_components/admin-primitives"

type Review = {
  id: string
  authorName?: string
  role?: string
  rating?: number
  comment?: string
  targetName?: string
  sourceLabel?: string
  createdAt?: unknown
}

function formatDate(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate().toLocaleString()
  }
  return ""
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [role, setRole] = useState("all")

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set("search", search)
      if (role !== "all") params.set("role", role)
      const res = await fetch(`/api/admin/reviews?${params.toString()}`, { credentials: "include" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.message || "Failed to load reviews")
      setReviews(data.reviews || [])
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Failed to load reviews")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => reviews, [reviews])

  const remove = async (id: string) => {
    if (!confirm("Delete this review?")) return
    try {
      const res = await fetch("/api/admin/reviews", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.message || "Delete failed")
      toast.success("Review deleted")
      setReviews((current) => current.filter((review) => review.id !== id))
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Delete failed")
    }
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Reviews"
        title="Review management"
        description="See what users are saying across earners, advertisers, vendors, and customers."
        action={<Button className="rounded-full bg-stone-900 text-white" onClick={() => void load()}>Refresh</Button>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Reviews" value={reviews.length} hint="All loaded reviews" icon={Star} tone="amber" />
        <MetricCard label="Visible roles" value={new Set(reviews.map((review) => review.role)).size} hint="Across platform roles" icon={Search} tone="blue" />
        <MetricCard label="Current filter" value={role === "all" ? "All" : role} hint={search ? `Search: ${search}` : "No search term"} icon={Trash2} tone="emerald" />
      </div>

      <SectionCard title="Search and filters" description="Find reviews by name, text, or role.">
        <div className="grid gap-3 md:grid-cols-[1.5fr_0.5fr_auto]">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reviews" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="h-11 rounded-xl border border-stone-300 px-3 text-sm">
            <option value="all">All roles</option>
            <option value="earner">Earner</option>
            <option value="advertiser">Advertiser</option>
            <option value="vendor">Vendor</option>
            <option value="customer">Customer</option>
          </select>
          <Button className="rounded-full bg-amber-600 text-white" onClick={() => void load()}>
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>
        </div>
      </SectionCard>

      {loading ? (
        <SectionCard title="Loading reviews" description="Please wait while the latest reviews are loaded.">
          <p className="text-sm text-stone-600">Reviews are loading now.</p>
        </SectionCard>
      ) : filtered.length ? (
        <div className="grid gap-4">
          {filtered.map((review) => (
            <Card key={review.id} className="rounded-[24px] border-stone-200 bg-white">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-stone-900">{review.authorName || "User"}</p>
                    <p className="text-sm text-stone-500">{String(review.role || "").toUpperCase()} • {review.targetName || "Platform"}</p>
                    <p className="mt-2 text-sm leading-6 text-stone-700">{review.comment || "No comment"}</p>
                    <p className="mt-2 text-xs text-stone-500">{review.sourceLabel || ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      tone="amber"
                      label={`${Number(review.rating || 0)} star${Number(review.rating || 0) === 1 ? "" : "s"}`}
                    />
                    <Button variant="outline" className="rounded-full border-rose-200 text-rose-700" onClick={() => void remove(review.id)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>
                <p className="mt-4 text-xs uppercase tracking-[0.24em] text-stone-500">{formatDate(review.createdAt)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No reviews found" description="There are no reviews matching the current filters." />
      )}
    </div>
  )
}
