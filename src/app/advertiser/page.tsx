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
import BillsCard from '@/components/bills/BillsCard'
import { Button } from "@/components/ui/button"
import Image from "next/image"
import { Menu, X, TrendingUp, Wallet, Users, Plus, LogOut, Grid, Clock, XCircle, CheckCircle } from "lucide-react"
import { calculateWalletBalances } from '@/lib/wallet'
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const sidebarRef = useRef<HTMLDivElement | null>(null)
  const [name, setName] = useState<string>("Advertiser")
  const [profilePic, setProfilePic] = useState("")
  const [activated, setActivated] = useState<boolean>(true)
  const [onboarded, setOnboarded] = useState<boolean>(false)
  const [stats, setStats] = useState({
    balance: 0,
    activeCampaigns: 0,
    leadsGenerated: 0,
    leadsPaidFor: 0,
    campaignSubmitted: 0,
    campaignPending: 0,
    campaignRejected: 0,
    campaignApproved: 0,
  })
  const [filter, setFilter] = useState("Active")
  const [campaigns, setCampaigns] = useState<Campaign[]>([])

  useEffect(() => {
    let unsubCampaigns: (() => void) | null = null
    let unsubWithdrawals: (() => void) | null = null
    let unsubReroutes: (() => void) | null = null
    let unsubResumed: (() => void) | null = null

    const unsubAuth = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        router.push("/auth/sign-in")
        return
      }

      // Profile
      const ref = doc(db, "advertisers", u.uid)
      const snap = await getDoc(ref)
      if (snap.exists()) {
        setName(snap.data().name || "Advertiser")
        setProfilePic(snap.data().profilePic || "")
        setActivated(Boolean(snap.data().activated))
        setOnboarded(Boolean(snap.data().onboarded))
      }

      // Campaigns
      const q = query(collection(db, "campaigns"), where("ownerId", "==", u.uid))
      unsubCampaigns = onSnapshot(q, (snapshot) => {
        const data: Campaign[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<Campaign, "id">),
        }))
        setCampaigns(data)
        setStats((prev) => ({
          ...prev,
          activeCampaigns: data.filter((c) => c.status === "Active").length,
          leadsPaidFor: data.reduce((sum, c) => sum + (c.estimatedLeads || 0), 0),
          leadsGenerated: data.reduce((sum, c) => sum + (c.generatedLeads || 0), 0),
        }))

        // submissions summary
        data.forEach((c) => {
          const subsQ = query(collection(db, "earnerSubmissions"), where("campaignId", "==", c.id))
          onSnapshot(subsQ, (ssnap) => {
            type Sub = { status?: string }
            const subs = ssnap.docs.map((d) => d.data() as Sub)
            setStats((prev) => ({
              ...prev,
              campaignSubmitted: subs.length,
              campaignPending: subs.filter((s) => s.status === "Pending" || s.status === "In Review").length,
              campaignRejected: subs.filter((s) => s.status === "Rejected").length,
              campaignApproved: subs.filter((s) => ["Completed", "Paid", "Verified"].includes(s.status || "")).length,
            }))
          })
        })
      })

      // Withdrawals
      const wq = query(collection(db, "withdrawals"), where("userId", "==", u.uid))
      unsubWithdrawals = onSnapshot(wq, () => {
        // compute balance after we have reroutes/resumed
      })

      // Reroutes
      const rq = query(collection(db, "reroutes"), where("userId", "==", u.uid))
      unsubReroutes = onSnapshot(rq, () => {
        // compute balance after we have withdrawals/resumed
      })

      // Resumed campaigns
      const rsq = query(collection(db, "resumedCampaigns"), where("userId", "==", u.uid))
      unsubResumed = onSnapshot(rsq, () => {
        // compute balance after we have campaigns/withdrawals/reroutes
      })

      // Instead of individually setting inside each listener above, create a join: listen to campaigns + withdrawals + reroutes + resumed by reading them once and recomputing when any changes.
      // We'll re-use the campaign listener's snapshot to compute; set up helper refs to current arrays
  type Withdrawal = { id: string; amount: number; status?: string; createdAt?: unknown }
  type Reroute = { id: string; reroutes?: { campaignId: string; amount: number }[]; status?: string; createdAt?: unknown }
  type Resumed = { id: string; amountUsed?: number; status?: string }

      const current = {
        campaigns: [] as Campaign[],
        withdrawals: [] as Withdrawal[],
        reroutes: [] as Reroute[],
        resumed: [] as Resumed[],
      }

      // helper to compute when arrays update
      const recompute = () => {
        const result = calculateWalletBalances(current.campaigns, current.withdrawals, current.reroutes, current.resumed)
        setStats((prev) => ({ ...prev, balance: result.refundableBalance }))
      }

      // wire the existing snapshots to update 'current' and recompute
      // campaigns handler (replace above inline behaviour)
      if (unsubCampaigns) {
        // replace with a fresh onSnapshot that updates current.campaigns and recomputes
        if (unsubCampaigns) unsubCampaigns()
        unsubCampaigns = onSnapshot(q, (snapshot) => {
    current.campaigns = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Campaign, 'id'>) }))
          // update stats counts from campaigns
          setCampaigns(current.campaigns as Campaign[])
          setStats((prev) => ({
            ...prev,
            activeCampaigns: current.campaigns.filter((c) => c.status === "Active").length,
            leadsPaidFor: current.campaigns.reduce((s, c) => s + (c.estimatedLeads || 0), 0),
            leadsGenerated: current.campaigns.reduce((s, c) => s + (c.generatedLeads || 0), 0),
          }))
          recompute()
        })
      }

      if (unsubWithdrawals) {
        if (unsubWithdrawals) unsubWithdrawals()
        unsubWithdrawals = onSnapshot(wq, (snap) => {
          current.withdrawals = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Withdrawal, 'id'>) }))
          recompute()
        })
      }

      if (unsubReroutes) {
        if (unsubReroutes) unsubReroutes()
        unsubReroutes = onSnapshot(rq, (snap) => {
          current.reroutes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Reroute, 'id'>) }))
          recompute()
        })
      }

      if (unsubResumed) {
        if (unsubResumed) unsubResumed()
        unsubResumed = onSnapshot(rsq, (snap) => {
          current.resumed = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Resumed, 'id'>) }))
          recompute()
        })
      }
    })

    return () => {
      unsubAuth()
      if (unsubCampaigns) unsubCampaigns()
      if (unsubWithdrawals) unsubWithdrawals()
      if (unsubReroutes) unsubReroutes()
      if (unsubResumed) unsubResumed()
    }
  }, [router])

  const handleLogout = async () => {
    await signOut(auth)
    router.push("/auth/sign-in")
  }

  // Stats cards
  const statCards = [
    {
      title: "Available Balance",
      value: `₦${stats.balance.toLocaleString()}`,
      icon: Wallet,
      action: () => router.push("/advertiser/wallet"),
      actionLabel: "Fund Wallet",
    },
    {
      title: "Active Tasks",
      value: stats.activeCampaigns,
      icon: TrendingUp,
      action: () => router.push("/advertiser/campaigns"),
      actionLabel: "View Tasks",
    },
    {
      title: "Leads Paid For",
      value: stats.leadsPaidFor,
      icon: Users,
    },
    {
      title: "Leads Generated",
      value: stats.leadsGenerated,
      icon: Users,
    },
    // {
    //   title: "Tasks Submitted",
    //   value: stats.campaignSubmitted,
    //   icon: Grid,
    // },
    // {
    //   title: "Pending Submissions",
    //   value: stats.campaignPending,
    //   icon: Clock,
    // },
    // {
    //   title: "Rejected Submissions",
    //   value: stats.campaignRejected,
    //   icon: XCircle,
    // },
    // {
    //   title: "Approved Submissions",
    //   value: stats.campaignApproved,
    //   icon: CheckCircle,
    // },
  ]

  // If advertiser is not activated, show a quick action banner
  const ActivationBanner = () => {
    if (activated) return null
    // If not onboarded, send them to onboarding. If onboarded but not activated, open Paystack inline to pay ₦2,000
    const handleActivation = async () => {
      const u = auth.currentUser
      if (!u || !u.email) {
        toast.error('You must be logged in to activate')
        return
      }
      if (!onboarded) {
        router.push('/advertiser/onboarding')
        return
      }

      if (!process.env.NEXT_PUBLIC_PAYSTACK_KEY) {
        toast.error('Payment configuration error')
        return
      }

      try {
        if (!document.querySelector('script[src*="paystack.co"]')) {
          const script = document.createElement('script')
          script.src = 'https://js.paystack.co/v1/inline.js'
          document.head.appendChild(script)
          await new Promise((resolve, reject) => {
            script.onload = resolve
            script.onerror = () => reject(new Error('Failed to load Paystack'))
          })
        }

        const PaystackPop = (window as any).PaystackPop
        const handler = PaystackPop.setup({
          key: process.env.NEXT_PUBLIC_PAYSTACK_KEY,
          email: u.email,
          amount: 2000 * 100,
          currency: 'NGN',
          label: 'Advertiser Account Activation',
          metadata: { userId: u.uid },
          onClose: () => toast.error('Activation cancelled'),
          callback: function(resp: { reference: string }) {
            fetch('/api/advertiser/activate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reference: resp.reference, userId: u.uid }),
            })
            .then(async (res) => {
              if (res.ok) {
                toast.success('Account activated successfully')
                setActivated(true)
                return
              }
              const data = await res.json().catch(() => ({}))
              throw new Error(data?.message || 'Activation verification failed')
            })
            .catch((err) => {
              console.error('Activation verify error', err)
              toast.error(err.message || 'Activation verification failed')
            })
          }
        })
        handler.openIframe()
      } catch (err) {
        console.error('Activation error', err)
        toast.error('Activation failed')
      }
    }

    return (
      <div className="col-span-full bg-amber-50 border border-amber-100 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-stone-800">Account Not Activated</div>
            <div className="text-sm text-stone-600">You must activate your advertiser account (₦2,000) before creating tasks.</div>
          </div>
          <div>
            <Button className="bg-amber-500 text-stone-900" onClick={handleActivation}>Activate Account</Button>
          </div>
        </div>
      </div>
    )
  }

  const filteredCampaigns = campaigns.filter(
    (c) => c.status.toLowerCase() === filter.toLowerCase()
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300 flex flex-col">
      {/* Header */}
      <header className="flex justify-between items-center px-6 py-4 bg-white/60 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="p-2 bg-white rounded-lg shadow"
          >
            <Menu size={20} />
          </button>
          <h1 className="font-semibold text-stone-800 text-lg">Advertiser Dashboard</h1>
        </div>

        {/* Bills & Utilities (moved into top stat cards) */}
        <div className="h-10 w-10 rounded-full overflow-hidden border-2 border-amber-400">
          {profilePic ? (
            <Image src={profilePic} alt="profile" width={80} height={80} className="w-full h-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-amber-300 font-bold text-stone-900">
              {name.charAt(0)}
            </div>
          )}
        </div>
      </header>

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
          {/* ...existing code for nav items... */}
          {[
            { label: "Dashboard", path: "/advertiser" },
            { label: "Tasks", path: "/advertiser/campaigns" },
            { label: "Wallet", path: "/advertiser/wallet" },
            { label: "Bank", path: "/advertiser/bank" },
            { label: "Transactions", path: "/advertiser/transactions" },
            { label: "Referrals", path: "/advertiser/referrals" },
            { label: "Task Price List", path: "/advertiser/pricelist" },
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

      <main className="flex-1 px-6 py-8 max-w-6xl mx-auto w-full">
        {/* Top Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          {statCards.map((card, i) => (
            <Card key={i} className="bg-white/70 backdrop-blur border-none shadow-md hover:shadow-lg transition-all">
              <CardContent className="p-6 flex items-center gap-5">
                <div className="p-3 bg-amber-200 rounded-2xl">
                  <card.icon size={28} className="text-amber-700" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm text-stone-600 font-medium">{card.title}</h3>
                  <p className="text-2xl font-bold text-stone-900">{card.value}</p>
                  {card.action && (
                    <Button
                      size="sm"
                      className="bg-amber-500 text-stone-900 mt-3"
                      onClick={card.action}
                    >
                      {card.actionLabel}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Bills card */}
          <div>
            <BillsCard />
          </div>
        </div>

        {/* Activation banner (if needed) */}
        {ActivationBanner()}

        {/* Tasks Section */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-stone-800">Your Tasks</h2>
          <Link href="/advertiser/create-campaign">
            <Button className="bg-amber-500 text-stone-900 hover:bg-amber-600 flex items-center gap-2">
              <Plus size={16} />
              Create Task
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
                      <div className="w-full aspect-square relative h-0" style={{ paddingBottom: '100%' }}>
                        <Image src={c.bannerUrl || '/placeholders/default.jpg'} alt={c.title} fill className="absolute inset-0 object-cover" />
                      </div>
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
                        <span>₦{c.budget.toLocaleString()}</span>
                        <span>{(c.estimatedLeads || 0).toLocaleString()} leads</span>
                      </div>

                      {total > 0 && (
                        <div className="w-full bg-stone-200 rounded-full h-1.5 mt-2">
                          <div
                            className="h-1.5 bg-amber-500 rounded-full transition-all duration-300"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              )
            })
          ) : (
            <div className="col-span-full flex flex-col items-center justify-center py-12">
              <p className="text-lg text-stone-600 mb-3">No {filter} tasks found.</p>
              <Link href="/advertiser/create-campaign">
                <Button className="bg-amber-500 text-stone-900 hover:bg-amber-600 font-semibold px-6 py-3 rounded-xl shadow">
                  <Plus size={18} className="mr-2" /> Create Your First Task
                </Button>
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
