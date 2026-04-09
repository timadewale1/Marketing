"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore"
import { onAuthStateChanged } from "firebase/auth"
import { ArrowLeft, ExternalLink, FileText, ImageIcon, Link as LinkIcon, UserCircle2 } from "lucide-react"
import { auth, db } from "@/lib/firebase"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { summarizeCampaignProgress } from "@/lib/campaign-progress"
import { getProofUrls } from "@/lib/proofs"
import toast from "react-hot-toast"

type Campaign = {
  id: string
  title: string
  bannerUrl: string
  description?: string
  category: string
  status: "Active" | "Paused" | "Stopped" | "Pending" | "Deleted" | "Completed"
  budget: number
  estimatedLeads: number
  generatedLeads: number
  costPerLead: number
  createdAt?: string
  paymentRef?: string
  reservedBudget?: number
  originalBudget?: number
  mediaUrl?: string
  externalLink?: string
  productImages?: string[]
  advertiserFaceImage?: string
  businessAddress?: {
    addressLine?: string
    city?: string
    state?: string
    country?: string
  }
}

type Submission = {
  id: string
  userId?: string
  userName?: string
  status?: string
  proofUrl?: string
  proofUrls?: string[]
  socialHandle?: string | null
  note?: string | null
  createdAt?: string | null
}

