"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Search, XCircle } from "lucide-react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AdminPageHeader, EmptyState, SectionCard, StatusBadge, PaginatedCardList } from "@/app/admin/_components/admin-primitives"

type VendorSubmission = {
  id: string
  userName: string
  userEmail: string
  vendorName: string
  productId: string
  amount: number
  cashbackAmount: number
  status: string
  reason: string
  createdAtMs: number
}

export default function AdminVendorSubmissionsPage() {
  const [loading, setLoading] = useState(true)
  const [submissions, setSubmissions] = useState<VendorSubmission[]>([])
  const [search, setSearch] = useState("")
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/vendor-submissions", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to load vendor submissions")
      }
      setSubmissions(Array.isArray(data.submissions) ? data.submissions : [])
    } catch (error) {
      console.error("Admin vendor submissions load error", error)
      toast.error("Could not load vendor submissions")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return submissions
    return submissions.filter((item) => [item.userName, item.userEmail, item.vendorName, item.productId, item.status].join(" ").toLowerCase().includes(q))
  }, [search, submissions])

  const review = async (id: string, action: "approve" | "reject") => {
    if (action === "reject" && !rejectionReason.trim()) {
      toast.error("Please enter a rejection reason")
      return
    }
    setReviewingId(id)
    try {
      const res = await fetch(`/api/admin/vendor-submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: rejectionReason }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to review submission")
      }
      toast.success(action === "approve" ? "Submission approved" : "Submission rejected")
      setRejectionReason("")
      await load()
    } catch (error) {
      console.error("Admin vendor submission review error", error)
      toast.error(error instanceof Error ? error.message : "Could not update submission")
    } finally {
      setReviewingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Cashback review"
        title="Vendor Purchase Submissions"
        description="Review purchase evidence from earners and advertisers, then approve or reject the cashback claim."
      />

      <SectionCard
        title="Review queue"
        description="When a shopper submits proof of purchase from a Pamba store, the claim will land here for approval."
        action={
          <div className="relative w-full min-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, vendor, product..."
              className="rounded-full pl-9"
            />
          </div>
        }
      >
        {loading ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50/80 px-6 py-10 text-center text-stone-600">
            Loading submissions...
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No cashback claims yet"
            description="Claims for 10% cashback will appear here once users start submitting vendor purchase evidence."
          />
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <label className="block text-sm font-medium text-stone-900">Reject reason</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why the cashback claim was rejected"
                className="mt-2 min-h-[110px] w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none"
              />
            </div>
            <PaginatedCardList
              items={filtered}
              itemsPerPage={3}
              renderItem={(submission) => (
                <div key={submission.id} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-stone-900">{submission.userName || submission.userEmail || "User"}</p>
                        <StatusBadge label={submission.status || "pending"} tone={submission.status === "approved" ? "green" : submission.status === "rejected" ? "red" : "amber"} />
                      </div>
                      <p className="mt-2 text-sm text-stone-600">{submission.userEmail || "No email"} • {submission.vendorName || "Vendor"}</p>
                      <p className="mt-1 text-sm text-stone-600">Product: {submission.productId || "Unknown"} • Amount: ₦{Number(submission.amount || 0).toLocaleString()}</p>
                      <p className="mt-1 text-sm text-stone-600">Cashback: ₦{Number(submission.cashbackAmount || 0).toLocaleString()}</p>
                      {submission.reason ? <p className="mt-2 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{submission.reason}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        className="rounded-full bg-emerald-600 hover:bg-emerald-500"
                        disabled={reviewingId === submission.id}
                        onClick={() => void review(submission.id, "approve")}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50"
                        disabled={reviewingId === submission.id}
                        onClick={() => void review(submission.id, "reject")}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            />
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Example actions"
        description="Approved claims will credit cashback automatically, while rejected claims can carry a clear reason."
      >
        <div className="flex flex-wrap gap-3">
          <StatusBadge label="Awaiting proof" tone="amber" />
          <StatusBadge label="Approval credits wallet" tone="green" />
          <StatusBadge label="Rejection shows reason" tone="red" />
        </div>
      </SectionCard>
    </div>
  )
}
