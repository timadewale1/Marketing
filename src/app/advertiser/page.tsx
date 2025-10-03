"use client"

import React, { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { signOut } from "firebase/auth"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
} from "firebase/firestore"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Menu,
  X,
  TrendingUp,
  Wallet,
  Users,
  Percent,
  Plus,
  LogOut,
  Info,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import Link from "next/link"

type Campaign = {
  id: string
  title: string
  bannerUrl: string
  category: string
  status: "Active" | "Paused" | "Stopped" | "Pending"
  budget: number
  estimatedLeads: number
  generatedLeads?: number
  costPerLead?: number
}

export default function AdvertiserDashboard() {
  const router = useRouter()

  // UI states
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [fabOpen, setFabOpen] = useState(false)
  const sidebarRef = useRef<HTMLDivElement | null>(null)
  const fabRef = useRef<HTMLDivElement | null>(null)

  const [name, setName] = useState<string>("Loading...")
  const [filter, setFilter] = useState("Active")
  const [campaigns, setCampaigns] = useState<Campaign[]>([])

  // Fetch advertiser name
  useEffect(() => {
    const fetchName = async () => {
      const user = auth.currentUser
      if (user) {
        const ref = doc(db, "advertisers", user.uid)
        const snap = await getDoc(ref)
        if (snap.exists()) setName(snap.data().name)
      }
    }
    fetchName()
  }, [])

  // Real-time campaigns
  useEffect(() => {
    const user = auth.currentUser
    if (!user) return

    const q = query(collection(db, "campaigns"), where("ownerId", "==", user.uid))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Campaign[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Campaign, "id">),
      }))
      setCampaigns(data)
    })

    return () => unsubscribe()
  }, [])

  const filteredCampaigns = campaigns.filter(
    (c) => c.status.toLowerCase() === filter.toLowerCase()
  )

  // close sidebar/fab on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (sidebarOpen && sidebarRef.current && !sidebarRef.current.contains(target)) {
        setSidebarOpen(false)
      }
      if (fabOpen && fabRef.current && !fabRef.current.contains(target)) {
        setFabOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [sidebarOpen, fabOpen])

  const handleLogout = async () => {
    try {
      await signOut(auth)
      router.push("/auth/sign-in")
    } catch (err) {
      console.error("Logout failed", err)
    }
  }

  // Stats calculations
  const totalSpend = campaigns.reduce(
    (sum, c) =>
      sum +
      ((c.estimatedLeads || 0) * (c.costPerLead || 0) || c.budget || 0),
    0
  )
  const totalPaidLeads = campaigns.reduce((sum, c) => sum + (c.estimatedLeads || 0), 0)
  const totalGenerated = campaigns.reduce((sum, c) => sum + (c.generatedLeads || 0), 0)

  const conversionRate =
    totalPaidLeads > 0 ? (totalGenerated / totalPaidLeads) * 100 : null

  // Stats with conversion rate
  const stats = [
    {
      title: "Active Campaigns",
      value: campaigns.filter((c) => c.status === "Active").length,
      icon: TrendingUp,
      desc: "Number of campaigns currently running",
    },
    {
      title: "Total Spend",
      value: `₦${totalSpend.toLocaleString()}`,
      icon: Wallet,
      desc: "Total budget allocated across campaigns",
    },
    {
      title: "Leads Paid For",
      value: totalPaidLeads,
      icon: Users,
      desc: "Total leads budgeted for via campaigns",
    },
    {
      title: "Leads Generated",
      value: totalGenerated,
      icon: Users,
      desc: "Total actual leads generated",
    },
    {
      title: "Conversion Rate",
      value: conversionRate !== null ? `${conversionRate.toFixed(1)}%` : "N/A",
      icon: Percent,
      desc: "Generated ÷ Paid For × 100",
      highlight: conversionRate, // we’ll use this to color code
    },
  ]

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
        <div className="max-w-[1200px] mx-auto px-4 py-8 relative">
          {/* Sidebar */}
          <aside
            ref={sidebarRef}
            className={`fixed top-0 left-0 z-50 h-full w-72 bg-white/90 backdrop-blur-md shadow transform transition-transform duration-300 ${
              sidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-stone-800">Menu</h2>
              <button onClick={() => setSidebarOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <nav className="p-4 space-y-2">
              {[
                { label: "Dashboard", path: "/advertiser" },
                { label: "Campaigns", path: "/advertiser/campaigns" },
                { label: "Wallet", path: "/advertiser/wallet" },
                { label: "Profile", path: "/advertiser/profile" },
              ].map((item) => (
                <button
                  key={item.path}
                  className="block w-full text-left text-sm p-2 rounded hover:bg-stone-100"
                  onClick={() => {
                    setSidebarOpen(false)
                    router.push(item.path)
                  }}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="p-4 border-t">
              <Button
                variant="ghost"
                className="w-full justify-start text-sm"
                onClick={handleLogout}
              >
                <LogOut size={16} className="mr-2" /> Logout
              </Button>
            </div>
          </aside>

          {/* Header */}
          <header className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <button
                className="p-2 rounded bg-white/70"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu size={18} />
              </button>
              <div>
                <h1 className="text-xl font-bold text-stone-800">Welcome, {name}</h1>
                <p className="text-sm text-stone-600">Manage your campaigns and leads</p>
              </div>
            </div>
          </header>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
            {stats.map((s, i) => {
              let valueColor = "text-stone-900"
              if (s.title === "Conversion Rate" && typeof s.highlight === "number") {
                if (s.highlight >= 70) valueColor = "text-green-600"
                else if (s.highlight >= 40) valueColor = "text-yellow-600"
                else valueColor = "text-red-600"
              }

              return (
                <Card key={i} className="bg-white/90 shadow rounded-2xl">
                  <CardContent className="p-5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-stone-700">{s.title}</h3>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info size={14} className="text-stone-500 cursor-pointer" />
                          </TooltipTrigger>
                          <TooltipContent className="bg-stone-800 text-amber-200 text-xs rounded px-2 py-1">
                            {s.desc}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p className={`text-xl font-bold mt-2 ${valueColor}`}>{s.value}</p>
                    </div>
                    <s.icon size={24} className="text-amber-600" />
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Campaigns Section */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-stone-800">Your Campaigns</h2>
            <Link href="/advertiser/create-campaign">
              <Button className="bg-amber-500 text-stone-900 hover:bg-amber-600 flex items-center gap-2">
                <Plus size={16} />
                Create Campaign
              </Button>
            </Link>
          </div>

          {/* Filter */}
          <div className="flex gap-2 mb-6">
            {["Active", "Paused", "Stopped", "Pending"].map((status) => (
              <Button
                key={status}
                variant={filter === status ? "default" : "outline"}
                className={
                  filter === status
                    ? "bg-amber-500 text-stone-900"
                    : "text-stone-600 border-stone-300"
                }
                onClick={() => setFilter(status)}
              >
                {status}
              </Button>
            ))}
          </div>

          {/* Campaigns Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {filteredCampaigns.length > 0 ? (
              filteredCampaigns.map((c) => {
                const total = c.estimatedLeads || 0
                const achieved = c.generatedLeads || 0
                const percent = total > 0 ? Math.min((achieved / total) * 100, 100) : 0

                return (
                  <Link key={c.id} href={`/advertiser/campaigns/${c.id}`}>
                    <Card className="bg-white rounded-xl shadow hover:shadow-lg transition overflow-hidden">
                      <div className="relative">
                        <img
                          src={c.bannerUrl}
                          alt={c.title}
                          className="w-full aspect-square object-cover"
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
                          <span>₦{c.budget}</span>
                          <span>{c.estimatedLeads} leads</span>
                        </div>

                        {total > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="w-full bg-stone-200 rounded-full h-1.5 mt-2">
                                <div
                                  className="h-1.5 bg-amber-500 rounded-full"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="bg-stone-800 text-amber-200 text-xs px-2 py-1 rounded">
                              {achieved} of {total} leads generated (
                              {percent.toFixed(1)}%)
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                )
              })
            ) : (
              <p className="text-sm text-stone-500">No {filter} campaigns found.</p>
            )}
          </div>

          {/* FAB */}
          <div
            ref={fabRef}
            className="fixed right-6 bottom-6 z-50 flex flex-col items-end gap-2"
          >
            {fabOpen && (
              <>
                <Button
                  className="bg-white text-stone-900 shadow"
                  onClick={() => {
                    setFabOpen(false)
                    router.push("/advertiser/create-campaign")
                  }}
                >
                  New Campaign
                </Button>
                <Button
                  className="bg-white text-stone-900 shadow"
                  onClick={() => {
                    setFabOpen(false)
                    router.push("/advertiser/analytics")
                  }}
                >
                  Analytics
                </Button>
              </>
            )}
            <button
              onClick={() => setFabOpen((s) => !s)}
              className="w-14 h-14 rounded-full bg-amber-600 shadow-lg flex items-center justify-center text-white"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
