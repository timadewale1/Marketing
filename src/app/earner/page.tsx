"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { signOut } from "firebase/auth"
import { auth, db } from "@/lib/firebase"
import type { DocumentData } from "firebase/firestore"
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
} from "firebase/firestore"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Home,
  User,
  Wallet,
  Grid,
  Clock,
  CheckCircle,
  Menu,
  X,
  Bell,
  LogOut,
  TrendingUp,
  Plus,
  Info,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// ------------------ Types ------------------
type Campaign = {
  id: string
  title: string
  category: string
  reward: number
  image?: string
  slotsLeft?: number
  totalSlots?: number
}

type Activity = {
  id: string
  title: string
  date: string | number | Date | { toDate(): Date }
  status: "Completed" | "In Review" | "Rejected" | "Paid"
  earned: number
}

// ------------------ Counter Animation ------------------
function useCountUp(value: number, duration = 700) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const from = display
    const to = value
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const v = Math.round(from + (to - from) * t)
      setDisplay(v)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return display
}

// ------------------ Dashboard ------------------
export default function EarnerDashboard() {
  const router = useRouter()
  const user = auth.currentUser

  // Overlay states
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [fabOpen, setFabOpen] = useState(false)

  // Withdraw modal
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState<number | "">("")
  const [processingWithdraw, setProcessingWithdraw] = useState(false)

  // Search
  const [searchCampaigns, setSearchCampaigns] = useState("")

  // refs for outside-click detection
  const sidebarRef = useRef<HTMLDivElement | null>(null)
  const notifyRef = useRef<HTMLDivElement | null>(null)
  const fabRef = useRef<HTMLDivElement | null>(null)

  // --- Firestore state ---
  const [userName, setUserName] = useState("Ada")
  const [profilePic, setProfilePic] = useState("") // using profilePic as in your Firestore
  const [stats, setStats] = useState({
    balance: 0,
    activeCampaigns: 0,
    leadsGenerated: 0,
    leadsPaidFor: 0,
  })
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [recent, setRecent] = useState<Activity[]>([])
  const minWithdraw = 2000

  // --- Firestore listeners ---
  useEffect(() => {
    if (!user) return

    // Earner profile doc
    const unsubProfile = onSnapshot(doc(db, "earners", user.uid), (snap) => {
      if (snap.exists()) {
        const d = snap.data() as DocumentData
        // prefer fullName, then name, then email local-part
        const resolvedName =
          (d && (d.fullName || d.name)) ||
          (d && d.email && String(d.email).split("@")[0]) ||
          "User"
        setUserName(resolvedName)
        // prefer profilePic field (your Firestore), fallback to avatar if present
        setProfilePic((d && (d.profilePic || d.avatar)) || "")
        setStats({
          balance: (d && d.balance) || 0,
          activeCampaigns: (d && d.activeCampaigns) || 0,
          leadsGenerated: (d && d.leadsGenerated) || 0,
          leadsPaidFor: (d && d.leadsPaidFor) || 0,
        })
      }
    })

    // Campaigns (active)
    const unsubCampaigns = onSnapshot(
      query(collection(db, "campaigns"), where("status", "==", "active")),
      (snap) => {
        const data: Campaign[] = snap.docs.map((doc) => {
          const d = doc.data() as DocumentData
          return {
            id: doc.id,
            title: d.title || d.name || "Untitled",
            category: d.category || "General",
            reward: d.reward || d.price || 0,
            image: d.image || d.banner || "",
            slotsLeft: d.slotsLeft ?? d.remainingSlots ?? null,
            totalSlots: d.totalSlots ?? d.slots ?? null,
          } as Campaign
        })
        setCampaigns(data)
      }
    )

    // Recent activity - supports either timestamp or string date
    const unsubRecent = onSnapshot(
      query(collection(db, "earners", user.uid, "activities"), orderBy("date", "desc")),
      (snap) => {
        const data: Activity[] = snap.docs.map((doc) => {
          const d = doc.data() as DocumentData
          return {
            id: doc.id,
            title: d.title || d.name || "Activity",
            date: d.date ?? d.createdAt ?? "",
            status: d.status || "In Review",
            earned: d.earned || 0,
          } as Activity
        })
        setRecent(data)
      }
    )

    return () => {
      try {
        unsubProfile && unsubProfile()
        unsubCampaigns && unsubCampaigns()
        unsubRecent && unsubRecent()
      } catch (e) {}
    }
  }, [user])

  // Count-up hooks
  const balanceCount = useCountUp(stats.balance)
  const activeCampaignsCount = useCountUp(stats.activeCampaigns)
  const leadsGeneratedCount = useCountUp(stats.leadsGenerated)
  const leadsPaidCount = useCountUp(stats.leadsPaidFor)

  // Filter campaigns by search
  const filteredCampaigns = campaigns.filter((c) =>
    (c.title + c.category).toLowerCase().includes(searchCampaigns.toLowerCase())
  )

  const timeGreeting = useMemo(() => {
    const hr = new Date().getHours()
    if (hr < 12) return "Good morning"
    if (hr < 18) return "Good afternoon"
    return "Good evening"
  }, [])

  // auto-close overlays
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (sidebarOpen && sidebarRef.current && !sidebarRef.current.contains(target)) {
        setSidebarOpen(false)
      }
      if (notifyOpen && notifyRef.current && !notifyRef.current.contains(target)) {
        setNotifyOpen(false)
      }
      if (fabOpen && fabRef.current && !fabRef.current.contains(target)) {
        setFabOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [sidebarOpen, notifyOpen, fabOpen])

  // Handlers
  const handleLogout = async () => {
    try {
      await signOut(auth)
      router.push("/auth/sign-in")
    } catch (err) {
      console.error("Logout failed", err)
    }
  }

  const goToCampaign = (id: string) => {
    router.push(`/earner/campaigns/${id}`)
  }

  const handleWithdraw = async () => {
    if (!withdrawAmount || Number(withdrawAmount) <= 0) return
    if (Number(withdrawAmount) > stats.balance) {
      alert("Insufficient funds")
      return
    }
    if (Number(withdrawAmount) < minWithdraw) {
      alert(`Minimum withdrawal is ₦${minWithdraw}`)
      return
    }

    setProcessingWithdraw(true)
    try {
      // TODO: backend withdraw API
      await new Promise((r) => setTimeout(r, 900))
      setWithdrawOpen(false)
      setWithdrawAmount("")
      alert("Withdrawal requested — check transaction history")
    } catch (err) {
      console.error(err)
      alert("Withdraw failed")
    } finally {
      setProcessingWithdraw(false)
    }
  }

  // ------------------ UI ------------------
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
        <div className="max-w-[1200px] mx-auto px-4 py-8">
          <div className="flex gap-6 relative z-10">
            {/* Sidebar */}
            <aside
              ref={sidebarRef}
              className={`fixed top-0 left-0 z-50 h-full w-72 bg-white/90 backdrop-blur-sm p-4 transform transition-transform duration-250 ${
                sidebarOpen ? "translate-x-0" : "-translate-x-full"
              }`}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-amber-400 flex items-center justify-center text-stone-900 font-bold overflow-hidden">
                    {profilePic ? (
                      <img
                        src={profilePic}
                        alt={userName}
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-lg">{userName.charAt(0)}</span>
                    )}
                  </div>
                  <div>
                    <div className="text-sm text-stone-500">Welcome back</div>
                    <div className="text-base font-bold text-stone-800">
                      {userName}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-1 rounded hover:bg-stone-100"
                >
                  <X size={18} />
                </button>
              </div>

              <nav className="space-y-2">
                <button
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-stone-100 w-full text-stone-800"
                  onClick={() => {
                    setSidebarOpen(false)
                    router.push("/earner")
                  }}
                >
                  <Home size={16} /> <span className="text-sm">Dashboard</span>
                </button>
                <button
                  onClick={() => {
                    setSidebarOpen(false)
                    router.push("/earner/campaigns")
                  }}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-stone-100 w-full text-stone-800"
                >
                  <Grid size={16} /> <span className="text-sm">Campaigns</span>
                </button>
                <button
                  onClick={() => {
                    setSidebarOpen(false)
                    router.push("/earner/wallet")
                  }}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-stone-100 w-full text-stone-800"
                >
                  <Wallet size={16} /> <span className="text-sm">Wallet</span>
                </button>
                <button
                  onClick={() => {
                    setSidebarOpen(false)
                    router.push("/earner/history")
                  }}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-stone-100 w-full text-stone-800"
                >
                  <Clock size={16} /> <span className="text-sm">History</span>
                </button>
                <button
                  onClick={() => {
                    setSidebarOpen(false)
                    router.push("/earner/profile")
                  }}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-stone-100 w-full text-stone-800"
                >
                  <User size={16} /> <span className="text-sm">Profile</span>
                </button>
              </nav>

              <div className="mt-6 border-t pt-4">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-sm text-stone-800"
                  onClick={handleLogout}
                >
                  <LogOut size={16} className="mr-2" /> Logout
                </Button>
              </div>
            </aside>

            {/* Main content */}
            <main className="flex-1">
              {/* Header */}
              <div className="flex items-center justify-between mb-6 gap-4">
                <div className="flex items-center gap-3">
                  <button
                    className="p-2 rounded bg-white/60"
                    onClick={() => setSidebarOpen((s) => !s)}
                    aria-label="Open menu"
                  >
                    <Menu size={18} />
                  </button>

                  <div
                    className="w-full rounded-xl p-4"
                    style={{
                      background:
                        "linear-gradient(90deg, rgba(30,27,24,0.95), rgba(59,53,47,0.95))",
                      boxShadow: "0 6px 20px rgba(15, 12, 9, 0.08)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-full bg-amber-300 flex items-center justify-center text-stone-900 font-bold text-xl overflow-hidden">
                          {profilePic ? (
                            <img
                              src={profilePic}
                              alt={userName}
                              className="h-14 w-14 rounded-full object-cover"
                            />
                          ) : (
                            <span>{userName.charAt(0)}</span>
                          )}
                        </div>
                        <div>
                          <div className="text-sm text-amber-100/90">
                            {timeGreeting},
                          </div>
                          <div className="text-lg font-bold text-white">
                            {userName}
                          </div>
                          <div className="text-amber-200 text-sm mt-1">
                            Ready to earn? Check new campaigns below.
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="hidden sm:flex flex-col text-right">
                          <span className="text-xs text-amber-100/80">
                            Wallet Balance
                          </span>
                          <span className="text-lg font-bold text-white">
                            ₦{balanceCount.toLocaleString()}
                          </span>
                        </div>

                        <div className="relative" ref={notifyRef}>
                          <button
                            className="p-2 rounded bg-white/6"
                            onClick={() => setNotifyOpen((n) => !n)}
                            aria-label="Notifications"
                          >
                            <Bell size={18} />
                          </button>
                          {notifyOpen && (
                            <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow p-3 text-sm text-stone-800 z-50">
                              <div className="font-semibold mb-2">
                                Notifications
                              </div>
                              <div className="text-xs text-stone-600">
                                No new notifications
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                {/* ... (unchanged stats cards) */}
                <Card className="bg-white/30 backdrop-blur-sm border border-white/8 rounded-2xl overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-sm text-stone-700/90">
                          <span>Available Balance</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button className="p-0.5 rounded hover:bg-stone-100">
                                <Info size={14} className="text-stone-500" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-stone-800 text-amber-200 text-xs px-2 py-1 rounded">
                              Money you can withdraw to your linked bank
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="text-2xl font-extrabold text-stone-900 mt-1">
                          ₦{balanceCount.toLocaleString()}
                        </div>
                        <div className="text-xs text-stone-600 mt-1">
                          Min withdraw: ₦{minWithdraw}
                        </div>
                      </div>
                      <Button
                        className="bg-amber-500 text-stone-900"
                        onClick={() => setWithdrawOpen(true)}
                      >
                        Withdraw
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/20 backdrop-blur-sm border border-white/8 rounded-2xl">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-sm text-stone-700/90">
                          <span>Active Campaigns</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button className="p-0.5 rounded hover:bg-stone-100">
                                <Info size={14} className="text-stone-500" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-stone-800 text-amber-200 text-xs px-2 py-1 rounded">
                              Campaigns you are currently participating in
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="text-xl font-bold text-stone-800 mt-1">
                          {activeCampaignsCount}
                        </div>
                      </div>
                      <Grid size={26} className="text-amber-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/20 backdrop-blur-sm border border-white/8 rounded-2xl">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-sm text-stone-700/90">
                          <span>Leads Generated</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button className="p-0.5 rounded hover:bg-stone-100">
                                <Info size={14} className="text-stone-500" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-stone-800 text-amber-200 text-xs px-2 py-1 rounded">
                              Total leads you have submitted across campaigns
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="text-xl font-bold text-stone-800 mt-1">
                          {leadsGeneratedCount}
                        </div>
                      </div>
                      <TrendingUp size={26} className="text-amber-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/20 backdrop-blur-sm border border-white/8 rounded-2xl">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-sm text-stone-700/90">
                          <span>Leads Paid For</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button className="p-0.5 rounded hover:bg-stone-100">
                                <Info size={14} className="text-stone-500" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-stone-800 text-amber-200 text-xs px-2 py-1 rounded">
                              Leads that advertisers approved and paid you for
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="text-xl font-bold text-stone-800 mt-1">
                          {leadsPaidCount}
                        </div>
                      </div>
                      <CheckCircle size={26} className="text-amber-600" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Campaigns grid */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-stone-800">
                    Available Campaigns
                  </h3>
                  <Input
                    placeholder="Search campaigns"
                    value={searchCampaigns}
                    onChange={(e) => setSearchCampaigns(e.target.value)}
                    className="w-56"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredCampaigns.map((c) => {
                    const percent = c.totalSlots
                      ? Math.round(
                          ((c.totalSlots - (c.slotsLeft ?? 0)) /
                            c.totalSlots) *
                            100
                        )
                      : 0
                    return (
                      <article
                        key={c.id}
                        className="bg-white rounded-xl shadow hover:shadow-lg transition cursor-pointer aspect-square flex flex-col overflow-hidden max-w-[180px] sm:max-w-[200px] md:max-w-[220px] mx-auto"
                        onClick={() => goToCampaign(c.id)}
                      >
                        {/* Image */}
                        <div className="relative h-[60%] w-full overflow-hidden">
                          <img
                            src={c.image || "/placeholders/default.jpg"}
                            alt={c.title}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-2 left-2 px-2 py-1 rounded bg-amber-500 text-stone-900 text-xs font-semibold">
                            {c.category}
                          </div>
                        </div>

                        {/* Content */}
                        <div className="px-2 py-2 flex-1 flex flex-col justify-between">
                          <div>
                            <h4 className="font-semibold text-stone-800 text-sm line-clamp-2">
                              {c.title}
                            </h4>
                            <div className="flex items-center justify-between mt-1 text-xs text-stone-600">
                              <span className="font-medium">
                                ₦{c.reward}
                              </span>
                              <span>{c.slotsLeft} left</span>
                            </div>
                          </div>

                          <div className="mt-2">
                            <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="h-1.5 bg-amber-500"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between mt-1 text-xs">
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  goToCampaign(c.id)
                                }}
                                className="bg-amber-500 text-stone-900 h-6 px-2 text-xs"
                              >
                                Participate
                              </Button>
                              <div className="text-stone-500">
                                {percent}% filled
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>

              {/* Recent activity */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-stone-800">
                    Recent Activity
                  </h3>
                  <Button
                    variant="ghost"
                    onClick={() => router.push("/earner/history")}
                  >
                    View all
                  </Button>
                </div>

                <div className="bg-white rounded-2xl shadow p-3">
                  <div className="divide-y">
                    {recent.map((r) => {
                      // support Firestore Timestamp or ISO/string date
                      const displayDate =
                        r.date && typeof r.date === "object" && "toDate" in r.date
                          ? r.date.toDate().toLocaleDateString()
                          : r.date
                          ? new Date(r.date).toLocaleDateString()
                          : ""
                      return (
                        <div
                          key={r.id}
                          className="flex items-center justify-between p-3"
                        >
                          <div>
                            <div className="font-medium text-stone-800">
                              {r.title}
                            </div>
                            <div className="text-xs text-stone-500">
                              {displayDate}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div
                              className={`text-sm font-semibold ${
                                r.status === "Completed" || r.status === "Paid"
                                  ? "text-green-600"
                                  : r.status === "In Review"
                                  ? "text-yellow-600"
                                  : "text-red-600"
                              }`}
                            >
                              {r.status}
                            </div>
                            <div className="text-stone-800 font-semibold">
                              ₦{r.earned}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </main>
          </div>

          {/* Floating action button */}
          <div
            ref={fabRef}
            className="fixed right-6 bottom-6 z-50 flex flex-col items-end gap-3"
          >
            {fabOpen && (
              <>
                <Button
                  className="bg-white/90 text-stone-900 shadow"
                  onClick={() => {
                    setFabOpen(false)
                    router.push("/earner/profile")
                  }}
                >
                  Profile
                </Button>
                <Button
                  className="bg-white/90 text-stone-900 shadow"
                  onClick={() => {
                    setFabOpen(false)
                    router.push("/earner/history")
                  }}
                >
                  History
                </Button>
              </>
            )}
            <button
              onClick={() => setFabOpen((s) => !s)}
              className="w-14 h-14 rounded-full bg-amber-600 shadow-lg flex items-center justify-center text-white"
              title="Quick actions"
            >
              <Plus size={20} />
            </button>
          </div>

          {/* Withdraw Modal */}
          {withdrawOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-lg">
                <h3 className="text-lg font-semibold text-stone-800 mb-2">
                  Request withdrawal
                </h3>
                <p className="text-sm text-stone-600 mb-4">
                  Enter the amount to withdraw to your linked bank account.
                  Minimum ₦{minWithdraw}.
                </p>
                <Input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) =>
                    setWithdrawAmount(
                      e.target.value === "" ? "" : Number(e.target.value)
                    )
                  }
                  placeholder={`Minimum ₦${minWithdraw}`}
                  className="mb-4"
                />
                <div className="flex items-center justify-between text-sm text-stone-600 mb-4">
                  <div>
                    Available:{" "}
                    <span className="font-semibold text-stone-800">
                      ₦{stats.balance.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    Fee: <span className="font-semibold">₦0</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => setWithdrawOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="w-full bg-amber-500 text-stone-900"
                    onClick={handleWithdraw}
                    disabled={processingWithdraw}
                  >
                    {processingWithdraw ? "Processing..." : "Request Withdraw"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
