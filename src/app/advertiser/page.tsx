"use client"

import React, { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { signOut } from "firebase/auth"
import { auth, db } from "@/lib/firebase"
import toast, { Toaster } from "react-hot-toast"
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
} from "firebase/firestore"

import { Card, CardContent } from "@/components/ui/card"
import BillsCard from '@/components/bills/BillsCard'
import { Button } from "@/components/ui/button"
import { PaymentSelector } from '@/components/payment-selector'
import Image from "next/image"
import { Menu, X, TrendingUp, Wallet, Users, Plus, LogOut } from "lucide-react"
import { calculateWalletBalances } from '@/lib/wallet'
import Link from "next/link"
import WhatsAppChatButton from "@/components/WhatsAppChatButton"
import { summarizeCampaignProgress } from "@/lib/campaign-progress"
import { registerActivationReference } from "@/lib/activation-client"
import { ADVERTISER_ACTIVATION_REQUIRED } from "@/lib/platform-config"

const ADVERTISER_WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/F74HRQikOvnDHCIVChjZRw?mode=gi_t"

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
  costPerLead?: number
  originalBudget?: number
}

type Submission = {
  id: string
  campaignId?: string
  status?: string
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
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [showActivationPaymentSelector, setShowActivationPaymentSelector] = useState(false)
  const [showAdvertiserGroupPrompt, setShowAdvertiserGroupPrompt] = useState(false)
  const activationReloadedRef = useRef(false)
  const previousActivatedRef = useRef<boolean | null>(null)

  useEffect(() => {
    try {
      const dismissed = window.sessionStorage.getItem("pamba-advertiser-whatsapp-dismissed")
      if (!dismissed) {
        setShowAdvertiserGroupPrompt(true)
      }
    } catch {
      setShowAdvertiserGroupPrompt(true)
    }
  }, [])

  const dismissAdvertiserGroupPrompt = () => {
    setShowAdvertiserGroupPrompt(false)
    try {
      window.sessionStorage.setItem("pamba-advertiser-whatsapp-dismissed", "1")
    } catch {
      // ignore storage failures
    }
  }

  useEffect(() => {
    let unsubProfile: (() => void) | null = null
    let unsubCampaigns: (() => void) | null = null
    let unsubWithdrawals: (() => void) | null = null
    let unsubReroutes: (() => void) | null = null
    let unsubResumed: (() => void) | null = null
    let unsubSubmissions: (() => void) | null = null

    const unsubAuth = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        router.replace("/auth/sign-in")
        return
      }
      if (!u.emailVerified) {
        router.replace("/auth/verify-email")
        return
      }

      // Profile
      const ref = doc(db, "advertisers", u.uid)
      unsubProfile = onSnapshot(ref, (snap) => {
        if (!snap.exists()) return
        const profileData = snap.data()
        const nextActivated = ADVERTISER_ACTIVATION_REQUIRED ? Boolean(profileData.activated) : true

        if (!profileData.onboarded) {
          router.replace("/advertiser/onboarding")
          return
        }

        setName(profileData.name || "Advertiser")
        setProfilePic(profileData.profilePic || "")
        setActivated(nextActivated)
        setOnboarded(Boolean(profileData.onboarded))
        const profBal = Number(profileData.balance || 0)
        setStats((prev) => ({ ...prev, balance: profBal }))

        if (
          ADVERTISER_ACTIVATION_REQUIRED &&
          previousActivatedRef.current === false &&
          nextActivated &&
          !activationReloadedRef.current
        ) {
          activationReloadedRef.current = true
          toast.success("Your advertiser account is now activated. Refreshing your dashboard...")
          setTimeout(() => window.location.reload(), 700)
        }

        previousActivatedRef.current = nextActivated
      })

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

      unsubSubmissions = onSnapshot(
        query(collection(db, "earnerSubmissions"), where("advertiserId", "==", u.uid)),
        (snapshot) => {
          const data: Submission[] = snapshot.docs.map((submissionDoc) => ({
            id: submissionDoc.id,
            campaignId: String(submissionDoc.data().campaignId || ""),
            status: String(submissionDoc.data().status || ""),
          }))
          setSubmissions(data)
          setStats((prev) => ({
            ...prev,
            leadsGenerated: data.filter((submission) => submission.status === "Verified").length,
            campaignSubmitted: data.length,
            campaignPending: data.filter((submission) => submission.status === "Pending" || submission.status === "In Review").length,
            campaignRejected: data.filter((submission) => submission.status === "Rejected").length,
            campaignApproved: data.filter((submission) => ["Completed", "Paid", "Verified"].includes(submission.status || "")).length,
          }))
        }
      )

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
         // Recompute derived transaction totals if needed but do not
         // overwrite the dashboard `stats.balance` which should come
         // from the advertiser profile (server source-of-truth).
         calculateWalletBalances(
           current.campaigns,
           current.withdrawals,
           current.reroutes,
           current.resumed
         )
      }

      // wire the existing snapshots to update 'current' and recompute
      // campaigns handler (replace above inline behaviour)
        if (unsubCampaigns) {
        // replace with a fresh onSnapshot that updates current.campaigns and recomputes
        if (unsubCampaigns) unsubCampaigns()
        unsubCampaigns = onSnapshot(q, (snapshot) => {
      current.campaigns = snapshot.docs.map((d) => {
            const docData = d.data() as Omit<Campaign, 'id'>
            return { id: d.id, ...docData }
          })
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
      previousActivatedRef.current = null
      activationReloadedRef.current = false
      if (unsubCampaigns) unsubCampaigns()
      if (unsubWithdrawals) unsubWithdrawals()
      if (unsubReroutes) unsubReroutes()
      if (unsubResumed) unsubResumed()
      if (unsubSubmissions) unsubSubmissions()
      if (unsubProfile) unsubProfile()
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
    if (!ADVERTISER_ACTIVATION_REQUIRED) return null
    if (activated) return null
    // If not onboarded, send them to onboarding. If onboarded but not activated, open payment selector
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

      // Open PaymentSelector to allow Paystack or Monnify
      setShowActivationPaymentSelector(true)
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
    (c) => c.status.toLowerCase() === "active"
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300 flex flex-col">
      <Toaster />
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
        <div className="mb-8 rounded-3xl border border-white/40 bg-white/55 p-6 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">Welcome back</p>
          <h2 className="mt-2 text-3xl font-semibold text-stone-900">{name}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            Your dashboard is ready for campaign planning. Track wallet health, monitor live results, and launch the next task when you are ready.
          </p>
        </div>
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
        {showActivationPaymentSelector && (
          <PaymentSelector
            open={showActivationPaymentSelector}
            amount={2000}
            email={auth.currentUser?.email || undefined}
            fullName={auth.currentUser?.displayName || 'Advertiser'}
            description="Advertiser Account Activation"
            onClose={() => setShowActivationPaymentSelector(false)}
            onMonnifyReferenceCreated={async (reference: string) => {
              await registerActivationReference({ role: 'advertiser', reference, provider: 'monnify' })
            }}
            onPaymentSuccess={async (reference: string, provider: 'paystack' | 'monnify', monnifyResponse?: Record<string, unknown>) => {
              setShowActivationPaymentSelector(false)
              try {
                const res = await fetch('/api/advertiser/activate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ reference, userId: auth.currentUser?.uid, provider, monnifyResponse }),
                })
                const data = await res.json().catch(() => ({}))
                if (res.ok && data?.success) {
                  if (data.pendingConfirmation) {
                    toast.success('Payment received. Your account will activate after Monnify confirms it.')
                  } else {
                    toast.success('Activation successful')
                    setActivated(true)
                  }
                } else {
                  toast.error(data?.message || 'Activation failed')
                }
              } catch (err) {
                console.error('Activation error', err)
                toast.error('Activation request failed')
              }
            }}
          />
        )}

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
        {/* <div className="flex gap-2 mb-6">
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
        </div> */}

        {/* Campaigns Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {filteredCampaigns.length > 0 ? (
            filteredCampaigns.map((c) => {
              const progress = summarizeCampaignProgress({
                target: c.estimatedLeads,
                generatedLeads: c.generatedLeads,
                submissions: submissions.filter((submission) => submission.campaignId === c.id),
              })

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
                                <span>₦{(Number(c.originalBudget || (Number(c.budget || 0) + Number(c.reservedBudget || 0)))).toLocaleString()}</span>
                                <span>{progress.target.toLocaleString()} leads</span>
                              </div>
                      <p className="mt-2 text-xs text-stone-600">
                        {progress.verified} verified
                        {progress.pending > 0 ? ` • ${progress.pending} pending` : ""}
                      </p>

                      {progress.target > 0 && (
                        <div className="w-full bg-stone-200 rounded-full h-1.5 mt-2">
                          <div
                            className="h-1.5 bg-amber-500 rounded-full transition-all duration-300"
                            style={{ width: `${progress.progressPercent}%` }}
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
              <p className="text-lg text-stone-600 mb-3">No active tasks found.</p>
              <Link href="/advertiser/create-campaign">
                <Button className="bg-amber-500 text-stone-900 hover:bg-amber-600 font-semibold px-6 py-3 rounded-xl shadow">
                  <Plus size={18} className="mr-2" /> Create Your First Task
                </Button>
              </Link>
            </div>
          )}
        </div>
      </main>
      {showAdvertiserGroupPrompt && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-stone-950/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[28px] border border-amber-200/20 bg-gradient-to-br from-stone-900 via-stone-800 to-stone-900 p-7 text-white shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-300">Advertiser Updates</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-white">
              Join the advertiser WhatsApp group for campaign updates.
            </h2>
            <p className="mt-4 text-sm leading-7 text-stone-300">
              Stay close to product updates, campaign tips, wallet notices, and important advertiser announcements without waiting to hear about them later.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href={ADVERTISER_WHATSAPP_GROUP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-full bg-amber-400 px-5 py-3 text-sm font-semibold text-stone-900 transition hover:bg-amber-300"
              >
                Join advertiser group
              </a>
              <button
                type="button"
                onClick={dismissAdvertiserGroupPrompt}
                className="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm font-medium text-white transition hover:border-amber-300 hover:text-amber-200"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
      <WhatsAppChatButton />
    </div>
  )
}
