"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { signOut } from "firebase/auth"
import { auth, db } from "@/lib/firebase"

// Activity type removed (we now use earnerSubmissions and earnerTransactions directly)
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
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
  
  Menu,
  ChevronDown,
  ChevronUp,
  LogOut,
  User,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

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

  const [totalEarned, setTotalEarned] = useState(0)
  const [withdrawHistory, setWithdrawHistory] = useState<WithdrawRecord[]>([])
  const [referralStats, setReferralStats] = useState({ totalReferrals: 0, pendingBonuses: 0 })
  const [rotIdx, setRotIdx] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        router.push("/auth/sign-in")
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
        }
      })

      // Withdrawals
      const unsubWithdraws = onSnapshot(
        query(collection(db, "earnerWithdrawals"), where("userId", "==", u.uid)),
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
        query(collection(db, "earnerSubmissions"), where("userId", "==", u.uid)),
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
        query(collection(db, "earnerTransactions"), where("userId", "==", u.uid)),
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
        query(collection(db, "referrals"), where("referrerId", "==", u.uid)),
        (snap) => {
          const totalReferrals = snap.size
          let pendingBonuses = 0
          snap.docs.forEach((d) => {
            const r = d.data()
            if (!r.bonusPaid) pendingBonuses += r.bonusAmount || 0
          })
          setReferralStats({ totalReferrals, pendingBonuses })
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
        {/* Top Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
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
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    className="bg-amber-500 text-stone-900"
                    onClick={() => router.push("/earner/transactions")}
                  >
                    Withdraw
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push("/earner/campaigns")}
                  >
                    Perform Tasks
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

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
                        {referralStats.totalReferrals}
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
        </div>

        {/* Campaign Stats Chart Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="bg-white/80 backdrop-blur-md p-6 rounded-2xl shadow-md"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-stone-800">Campaign Stats</h3>
            <Button
              size="sm"
              className="bg-stone-900 text-white"
              onClick={() => router.push("/earner/campaigns")}
            >
              View Campaigns
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

      {/* Sidebar with dropdowns */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 flex"
          >
            <div className="bg-white w-72 p-6 shadow-2xl flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg text-stone-800">Menu</h3>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-2 rounded hover:bg-stone-100"
                >
                  ✕
                </button>
              </div>

              {/* Participate Dropdown */}
              <div>
                <button
                  className="flex justify-between w-full text-left p-2 rounded-lg hover:bg-stone-100 font-medium text-stone-800"
                  onClick={() =>
                    setOpenDropdown(openDropdown === "campaigns" ? null : "campaigns")
                  }
                >
                  Participate in Campaigns
                  {openDropdown === "campaigns" ? <ChevronUp /> : <ChevronDown />}
                </button>
                <AnimatePresence>
                  {openDropdown === "campaigns" && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="ml-4 mt-2 space-y-2 text-sm"
                    >
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => router.push("/earner/campaigns")}
                      >
                        Available Campaigns
                      </Button>
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => router.push("/earner/campaigns/done")}
                      >
                        Done Campaigns
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Referral */}
              <Button
                variant="ghost"
                className="mt-3 justify-start"
                onClick={() => router.push("/earner/referrals")}
              >
                Referrals
              </Button>

              {/* Wallet Dropdown */}
              <div className="mt-3">
                <button
                  className="flex justify-between w-full text-left p-2 rounded-lg hover:bg-stone-100 font-medium text-stone-800"
                  onClick={() =>
                    setOpenDropdown(openDropdown === "wallet" ? null : "wallet")
                  }
                >
                  Wallet
                  {openDropdown === "wallet" ? <ChevronUp /> : <ChevronDown />}
                </button>
                <AnimatePresence>
                  {openDropdown === "wallet" && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="ml-4 mt-2 space-y-2 text-sm"
                    >
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => router.push("/earner/transactions")}
                      >
                        Transactions
                      </Button>
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => router.push("/earner/bank")}
                      >
                        Bank Accounts
                      </Button>
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => router.push("/earner/pricelist")}
                      >
                        Campaign Price List
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Profile */}
              <Button
                variant="ghost"
                className="mt-3 justify-start"
                onClick={() => router.push("/earner/profile")}
              >
                <User size={16} className="mr-2" /> Profile
              </Button>

              <Button
                variant="outline"
                className="mt-auto flex items-center justify-center gap-2"
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
    </div>
  )
}