export default function CampaignDetailsPage() {
  const { id } = useParams()
  const router = useRouter()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [proofFilter, setProofFilter] = useState("all")
  const [topUpAmount, setTopUpAmount] = useState("")
  const [savingBudget, setSavingBudget] = useState(false)
  const [savingDetails, setSavingDetails] = useState(false)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftDescription, setDraftDescription] = useState("")

  useEffect(() => {
    if (!id) return

    const unsubscribe = onSnapshot(doc(db, "campaigns", id as string), (snap) => {
      if (snap.exists()) {
        const nextCampaign = { ...(snap.data() as Campaign), id: snap.id }
        setCampaign(nextCampaign)
        setDraftTitle(nextCampaign.title || "")
        setDraftDescription(nextCampaign.description || "")
      } else {
        setCampaign(null)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [id])

  useEffect(() => {
    if (!id) return
    let unsubscribeSnapshot: (() => void) | null = null

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeSnapshot?.()
      unsubscribeSnapshot = null

      if (!user?.uid) {
        setSubmissions([])
        return
      }

      const submissionsQuery = query(
        collection(db, "earnerSubmissions"),
        where("campaignId", "==", id as string),
        where("advertiserId", "==", user.uid)
      )

      unsubscribeSnapshot = onSnapshot(submissionsQuery, (snap) => {
        void (async () => {
          const rawSubmissions = snap.docs.map((submissionDoc) => ({
            id: submissionDoc.id,
            userId: String(submissionDoc.data().userId || ""),
            status: String(submissionDoc.data().status || ""),
            proofUrl: String(submissionDoc.data().proofUrl || ""),
            proofUrls: getProofUrls(submissionDoc.data() as { proofUrl?: unknown; proofUrls?: unknown }),
            socialHandle: submissionDoc.data().socialHandle ? String(submissionDoc.data().socialHandle) : null,
            note: submissionDoc.data().note ? String(submissionDoc.data().note) : null,
            createdAt: submissionDoc.data().createdAt?.toDate
              ? submissionDoc.data().createdAt.toDate().toISOString()
              : null,
          }))

          const userIds = [...new Set(rawSubmissions.map((submission) => submission.userId).filter(Boolean))]
          const userNames = new Map<string, string>()

          await Promise.all(
            userIds.map(async (userId) => {
              try {
                const earnerSnap = await getDoc(doc(db, "earners", userId))
                if (!earnerSnap.exists()) return

                const earner = earnerSnap.data() as Record<string, unknown>
                userNames.set(
                  userId,
                  String(earner.fullName || earner.name || earner.email || userId)
                )
              } catch (error) {
                console.warn("Failed to load earner details", userId, error)
              }
            })
          )

          setSubmissions(
            rawSubmissions.map((submission) => ({
              ...submission,
              userName: submission.userId
                ? userNames.get(submission.userId) || submission.userId
                : "Unknown earner",
            }))
          )
        })()
      })
    })

    return () => {
      unsubscribeSnapshot?.()
      unsubscribeAuth()
    }
  }, [id])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
        <Card className="bg-gradient-to-br from-amber-50 to-stone-100 p-8 text-center shadow-md">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
          <p className="font-medium text-stone-700">Loading task...</p>
        </Card>
      </div>
    )
  }

  if (!campaign) {
    return <p className="p-6">Task not found.</p>
  }

  const progress = summarizeCampaignProgress({
    target: Number(campaign.estimatedLeads || 0),
    generatedLeads: Number(campaign.generatedLeads || 0),
    submissions,
  })

  const percent = progress.progressPercent
  const progressColor =
    percent >= 75
      ? "from-green-500 to-green-700"
      : percent >= 40
        ? "from-yellow-400 to-yellow-600"
        : "from-red-500 to-red-700"

  const totalBudget = Number(
    campaign.originalBudget || (Number(campaign.budget || 0) + Number(campaign.reservedBudget || 0))
  )
  const businessAddress = [
    campaign.businessAddress?.addressLine,
    campaign.businessAddress?.city,
    campaign.businessAddress?.state,
    campaign.businessAddress?.country,
  ]
    .filter(Boolean)
    .join(", ")
  const filteredSubmissions = submissions.filter((submission) =>
    proofFilter === "all" ? true : (submission.status || "").toLowerCase() === proofFilter
  )

  const handleTopUp = async () => {
    if (!campaign) return
    const user = auth.currentUser
    if (!user) return toast.error("Please sign in again to continue")

    const amount = Number(topUpAmount || 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      return toast.error("Enter a valid amount to add")
    }

    setSavingBudget(true)
    try {
      const token = await user.getIdToken()
      const response = await fetch("/api/advertiser/campaign/top-up", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ campaignId: campaign.id, amount }),
      })

      const data = await response.json()
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || "Failed to add budget")
      }

      setTopUpAmount("")
      toast.success("Task budget updated successfully")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add budget")
    } finally {
      setSavingBudget(false)
    }
  }

  const handleSaveDetails = async () => {
    if (!campaign) return
    const user = auth.currentUser
    if (!user) return toast.error("Please sign in again to continue")

    if (!draftTitle.trim()) {
      return toast.error("Task name is required")
    }

    setSavingDetails(true)
    try {
      const token = await user.getIdToken()
      const response = await fetch("/api/advertiser/campaign/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          campaignId: campaign.id,
          title: draftTitle.trim(),
          description: draftDescription.trim(),
        }),
      })

      const data = await response.json()
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || "Failed to update task")
      }

      toast.success("Task details updated successfully")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update task")
    } finally {
      setSavingDetails(false)
    }
  }

  return (
    <div className="min-h-screen space-y-8 bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300 px-6 py-10">
      <Button
        onClick={() => router.back()}
        className="mb-4 flex gap-2 bg-stone-700 text-white hover:bg-stone-800"
        size="sm"
      >
        <ArrowLeft size={16} /> Back
      </Button>

      <div className="flex justify-center">
        <Card className="w-full max-w-xs overflow-hidden rounded-xl bg-gradient-to-br from-amber-50 to-stone-100 shadow-md">
          <Image
            src={campaign.bannerUrl || "/placeholders/default.jpg"}
            alt={campaign.title || "Task banner"}
            width={400}
            height={400}
            className="aspect-square w-full object-cover"
            priority
          />
          <CardContent className="space-y-2 p-4 text-center">
            <h1 className="text-lg font-semibold text-stone-800">{campaign.title}</h1>
            <p className="text-xs text-stone-500">{campaign.category}</p>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                campaign.status === "Active"
                  ? "bg-green-100 text-green-700"
                  : campaign.status === "Paused"
                    ? "bg-yellow-100 text-yellow-700"
                    : campaign.status === "Pending"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-red-100 text-red-600"
              }`}
            >
              {campaign.status}
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Card className="space-y-4 bg-gradient-to-br from-amber-50 to-stone-100 p-6 shadow-md">
          <h2 className="text-lg font-semibold text-stone-800">Performance Overview</h2>
          <div>
            <div className="h-2 w-full rounded-full bg-stone-200">
              <div
                className={`h-2 rounded-full bg-gradient-to-r ${progressColor}`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-stone-600">
              {progress.verified} verified
              {progress.pending > 0 ? ` • ${progress.pending} pending review` : ""}
              {progress.target > 0 ? ` • ${progress.target} target` : ""}
              {` (${percent.toFixed(1)}%)`}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div className="rounded-xl bg-white/70 p-3">
              <p className="text-stone-500">Verified</p>
              <p className="mt-1 font-semibold text-stone-900">{progress.verified}</p>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <p className="text-stone-500">Pending</p>
              <p className="mt-1 font-semibold text-stone-900">{progress.pending}</p>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <p className="text-stone-500">Rejected</p>
              <p className="mt-1 font-semibold text-stone-900">{progress.rejected}</p>
            </div>
          </div>
        </Card>

        <Card className="space-y-4 bg-gradient-to-br from-stone-100 to-amber-50 p-6 shadow-md">
          <h2 className="text-lg font-semibold text-stone-800">Task Details</h2>
          <div className="rounded-2xl bg-white/70 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Task Name</p>
            <Input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              className="mt-3 bg-white"
              placeholder="Enter task name"
            />
          </div>
          <div className="rounded-2xl bg-white/70 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Description</p>
            <Textarea
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
              className="mt-3 min-h-[132px] bg-white"
              placeholder="Add or update your task description"
            />
          </div>
          <Button
            type="button"
            onClick={handleSaveDetails}
            disabled={savingDetails}
            className="w-full rounded-full bg-stone-800 text-white hover:bg-stone-900"
          >
            {savingDetails ? "Saving..." : "Save task details"}
          </Button>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white/70 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Status</p>
              <p className="mt-2 text-sm font-medium text-stone-900">{campaign.status}</p>
            </div>
            <div className="rounded-2xl bg-white/70 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Category</p>
              <p className="mt-2 text-sm font-medium text-stone-900">{campaign.category}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Card className="bg-gradient-to-br from-amber-50 to-stone-100 p-6 shadow-md">
          <h2 className="mb-4 text-lg font-semibold text-stone-800">Billing</h2>
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <p>Payment Ref: {campaign.paymentRef || "N/A"}</p>
            <p>Total Budget: NGN {totalBudget.toLocaleString()}</p>
            <p>Estimated Leads: {progress.target}</p>
            <p>Cost per Lead: NGN {campaign.costPerLead}</p>
          </div>
          <div className="mt-5 rounded-2xl bg-white/80 p-4">
            <p className="text-sm font-medium text-stone-900">Add more budget to this task</p>
            <p className="mt-1 text-sm text-stone-600">
              Add extra funds from your wallet and the task will update its budget and estimated leads automatically.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Input
                type="number"
                min="1"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                placeholder="Enter amount in NGN"
                className="bg-white"
              />
              <Button
                type="button"
                onClick={handleTopUp}
                disabled={savingBudget}
                className="rounded-full bg-amber-500 text-stone-900 hover:bg-amber-600"
              >
                {savingBudget ? "Adding..." : "Add more budget"}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="space-y-4 bg-gradient-to-br from-stone-100 to-amber-50 p-6 shadow-md">
          <h2 className="text-lg font-semibold text-stone-800">Materials</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white/70 p-4">
              <div className="flex items-center gap-2 text-stone-800">
                <LinkIcon size={16} />
                <p className="text-sm font-medium">External Link</p>
              </div>
              {campaign.externalLink ? (
                <a
                  href={campaign.externalLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 break-all text-sm text-amber-700 underline"
                >
                  Open link <ExternalLink size={14} />
                </a>
              ) : (
                <p className="mt-3 text-sm text-stone-500">No external link attached.</p>
              )}
            </div>
            <div className="rounded-2xl bg-white/70 p-4">
              <div className="flex items-center gap-2 text-stone-800">
                <FileText size={16} />
                <p className="text-sm font-medium">Media</p>
              </div>
              {campaign.mediaUrl ? (
                <a
                  href={campaign.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 break-all text-sm text-amber-700 underline"
                >
                  View attached media <ExternalLink size={14} />
                </a>
              ) : (
                <p className="mt-3 text-sm text-stone-500">No media attachment added.</p>
              )}
            </div>
          </div>

          {(campaign.productImages?.length ?? 0) > 0 && (
            <div className="rounded-2xl bg-white/70 p-4">
              <div className="flex items-center gap-2 text-stone-800">
                <ImageIcon size={16} />
                <p className="text-sm font-medium">Product Images</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                {(campaign.productImages || []).map((imageUrl, index) => (
                  <a
                    key={`${imageUrl}-${index}`}
                    href={imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-2xl border border-stone-200 bg-stone-100"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt={`Product material ${index + 1}`}
                      className="h-32 w-full object-cover"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {campaign.advertiserFaceImage && (
            <div className="rounded-2xl bg-white/70 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Advertiser Face Verification</p>
              <a
                href={campaign.advertiserFaceImage}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block overflow-hidden rounded-2xl border border-stone-200 bg-stone-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={campaign.advertiserFaceImage}
                  alt="Advertiser face verification"
                  className="h-48 w-full object-cover"
                />
              </a>
            </div>
          )}

          {businessAddress && (
            <div className="rounded-2xl bg-white/70 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Business Address</p>
              <p className="mt-3 text-sm text-stone-700">{businessAddress}</p>
            </div>
          )}
        </Card>
      </div>

      <Card className="space-y-4 bg-gradient-to-br from-stone-100 to-amber-50 p-6 shadow-md">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-stone-800">Submitted Proofs</h2>
            <p className="mt-1 text-sm text-stone-600">
              View submitted proofs of participation for your tasks.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-stone-700">
              {filteredSubmissions.length} proof{filteredSubmissions.length === 1 ? "" : "s"}
            </div>
            <Select value={proofFilter} onValueChange={setProofFilter}>
              <SelectTrigger className="h-10 min-w-[160px] rounded-full border-stone-200 bg-white">
                <SelectValue placeholder="Filter proofs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All proofs</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {filteredSubmissions.length === 0 ? (
          <div className="rounded-2xl bg-white/70 p-6 text-sm text-stone-500">
            No proofs matched the current filter.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSubmissions.map((submission) => (
              <div key={submission.id} className="rounded-2xl border border-stone-200 bg-white/80 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-2 text-stone-900">
                        <UserCircle2 size={18} />
                        <p className="font-medium">{submission.userName || "Unknown earner"}</p>
                      </div>
                      <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
                        {submission.status || "Pending"}
                      </span>
                    </div>
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                      {submission.createdAt ? new Date(submission.createdAt).toLocaleString() : "Unknown date"}
                    </p>
                    {submission.socialHandle ? (
                      <p className="text-sm text-stone-600">Handle: {submission.socialHandle}</p>
                    ) : null}
                    {submission.note ? (
                      <p className="text-sm text-stone-600">{submission.note}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(submission.proofUrls || []).length > 0 ? (
                      (submission.proofUrls || []).map((proof, index) => (
                        <Button key={`${submission.id}-proof-${index}`} asChild variant="outline" className="rounded-full border-stone-300 bg-white">
                          <a href={proof} target="_blank" rel="noreferrer">
                            View proof {index + 1}
                          </a>
                        </Button>
                      ))
                    ) : (
                      <span className="rounded-full bg-stone-100 px-3 py-2 text-sm text-stone-500">
                        No proof file
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
