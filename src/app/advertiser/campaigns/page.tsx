"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
} from "firebase/firestore"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { ArrowLeft, Plus } from "lucide-react"
import Image from "next/image"
import { summarizeCampaignProgress } from "@/lib/campaign-progress"

type Campaign = {
  id: string
  title: string
  bannerUrl: string
  category: string
  status: "Active" | "Paused" | "Stopped" | "Pending"
  budget: number
  reservedBudget?: number // Made optional
  estimatedLeads: number
  generatedLeads?: number
  createdAt?: string
  originalBudget?: number // Added as optional
}

type Submission = {
  id: string
  campaignId?: string
  status?: string
}

export default function CampaignsPage() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [search, setSearch] = useState<string>("")

  // Fetch advertiser campaigns realtime
  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    const q = query(
      collection(db, "campaigns"),
      where("ownerId", "==", user.uid),
      orderBy("createdAt", "desc")
    )

    const unsub = onSnapshot(q, (snap) => {
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

  const filtered = campaigns.filter((c) => {
    const matchesSearch = c.title.toLowerCase().includes(search.toLowerCase())
    return matchesSearch
  })

  return (
    <div className="px-6 py-10 bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300 min-h-screen">
      {/* Back Button */}
      <Button
        onClick={() => router.back()}
        className="flex gap-2 mb-4 bg-stone-700 hover:bg-stone-800 text-white"
        size="sm"
      >
        <ArrowLeft size={16} /> Back
      </Button>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-stone-800">
          Your Tasks
        </h1>
        <Link href="/advertiser/create-campaign">
          <Button className="bg-amber-500 text-stone-900 hover:bg-amber-600 flex items-center gap-2">
            <Plus size={16} /> New Task
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 md:items-center mb-6">
        <Input
          placeholder="Search tasks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {/* <div className="flex gap-2">
          {["All", "Active", "Paused", "Stopped", "Pending"].map((s) => (
            <Button
              key={s}
              variant={filter === s ? "default" : "outline"}
              className={
                filter === s
                  ? "bg-amber-500 text-stone-900"
                  : "text-stone-600 border-stone-300"
              }
              onClick={() => setFilter(s)}
            >
              {s}
            </Button>
          ))}
        </div> */}
      </div>

      {/* Campaigns Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {filtered.map((c) => {
            const progress = summarizeCampaignProgress({
              target: c.estimatedLeads,
              generatedLeads: c.generatedLeads,
              submissions: submissions.filter((submission) => submission.campaignId === c.id),
            })

            return (
              <Link key={c.id} href={`/advertiser/campaigns/${c.id}`}>
                <Card className="bg-white rounded-xl shadow hover:shadow-lg transition overflow-hidden">
                  <div className="relative">
                    <Image
                      src={c.bannerUrl || "/placeholders/default.jpg"}
                      alt={c.title || 'Task banner'}
                      fill
                      style={{ objectFit: 'cover' }}
                      className="w-full h-full object-cover"
                      priority
                    />
                    <span
                      className={`absolute top-2 left-2 px-2 py-1 text-xs rounded font-medium ${
                        c.status === "Active"
                          ? "bg-green-100 text-green-700"
                          : c.status === "Paused"
                          ? "bg-yellow-100 text-yellow-700"
                          : c.status === "Pending"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <CardContent className="p-3">
                    <h3 className="font-semibold text-sm text-stone-800 line-clamp-2">
                      {c.title}
                    </h3>
                    <p className="text-xs text-stone-500">{c.category}</p>
                    <div className="flex justify-between text-xs text-stone-600 mt-1">
                      <span>
  ₦{(
    Number(c.originalBudget || (Number(c.budget || 0) + Number(c.reservedBudget || 0)))
  ).toLocaleString()}
</span>
                      <span>{progress.target} leads</span>
                    </div>
                    <p className="mt-2 text-xs text-stone-600">
                      {progress.verified} verified
                      {progress.pending > 0 ? ` • ${progress.pending} pending` : ""}
                    </p>

                    {progress.target > 0 && (
                      <div className="w-full bg-stone-200 rounded-full h-1.5 mt-2">
                        <div
                          className="h-1.5 bg-amber-500 rounded-full"
                          style={{ width: `${progress.progressPercent}%` }}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      ) : (
        <p className="p-4 text-sm text-stone-500">
          No tasks found.
        </p>
      )}
    </div>
  )
}
