"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Sparkles,
  Target,
  CheckCircle2,
  Clock3,
} from "lucide-react"
import Image from "next/image"
import { summarizeCampaignProgress } from "@/lib/campaign-progress"

type Campaign = {
  id: string
  title: string
  bannerUrl: string
  category: string
  status: "Active" | "Paused" | "Stopped" | "Pending"
  budget: number
  reservedBudget?: number
  estimatedLeads: number
  generatedLeads?: number
  createdAt?: string
  originalBudget?: number
}

type Submission = {
  id: string
  campaignId?: string
  status?: string
}

type CampaignFilter = "All" | "Active" | "Pending" | "Paused" | "Stopped" | "Completed"

const PAGE_SIZE = 6

const statusStyles: Record<Campaign["status"], string> = {
  Active: "bg-emerald-100 text-emerald-700",
  Paused: "bg-amber-100 text-amber-800",
  Pending: "bg-sky-100 text-sky-700",
  Stopped: "bg-rose-100 text-rose-700",
}

export default function CampaignsPage() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [search, setSearch] = useState<string>("")
  const [filter, setFilter] = useState<CampaignFilter>("All")
  const [page, setPage] = useState(1)

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    const campaignsQuery = query(
      collection(db, "campaigns"),
      where("ownerId", "==", user.uid),
      orderBy("createdAt", "desc")
    )

    const unsub = onSnapshot(campaignsQuery, (snap) => {
      const data: Campaign[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Campaign, "id">),
      }))
      setCampaigns(data)
    })

    return () => unsub()
  }, [])

  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    const submissionsQuery = query(
      collection(db, "earnerSubmissions"),
      where("advertiserId", "==", user.uid)
    )

    const unsub = onSnapshot(submissionsQuery, (snap) => {
      setSubmissions(
        snap.docs.map((doc) => ({
          id: doc.id,
          campaignId: String(doc.data().campaignId || ""),
          status: String(doc.data().status || ""),
        }))
      )
    })

    return () => unsub()
  }, [])

  const filtered = useMemo(() => {
    return campaigns.filter((campaign) => {
      const matchesSearch = campaign.title.toLowerCase().includes(search.toLowerCase())

      if (!matchesSearch) return false

      if (filter === "All") return true

      const progress = summarizeCampaignProgress({
        target: campaign.estimatedLeads,
        generatedLeads: campaign.generatedLeads,
        submissions: submissions.filter((submission) => submission.campaignId === campaign.id),
      })

      if (filter === "Completed") {
        return progress.target > 0 && progress.verified >= progress.target
      }

      return campaign.status === filter
    })
  }, [campaigns, filter, search, submissions])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  const paginatedCampaigns = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  useEffect(() => {
    setPage(1)
  }, [search, filter])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const summary = useMemo(() => {
    const totals = filtered.reduce(
      (acc, campaign) => {
        const progress = summarizeCampaignProgress({
          target: campaign.estimatedLeads,
          generatedLeads: campaign.generatedLeads,
          submissions: submissions.filter((submission) => submission.campaignId === campaign.id),
        })

        acc.budget += Number(
          campaign.originalBudget ||
            (Number(campaign.budget || 0) + Number(campaign.reservedBudget || 0))
        )
        acc.targets += progress.target
        acc.verified += progress.verified
        acc.pending += progress.pending
        return acc
      },
      { budget: 0, targets: 0, verified: 0, pending: 0 }
    )

    return {
      totalTasks: filtered.length,
      ...totals,
    }
  }, [filtered, submissions])

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.2),_transparent_32%),linear-gradient(180deg,_#fef3c7_0%,_#f5f5f4_48%,_#e7e5e4_100%)] px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <Button
          onClick={() => router.back()}
          className="gap-2 bg-stone-800 text-white hover:bg-stone-900"
          size="sm"
        >
          <ArrowLeft size={16} /> Back
        </Button>

        <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/75 shadow-[0_20px_60px_rgba(120,53,15,0.08)] backdrop-blur">
          <div className="grid gap-6 p-6 md:grid-cols-[1.4fr_0.9fr] md:p-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">
                <Sparkles size={14} />
                Task control room
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
                  Manage every advertiser task from one cleaner view.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-stone-600 md:text-base">
                  Track budget, check progress, and jump into any task quickly. This page keeps
                  the newest work visible first while your live numbers stay easy to scan.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/advertiser/create-campaign">
                  <Button className="gap-2 rounded-full bg-amber-500 px-5 text-stone-900 hover:bg-amber-600">
                    <Plus size={16} />
                    Create New Task
                  </Button>
                </Link>
                <div className="relative min-w-[260px] flex-1 max-w-md">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
                  <Input
                    placeholder="Search task title"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-11 rounded-full border-stone-200 bg-white pl-10 shadow-sm"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["All", "Active", "Pending", "Paused", "Stopped", "Completed"] as CampaignFilter[]).map((option) => (
                  <Button
                    key={option}
                    type="button"
                    variant="outline"
                    onClick={() => setFilter(option)}
                    className={
                      filter === option
                        ? "rounded-full border-amber-500 bg-amber-500 text-stone-900 hover:bg-amber-500"
                        : "rounded-full border-stone-200 bg-white text-stone-700 hover:bg-stone-100"
                    }
                  >
                    {option}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="rounded-3xl border-stone-200/80 bg-stone-900 text-white shadow-none">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Visible tasks</p>
                  <p className="mt-3 text-3xl font-semibold">{summary.totalTasks}</p>
                  <p className="mt-2 text-sm text-stone-300">Tasks matching your current search.</p>
                </CardContent>
              </Card>
              <Card className="rounded-3xl border-amber-200 bg-amber-50 shadow-none">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-amber-700">Budget in play</p>
                  <p className="mt-3 text-3xl font-semibold text-stone-900">NGN {summary.budget.toLocaleString()}</p>
                  <p className="mt-2 text-sm text-stone-600">Across the tasks in this view.</p>
                </CardContent>
              </Card>
              <Card className="rounded-3xl border-stone-200 bg-white shadow-none">
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Verified</p>
                    <p className="mt-2 text-2xl font-semibold text-stone-900">{summary.verified}</p>
                    <p className="mt-1 text-sm text-stone-500">Completed submissions confirmed.</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-3xl border-stone-200 bg-white shadow-none">
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                    <Clock3 size={18} />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Pending</p>
                    <p className="mt-2 text-2xl font-semibold text-stone-900">{summary.pending}</p>
                    <p className="mt-1 text-sm text-stone-500">Submissions still waiting for review.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {paginatedCampaigns.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {paginatedCampaigns.map((campaign) => {
              const progress = summarizeCampaignProgress({
                target: campaign.estimatedLeads,
                generatedLeads: campaign.generatedLeads,
                submissions: submissions.filter((submission) => submission.campaignId === campaign.id),
              })

              const totalBudget = Number(
                campaign.originalBudget ||
                  (Number(campaign.budget || 0) + Number(campaign.reservedBudget || 0))
              )
              const remainingSlots = Math.max(progress.target - progress.verified, 0)

              return (
                <Link key={campaign.id} href={`/advertiser/campaigns/${campaign.id}`}>
                  <Card className="group h-full overflow-hidden rounded-[28px] border border-white/70 bg-white/80 shadow-[0_16px_40px_rgba(120,53,15,0.08)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(120,53,15,0.12)]">
                    <div className="relative aspect-[16/10] overflow-hidden bg-stone-100">
                      <Image
                        src={campaign.bannerUrl || "/placeholders/default.jpg"}
                        alt={campaign.title || "Task banner"}
                        fill
                        className="object-cover transition duration-300 group-hover:scale-[1.03]"
                        priority
                      />
                      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[campaign.status]}`}>
                          {campaign.status}
                        </span>
                        <span className="rounded-full bg-stone-950/75 px-3 py-1 text-xs font-medium text-white">
                          {campaign.category}
                        </span>
                      </div>
                    </div>

                    <CardContent className="space-y-5 p-5">
                      <div className="space-y-2">
                        <h3 className="line-clamp-2 text-lg font-semibold text-stone-900">
                          {campaign.title}
                        </h3>
                        <p className="text-sm leading-6 text-stone-500">
                          Track spend, target volume, and verified progress for this task.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-stone-100/80 p-4">
                          <p className="text-[11px] uppercase tracking-[0.24em] text-stone-500">Budget</p>
                          <p className="mt-2 text-lg font-semibold text-stone-900">NGN {totalBudget.toLocaleString()}</p>
                        </div>
                        <div className="rounded-2xl bg-stone-100/80 p-4">
                          <p className="text-[11px] uppercase tracking-[0.24em] text-stone-500">Target leads</p>
                          <p className="mt-2 text-lg font-semibold text-stone-900">{progress.target.toLocaleString()}</p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-stone-200 p-4">
                        <div className="flex items-center justify-between text-sm text-stone-600">
                          <span className="inline-flex items-center gap-2">
                            <Target size={15} className="text-amber-700" />
                            Progress
                          </span>
                          <span className="font-semibold text-stone-900">{progress.progressPercent}%</span>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-stone-200">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-500 transition-all duration-300"
                            style={{ width: `${progress.progressPercent}%` }}
                          />
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-2xl bg-emerald-50 px-2 py-3">
                            <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Verified</p>
                            <p className="mt-1 text-base font-semibold text-stone-900">{progress.verified}</p>
                          </div>
                          <div className="rounded-2xl bg-sky-50 px-2 py-3">
                            <p className="text-xs uppercase tracking-[0.2em] text-sky-700">Pending</p>
                            <p className="mt-1 text-base font-semibold text-stone-900">{progress.pending}</p>
                          </div>
                          <div className="rounded-2xl bg-stone-100 px-2 py-3">
                            <p className="text-xs uppercase tracking-[0.2em] text-stone-600">Pending slots</p>
                            <p className="mt-1 text-base font-semibold text-stone-900">{remainingSlots}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        ) : (
          <Card className="rounded-[28px] border-dashed border-stone-300 bg-white/75 shadow-none">
            <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <p className="text-lg font-semibold text-stone-900">No tasks matched this view.</p>
              <p className="mt-3 max-w-md text-sm leading-7 text-stone-600">
                Try a different task title, or launch a fresh task if you are ready to get more
                submissions in.
              </p>
              <Link href="/advertiser/create-campaign" className="mt-6">
                <Button className="gap-2 rounded-full bg-amber-500 px-5 text-stone-900 hover:bg-amber-600">
                  <Plus size={16} />
                  Create Your First Task
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {filtered.length > PAGE_SIZE && (
          <div className="flex flex-col items-center justify-between gap-4 rounded-[28px] border border-white/70 bg-white/70 px-5 py-4 shadow-[0_16px_40px_rgba(120,53,15,0.05)] backdrop-blur sm:flex-row">
            <p className="text-sm text-stone-600">
              Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} tasks
            </p>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                className="gap-2 rounded-full"
              >
                <ChevronLeft size={16} />
                Previous
              </Button>
              <span className="text-sm font-medium text-stone-700">
                Page {page} of {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page === totalPages}
                className="gap-2 rounded-full"
              >
                Next
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
