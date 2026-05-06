"use client"

import React, { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { signOut } from "firebase/auth"
import { auth, db } from "@/lib/firebase"

// Activity type removed (we now use earnerSubmissions and earnerTransactions directly)
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore"
import Image from "next/image"
import toast from 'react-hot-toast'
import { Card, CardContent } from "@/components/ui/card"
import BillsCard from '@/components/bills/BillsCard'
import { Button } from "@/components/ui/button"
import {
  Wallet,
  TrendingUp,
  Users,
  ArrowDownCircle,
  Grid,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Menu,
  X,
  LogOut,
  User,
  ListChecks,
  Landmark,
  Gift,
  LayoutDashboard,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import WhatsAppChatButton from "@/components/WhatsAppChatButton"
import HomepageDirectAds from "@/components/homepage/HomepageDirectAds"

const EARNER_WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/CItU3jY1oP2GF6wOZA2eKC"
const EARNER_WHATSAPP_JOINED_KEY = "pamba-earner-whatsapp-joined"

type WithdrawRecord = {
  id: string
  amount: number
  createdAt?: import("firebase/firestore").Timestamp | Date | { seconds: number; nanoseconds: number } | string | undefined
  status?: string
}



export default function EarnerDashboard() {
  const router = useRouter()
  const [userName, setUserName] = useState("User")
  const [profilePic, setProfilePic] = useState("")
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
  const [activated, setActivated] = useState<boolean>(false)
  const [strikeCount, setStrikeCount] = useState<number>(0)
  const [accountStatus, setAccountStatus] = useState<string>('active')

  const [totalEarned, setTotalEarned] = useState(0)
  const [withdrawHistory, setWithdrawHistory] = useState<WithdrawRecord[]>([])
  const [referralStats, setReferralStats] = useState({ totalReferrals: 0, completedReferrals: 0, pendingBonuses: 0, totalReferralEarnings: 0 })
  const [rotIdx, setRotIdx] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showEarnerGroupPrompt, setShowEarnerGroupPrompt] = useState(false)
  const activationReloadedRef = useRef(false)
  const previousActivatedRef = useRef<boolean | null>(null)

  useEffect(() => {
    try {
      const joined = window.localStorage.getItem(EARNER_WHATSAPP_JOINED_KEY)
      if (!joined) setShowEarnerGroupPrompt(true)
    } catch {
      setShowEarnerGroupPrompt(true)
    }
  }, [])

  const dismissEarnerGroupPrompt = () => {
    setShowEarnerGroupPrompt(false)
  }

  const markEarnerGroupJoined = () => {
    setShowEarnerGroupPrompt(false)
    try {
      window.localStorage.setItem(EARNER_WHATSAPP_JOINED_KEY, "1")
    } catch {
      // ignore storage failures
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        // Use replace instead of push to prevent back navigation
        router.replace("/auth/sign-in")
        return
      }
      if (!u.emailVerified) {
        router.replace("/auth/verify-email")
        return
      }
      
      // Check if user exists in earners collection
      const earnerDoc = await getDoc(doc(db, "earners", u.uid))
      if (!earnerDoc.exists()) {
        router.replace("/auth/sign-in")
        return
      }
      if (!earnerDoc.data()?.onboarded) {
        router.replace("/earner/onboarding")
        return
      }
      // Profile and stats
          const unsubProfile = onSnapshot(doc(db, "earners", u.uid), (snap) => {
        if (snap.exists()) {
          const d = snap.data()
          setUserName(d.fullName || d.name || "User")
          setProfilePic(d.profilePic || "")
          setStats((prev) => ({
            ...prev,
            balance: d.balance || 0,
            activeCampaigns: d.activeCampaigns || 0,
            leadsGenerated: d.leadsGenerated || 0,
            leadsPaidFor: d.leadsPaidFor || 0,
          }))
          const nextActivated = !!d.activated
          setActivated(nextActivated)
          setStrikeCount(Number(d.strikeCount || 0))
          setAccountStatus(String(d.status || 'active'))

          if (
            previousActivatedRef.current === false &&
            nextActivated &&
            !activationReloadedRef.current
          ) {
            activationReloadedRef.current = true
            toast.success("Your account is now activated. Refreshing your dashboard...")
            setTimeout(() => window.location.reload(), 700)
          }

          previousActivatedRef.current = nextActivated
        }
      })

      // Withdrawals
      const unsubWithdraws = onSnapshot(
        query(collection(db, "earnerWithdrawals"), where("userId", "==", u.uid), limit(150)),
        (snap) => {
          const data = snap.docs.map((d) => {
            const dat = d.data() as Partial<WithdrawRecord>;
            return {
              id: d.id,
              amount: dat.amount || 0,
              createdAt: dat.createdAt,
              status: dat.status,
            } as WithdrawRecord;
          })
          setWithdrawHistory(data as WithdrawRecord[])
        }
      )

      // Campaign submissions (use earnerSubmissions collection to reflect actual submitted/approved/rejected statuses)
      const unsubSubmissions = onSnapshot(
        query(collection(db, "earnerSubmissions"), where("userId", "==", u.uid), limit(250)),
        (snap) => {
          type Sub = { id: string; status?: string }
          const subs: Sub[] = snap.docs.map((d) => {
            const data = d.data() as Sub
            return { id: d.id, status: data.status }
          })
          const submitted = subs.length
          const pending = subs.filter((s) => s.status === "Pending" || s.status === "In Review").length
          const rejected = subs.filter((s) => s.status === "Rejected").length
          const approved = subs.filter((s) => ["Completed", "Paid", "Verified"].includes(s.status || "")).length

          setStats((prev) => ({
            ...prev,
            campaignSubmitted: submitted,
            campaignPending: pending,
            campaignRejected: rejected,
            campaignApproved: approved,
          }))
        }
      )

      // Transactions (compute total earned from earnerTransactions)
      const unsubTx = onSnapshot(
        query(collection(db, "earnerTransactions"), where("userId", "==", u.uid), limit(250)),
        (snap) => {
          type Tx = { id: string; amount?: number; type?: string }
          const txs: Tx[] = snap.docs.map((d) => {
            const data = d.data() as Tx
            return { id: d.id, amount: data.amount, type: data.type }
          })
          const earned = txs.reduce((s, t) => s + (Number(t.amount) > 0 ? Number(t.amount) : 0), 0)
          const paidLeads = txs.filter((t) => t.type === "lead" || t.type === "payment").length
          setTotalEarned(earned)
          setStats((prev) => ({ ...prev, leadsPaidFor: paidLeads || prev.leadsPaidFor }))
        }
      )

      // Referrals
      const unsubReferrals = onSnapshot(
        query(collection(db, "referrals"), where("referrerId", "==", u.uid), limit(250)),
        (snap) => {
          const totalReferrals = snap.size
          let completedReferrals = 0
          let pendingBonuses = 0
          let earnings = 0
          snap.docs.forEach((d) => {
            type ReferralRecord = { status?: string; amount?: number; bonusPaid?: boolean }
            const r = d.data() as ReferralRecord
            const amount = Number(r.amount || 0)
            if (r.status === 'completed') {
              completedReferrals += 1
              earnings += amount
            }
            if (!r.bonusPaid) pendingBonuses += amount
          })
          setReferralStats({ totalReferrals, completedReferrals, pendingBonuses, totalReferralEarnings: earnings })
        }
      )

      return () => {
        unsubProfile()
        unsubWithdraws()
        unsubSubmissions()
        unsubTx()
        unsubReferrals()
      }
    })
    return () => unsub()
  }, [router])

  useEffect(() => {
    const t = setInterval(() => setRotIdx((i) => (i + 1) % 3), 3500)
    return () => clearInterval(t)
  }, [])

  const totalWithdrawn = withdrawHistory.reduce((s, w) => s + (Number(w.amount) || 0), 0)
  const lastWithdraw = withdrawHistory[0]
  // Use referralStats and stats for cards

  const handleLogout = async () => {
    await signOut(auth)
    router.push("/auth/sign-in")
  }

  const handleGoToTasks = () => {
    if (accountStatus === 'suspended') {
      toast.error('Your account is suspended. Please contact support for review.')
      return
    }
    router.push("/earner/campaigns")
  }

  const earnerNavSections = [
    {
      title: "Overview",
      items: [
        { label: "Dashboard", path: "/earner", icon: LayoutDashboard },
        { label: "Available Tasks", path: "/earner/campaigns", icon: Grid },
        { label: "Done Tasks", path: "/earner/campaigns/done", icon: ListChecks },
      ],
    },
    {
      title: "Wallet",
      items: [
        { label: "Transactions", path: "/earner/transactions", icon: Wallet },
        { label: "Bank Accounts", path: "/earner/bank", icon: Landmark },
        { label: "Task Price List", path: "/earner/pricelist", icon: ArrowDownCircle },
      ],
    },
    {
      title: "Account",
      items: [
        { label: "Referrals", path: "/earner/referrals", icon: Gift },
        { label: "Profile", path: "/earner/profile", icon: User },
      ],
    },
  ]

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
          <h1 className="font-semibold text-stone-800 text-lg">Earner Dashboard</h1>
        </div>

        {/* Bills & Utilities (moved into cards) */}
        <div className="h-10 w-10 rounded-full overflow-hidden border-2 border-amber-400">
          {profilePic ? (
            <Image src={profilePic} alt="profile" width={80} height={80} className="w-full h-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-amber-300 font-bold text-stone-900">
              {userName.charAt(0)}
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 px-6 py-8 max-w-6xl mx-auto w-full">
  <div className="mb-8 rounded-3xl border border-white/40 bg-white/55 p-6 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">Welcome back</p>
          <h2 className="mt-2 text-3xl font-semibold text-stone-900">{userName}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            {activated
              ? "Keep the momentum going. Check fresh tasks, track your proof queue, and keep earning."
              : "Keep the momentum going. Check fresh tasks, track your proof queue, and keep earning. Your first ₦2,000 earned will activate your account automatically."}
          </p>
        </div>
  {/* Top Cards */}
  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          {/* Balance */}
          <Card className="bg-white/70 backdrop-blur border-none shadow-md hover:shadow-lg transition-all">
            <CardContent className="p-6 flex items-center gap-5">
              <div className="p-3 bg-amber-200 rounded-2xl">
                <Wallet size={28} className="text-amber-700" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm text-stone-600 font-medium">Available Balance</h3>
                <p className="text-2xl font-bold text-stone-900">
                  ₦{stats.balance.toLocaleString()}
                </p>
                {!activated ? (
                  <p className="mt-2 text-xs leading-5 text-stone-600">
                    Until your account activates automatically from your first ₦2,000 earned, you can do tasks normally but cannot withdraw or use wallet funds for bills.
                  </p>
                ) : null}
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button
                      size="sm"
                      className="bg-amber-500 text-stone-900 flex-none"
                      onClick={() => router.push("/earner/transactions")}
                    >
                      Withdraw
                    </Button>
                    <Button size="sm" variant="outline" className="flex-none" onClick={handleGoToTasks}>Perform Tasks</Button>
                  </div>
                  {accountStatus === 'suspended' ? (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      Your account is currently suspended. Please contact support for review.
                    </div>
                  ) : strikeCount > 0 ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      You have {strikeCount} strike{strikeCount === 1 ? '' : 's'}. Repeated rejected submissions can lead to suspension.
                    </div>
                  ) : null}
              </div>
            </CardContent>
          </Card>

          {/* Bills card */}
          <div>
            <BillsCard />
          </div>

          {/* Rotating middle card with Framer Motion */}
          <Card className="bg-white/70 backdrop-blur border-none shadow-md hover:shadow-lg transition-all relative overflow-hidden">
            <CardContent className="p-6">
              <AnimatePresence mode="wait">
                {rotIdx === 0 && (
                  <motion.div
                    key="total"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.5 }}
                    className="flex items-center gap-4"
                  >
                    <div className="p-3 bg-green-200 rounded-2xl">
                      <TrendingUp size={28} className="text-green-800" />
                    </div>
                    <div>
                      <h3 className="text-sm text-stone-600 font-medium">Total Withdrawn</h3>
                      <p className="text-2xl font-bold text-stone-900">
                        ₦{totalWithdrawn.toLocaleString()}
                      </p>
                    </div>
                  </motion.div>
                )}

                {rotIdx === 1 && (
                  <motion.div
                    key="last"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.5 }}
                    className="flex items-center gap-4"
                  >
                    <div className="p-3 bg-blue-200 rounded-2xl">
                      <ArrowDownCircle size={28} className="text-blue-800" />
                    </div>
                    <div>
                      <h3 className="text-sm text-stone-600 font-medium">Last Withdraw</h3>
                      <p className="text-xl font-bold text-stone-900">
                        ₦
                        {lastWithdraw
                          ? Number(lastWithdraw.amount).toLocaleString()
                          : "0"}
                      </p>
                    </div>
                  </motion.div>
                )}

                {rotIdx === 2 && (
                  <motion.div
                    key="ref"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.5 }}
                    className="flex items-center gap-4"
                  >
                    <div className="p-3 bg-amber-200 rounded-2xl">
                      <Users size={28} className="text-amber-800" />
                    </div>
                    <div>
                      <h3 className="text-sm text-stone-600 font-medium">Referrals</h3>
                      <p className="text-2xl font-bold text-stone-900">
                        {referralStats.completedReferrals} / {referralStats.totalReferrals}
                      </p>
                      <p className="text-xs text-stone-600 mt-1">
                        Completed referrals / total
                      </p>
                      <p className="text-xs text-stone-600 mt-1">
                        Earnings: ₦{referralStats.totalReferralEarnings.toLocaleString()}
                      </p>
                      <p className="text-xs text-stone-600 mt-1">
                        Pending bonuses: ₦{referralStats.pendingBonuses}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>

          {/* Total Earned */}
          <Card className="bg-white/70 backdrop-blur border-none shadow-md hover:shadow-lg transition-all">
            <CardContent className="p-6 flex items-center gap-5">
              <div className="p-3 bg-purple-200 rounded-2xl">
                <CheckCircle size={28} className="text-purple-800" />
              </div>
              <div>
                <h3 className="text-sm text-stone-600 font-medium">Total Earned</h3>
                <p className="text-2xl font-bold text-stone-900">
                  ₦{Number(totalEarned || 0).toLocaleString()}
                </p>
                <p className="text-xs text-stone-500 mt-1">
                  Paid leads: {stats.leadsPaidFor}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Strike Count */}
          <Card className="bg-white/70 backdrop-blur border-none shadow-md hover:shadow-lg transition-all">
            <CardContent className="p-6 flex items-center gap-5">
              <div className={`p-3 rounded-2xl ${accountStatus === 'suspended' ? 'bg-red-200' : strikeCount > 0 ? 'bg-amber-200' : 'bg-stone-200'}`}>
                <AlertTriangle size={28} className={`${accountStatus === 'suspended' ? 'text-red-800' : strikeCount > 0 ? 'text-amber-800' : 'text-stone-700'}`} />
              </div>
              <div>
                <h3 className="text-sm text-stone-600 font-medium">Strike Count</h3>
                <p className="text-2xl font-bold text-stone-900">
                  {strikeCount}
                </p>
                <p className={`text-xs mt-1 ${accountStatus === 'suspended' ? 'text-red-600' : strikeCount > 0 ? 'text-amber-600' : 'text-stone-500'}`}>
                  {accountStatus === 'suspended' ? 'Account suspended' : 'Suspends at 5 strikes'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-10">
          <HomepageDirectAds variant="compact" />
        </div>

        {/* Campaign Stats Chart Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="bg-white/80 backdrop-blur-md p-6 rounded-2xl shadow-md"
        >
          <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-stone-800">Task Stats</h3>
              <Button
                size="sm"
                className="bg-stone-900 text-white"
                onClick={() => router.push("/earner/campaigns")}
              >
                View Tasks
              </Button>
            </div>
          <div className="divide-y divide-stone-200">
            {[
                { label: "Submitted", icon: <Grid size={18} />, value: stats.campaignSubmitted },
                { label: "Pending", icon: <Clock size={18} />, value: stats.campaignPending },
                { label: "Approved", icon: <CheckCircle size={18} />, value: stats.campaignApproved },
                { label: "Rejected", icon: <XCircle size={18} />, value: stats.campaignRejected },
            ].map((item) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4 }}
                className="flex items-center justify-between py-3 hover:bg-stone-50 rounded-xl px-2"
              >
                <div className="flex items-center gap-3 text-stone-700">
                  <div className="p-2 bg-stone-100 rounded-lg">{item.icon}</div>
                  <span className="font-medium">{item.label}</span>
                </div>
                <div className="font-bold text-stone-900 text-lg">{item.value}</div>
              </motion.div>
            ))}
          </div>
        </motion.section>
      </main>

      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 flex"
          >
            <div className="w-80 border-r border-amber-100 bg-[linear-gradient(180deg,_rgba(255,251,235,0.98),_rgba(255,255,255,0.96))] p-6 shadow-2xl flex flex-col">
              <div className="mb-6 rounded-3xl border border-amber-200 bg-white/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">Earner menu</p>
                    <h3 className="mt-2 text-lg font-bold text-stone-800">{userName}</h3>
                    <p className="mt-1 text-xs text-stone-500">{activated ? "Account active" : "Auto-activation in progress"}</p>
                  </div>
                  <div className="h-12 w-12 overflow-hidden rounded-2xl border border-amber-200 bg-amber-100">
                    {profilePic ? (
                      <Image src={profilePic} alt="profile" width={48} height={48} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center font-bold text-stone-900">
                        {userName.charAt(0)}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-bold text-lg text-stone-800">Navigation</h3>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-2 rounded hover:bg-stone-100"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 overflow-y-auto pr-1">
                {earnerNavSections.map((section) => (
                  <div key={section.title} className="rounded-2xl border border-stone-200 bg-white/70 p-3">
                    <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">{section.title}</p>
                    <div className="mt-2 space-y-1">
                      {section.items.map((item) => (
                        <button
                          key={item.path}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-stone-700 transition hover:bg-amber-50 hover:text-stone-900"
                          onClick={() => {
                            setSidebarOpen(false)
                            router.push(item.path)
                          }}
                        >
                          <item.icon size={16} className="text-amber-700" />
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                className="mt-auto flex items-center justify-center gap-2 rounded-xl border-stone-300 bg-white/80"
                onClick={handleLogout}
              >
                <LogOut size={16} /> Logout
              </Button>
            </div>
            <div
              className="flex-1 bg-black/20"
              onClick={() => setSidebarOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
      {showEarnerGroupPrompt && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-stone-950/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[28px] border border-amber-200/20 bg-gradient-to-br from-stone-900 via-stone-800 to-stone-900 p-7 text-white shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-300">Earner Updates</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-white">
              Join the earner WhatsApp group for task updates.
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-300">
              Get quick notices, platform reminders, and helpful updates from Pamba. If you do not join now, we will remind you next time you open the dashboard.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <a
                href={EARNER_WHATSAPP_GROUP_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={markEarnerGroupJoined}
                className="inline-flex items-center justify-center rounded-full bg-amber-400 px-5 py-3 text-sm font-semibold text-stone-900 transition hover:bg-amber-300"
              >
                Join earner group
              </a>
              <button
                type="button"
                onClick={dismissEarnerGroupPrompt}
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
