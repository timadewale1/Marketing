"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp,
  orderBy,
} from "firebase/firestore"
import { Timestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ArrowLeft,
  Wallet,
  TrendingUp,
  DollarSign,
  RefreshCw,
  Plus,
  Trash,
} from "lucide-react"
import { toast } from "react-hot-toast"

type Campaign = {
  id: string
  title: string
  bannerUrl?: string
  status: "Active" | "Paused" | "Stopped" | "Pending" | "Deleted"
  budget: number
  estimatedLeads: number
  generatedLeads?: number
  costPerLead?: number
}

type Withdrawal = {
  id: string;
  amount: number;
  status: string;
  createdAt?: Timestamp;
  fullName?: string;
  phone?: string;
  bankName?: string;
  accountNumber?: string;
  email?: string;
};

type Reroute = {
  id: string;
  reroutes: { campaignId: string; amount: number }[];
  status: string;
  createdAt?: Timestamp;
};

export const calculateWalletBalances = (
  campaigns: Campaign[],
  withdrawals: Withdrawal[],
  reroutes: Reroute[]
) => {
  const totalDeposited = campaigns.reduce((sum, c) => sum + (c.budget || 0), 0)
  const totalSpent = campaigns.reduce(
    (sum, c) => sum + (c.generatedLeads || 0) * (c.costPerLead || 0),
    0
  )

  const refundableBalanceBase = Math.max(
  0,
  campaigns
    .filter((c) => c.status === "Stopped" || c.status === "Deleted")
    .reduce(
      (sum, c) =>
        sum + (c.budget || 0) - (c.generatedLeads || 0) * (c.costPerLead || 0),
      0
    )
)

  const totalRequestedWithdrawals = withdrawals
    .filter((w) => w.status === "Pending" || w.status === "Approved")
    .reduce((s, w) => s + (w.amount || 0), 0)

  const totalRequestedReroutes = reroutes
    .filter((r) => r.status === "Pending" || r.status === "Approved")
    .reduce(
      (s, r) => s + r.reroutes.reduce((sub, rr) => sub + (rr.amount || 0), 0),
      0
    )

  const activeBalance = totalDeposited - totalSpent - refundableBalanceBase

  return { totalDeposited, totalSpent, refundableBalance: refundableBalanceBase, activeBalance }
}


export default function WalletPage() {
  type ResumedCampaign = {
    id: string;
    status: string;
    resumedBudget?: number;
    amountUsed?: number;
    // Add more fields as needed, specify their types here if required
  };
  const [resumedCampaigns, setResumedCampaigns] = useState<ResumedCampaign[]>([])

  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [reroutes, setReroutes] = useState<Reroute[]>([])
  const [view, setView] = useState<"overview" | "withdraw" | "reroute">("overview")
  const [withdrawForm, setWithdrawForm] = useState({
    fullName: "",
    bankName: "",
    accountNumber: "",
    email: "",
    phone: "",
    amount: 0,
  })
  const [rerouteEntries, setRerouteEntries] = useState<{ campaignId: string; amount: number }[]>([
    { campaignId: "", amount: 0 },
  ])
  const [authLoading, setAuthLoading] = useState(true)


  // -------------------------
  // Firestore listeners
  // -------------------------
 useEffect(() => {
  let unsubCampaigns: (() => void) | null = null
  let unsubWithdrawals: (() => void) | null = null
  let unsubReroutes: (() => void) | null = null
let unsubResumed: (() => void) | null = null  // ✅ correct type


  const stopAll = () => {
    if (unsubCampaigns) unsubCampaigns()
    if (unsubWithdrawals) unsubWithdrawals()
    if (unsubReroutes) unsubReroutes()
    if (unsubResumed) unsubResumed()

  }

  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    stopAll()

    if (!user) {
      setCampaigns([])
      setWithdrawals([])
      setReroutes([])
      setAuthLoading(false)
      return
    }

    // --- Campaigns ---
    const q1 = query(collection(db, "campaigns"), where("ownerId", "==", user.uid))
    unsubCampaigns = onSnapshot(q1, (snap) => {
      const data: Campaign[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Campaign, "id">),
      }))
      setCampaigns(data)
      setAuthLoading(false)
    })

    // --- Withdrawals ---
    const q2 = query(collection(db, "withdrawals"), where("userId", "==", user.uid))
    unsubWithdrawals = onSnapshot(q2, (snap) => {
      const data: Withdrawal[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Withdrawal, "id">),
      }))
      setWithdrawals(
        data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      )
    })

    // --- Reroutes ---
    const q3 = query(collection(db, "reroutes"), where("userId", "==", user.uid))
    unsubReroutes = onSnapshot(q3, (snap) => {
      const data: Reroute[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Reroute, "id">),
      }))
      setReroutes(
        data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      )
    })

// --- Resumed Campaigns ---
const q4 = query(collection(db, "resumedCampaigns"), where("userId", "==", user.uid))
 unsubResumed = onSnapshot(q4, (snap) => {
  const data = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<ResumedCampaign, "id">)
  }))
  setResumedCampaigns(data)
})
  })

  return () => {
    unsubscribeAuth()
    stopAll()
  }
}, [])



// -------------------------
// Derived balances (with withdrawals & reroutes)
// -------------------------
const totalDeposited = campaigns.reduce((sum, c) => sum + (c.budget || 0), 0)
const totalSpent = campaigns.reduce(
  (sum, c) => sum + (c.generatedLeads || 0) * (c.costPerLead || 0),
  0
)

// -------------- safer balances calculation --------------
// const refundableBalanceBase = Math.max(
//   0,
//   campaigns
//     .filter((c) => c.status === "Stopped" || c.status === "Deleted")
//     .reduce(
//       (sum, c) =>
//         sum + Math.max(0, (c.budget || 0) - ((c.generatedLeads || 0) * (c.costPerLead || 0))),
//       0
//     )
// )

// total amount already requested (pending or approved)
const totalRequestedWithdrawals = Array.isArray(withdrawals)
  ? withdrawals
      .filter((w) => ["Pending", "Approved"].includes(w.status || ""))
      .reduce((s, w) => s + (Number(w.amount) || 0), 0)
  : 0;

const totalRequestedReroutes = Array.isArray(reroutes)
  ? reroutes
      .filter((r) => ["Pending", "Approved"].includes(r.status || ""))
      .reduce(
        (s, r) =>
          s +
          (Array.isArray(r.reroutes)
            ? r.reroutes.reduce((sub, rr) => sub + (Number(rr.amount) || 0), 0)
            : 0),
        0
      )
  : 0;

  // --- Add this right after totalRequestedReroutes ---
const resumedUsedTotal = resumedCampaigns
  .filter((r) => r.status === "Active" || r.status === "Completed")
  .reduce((sum, r) => sum + (r.resumedBudget || 0), 0)

const refundableBalanceBase = Math.max(
  0,
  campaigns
    .filter((c) => c.status === "Stopped" || c.status === "Deleted")
    .reduce(
      (sum, c) =>
        sum + Math.max(0, (c.budget || 0) - (c.generatedLeads || 0) * (c.costPerLead || 0)),
      0
    ) - resumedUsedTotal
)



  console.log("Refundable Base:", refundableBalanceBase)
console.log("Withdrawals Total:", totalRequestedWithdrawals)
console.log("Reroutes Total:", totalRequestedReroutes)


// never deduct more than the base refundable amount
const totalDeductions = Math.min(refundableBalanceBase, totalRequestedWithdrawals + totalRequestedReroutes)

// refundableBalance is base minus the (capped) deductions — never negative
const totalResumedUsed = resumedCampaigns
  .filter((r) => ["Pending", "Approved"].includes(r.status || ""))
  .reduce((s, r) => s + (Number(r.amountUsed) || 0), 0)

const refundableBalance = Math.max(
  0,
  refundableBalanceBase -
    totalRequestedWithdrawals -
    totalRequestedReroutes -
    totalResumedUsed
)


// active balance should use the base (not the post-deduction refundable), since deductions are still pending
const activeBalance = totalDeposited - totalSpent - refundableBalanceBase
// -------------------------------------------------------


  // Reroute totals (live)
  const rerouteTotal = rerouteEntries.reduce((s, r) => s + (r.amount || 0), 0)
  const remainingRerouteBalance = refundableBalance - rerouteTotal
  const remainingWithdrawBalance = refundableBalance - (withdrawForm.amount || 0)

  const stats = [
  { title: "Total Deposited", value: `₦${Math.max(0, totalDeposited).toLocaleString()}`, icon: Wallet },
  { title: "Total Spent", value: `₦${Math.max(0, totalSpent).toLocaleString()}`, icon: TrendingUp },
  { title: "Active Balance", value: `₦${Math.max(0, activeBalance).toLocaleString()}`, icon: DollarSign },
  { title: "Refundable Balance", value: `₦${Math.max(0, refundableBalance).toLocaleString()}`, icon: RefreshCw },
]



  const getCampaignTitle = (id: string) => campaigns.find((c) => c.id === id)?.title || "Unknown campaign"

  const formatDate = (ts: Timestamp | Date | string | undefined) => {
  if (!ts) return "-";
  if (ts instanceof Timestamp) {
    return ts.toDate().toLocaleString();
  }
  if (ts instanceof Date) {
    return ts.toLocaleString();
  }
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
};

  // -------------------------
  // Submit handlers
  // -------------------------
  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((withdrawForm.amount || 0) > refundableBalance) {
      return toast.error("Withdrawal amount exceeds refundable balance")
    }
    try {
      const user = auth.currentUser
      if (!user) return toast.error("Not authenticated")
      await addDoc(collection(db, "withdrawals"), {
  userId: user.uid,
  ...withdrawForm,
  amount: withdrawForm.amount,
  status: "Pending",
  createdAt: serverTimestamp(),
})

// Immediately adjust refundable balance client-sid

      toast.success("Withdrawal request submitted ✅")
      setWithdrawForm({
        fullName: "",
        bankName: "",
        accountNumber: "",
        email: "",
        phone: "",
        amount: 0,
      })
      setView("overview")
    } catch (err) {
      console.error(err)
      toast.error("Failed to submit withdrawal")
    }
  }

  const handleRerouteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (rerouteTotal > refundableBalance) {
      return toast.error("Total reroute amount exceeds refundable balance")
    }
    try {
      const user = auth.currentUser
      if (!user) return toast.error("Not authenticated")
      const validEntries = rerouteEntries.filter((r) => r.campaignId && r.amount > 0)
      if (validEntries.length === 0) {
        return toast.error("Add at least one reroute entry")
      }
      await addDoc(collection(db, "reroutes"), {
  userId: user.uid,
  reroutes: validEntries,
  status: "Pending",
  createdAt: serverTimestamp(),
})

// Immediately adjust refundable balance client-side


      toast.success("Reroute request submitted ✅")
      setRerouteEntries([{ campaignId: "", amount: 0 }])
      setView("overview")
    } catch (err) {
      console.error(err)
      toast.error("Failed to submit reroute request")
    }
  }

  const addRerouteRow = () => setRerouteEntries([...rerouteEntries, { campaignId: "", amount: 0 }])
  const removeRerouteRow = (i: number) => setRerouteEntries(rerouteEntries.filter((_, idx) => idx !== i))

  // -------------------------
  // Render
  // -------------------------
  if (authLoading) {
  return (
    <div className="flex items-center justify-center h-screen text-stone-600">
      Loading your wallet...
    </div>
  )
}
  return (
    <div className="px-6 py-10 min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
      
      {/* Back button */}
      <Button
        onClick={() => router.back()}
        className="flex gap-2 mb-4 bg-stone-700 hover:bg-stone-800 text-white"
        size="sm"
      >
        <ArrowLeft size={16} /> Back
      </Button>

      {/* Toggle view */}
      <div className="flex gap-3 mb-6">
        <Button
          variant={view === "overview" ? "default" : "outline"}
          className={view === "overview" ? "bg-amber-500 text-stone-900" : "text-stone-700 border-stone-300"}
          onClick={() => setView("overview")}
        >
          Overview
        </Button>
        <Button
          variant={view === "withdraw" ? "default" : "outline"}
          className={view === "withdraw" ? "bg-amber-500 text-stone-900" : "text-stone-700 border-stone-300"}
          onClick={() => setView("withdraw")}
        >
          Request Withdrawal
        </Button>
        <Button
          variant={view === "reroute" ? "default" : "outline"}
          className={view === "reroute" ? "bg-amber-500 text-stone-900" : "text-stone-700 border-stone-300"}
          onClick={() => setView("reroute")}
        >
          Reroute Balance
        </Button>
      </div>

      {/* Overview */}
      {view === "overview" && (
        <div className="space-y-8">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {stats.map((s, i) => (
              <Card key={i} className="bg-white/90 shadow rounded-xl p-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm text-stone-500">{s.title}</h3>
                  <p className="text-lg font-bold text-stone-800">{s.value}</p>
                </div>
                <s.icon className="text-amber-600" size={24} />
              </Card>
            ))}
          </div>

          {/* Campaign Breakdown */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-stone-800">Campaign Breakdown</h2>
              <Link href="/advertiser/campaigns">
                <Button className="bg-stone-200 text-stone-800">View all campaigns</Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {campaigns.map((c) => {
                const spent = (c.generatedLeads || 0) * (c.costPerLead || 0)
                const remaining = (c.budget || 0) - spent
                return (
                  <Link key={c.id} href={`/advertiser/campaigns/${c.id}`}>
                    <Card className="bg-white/90 shadow rounded-xl p-3 flex gap-3 items-center hover:shadow-md transition cursor-pointer">
                      {c.bannerUrl ? (
                        <img src={c.bannerUrl} alt={c.title} className="w-12 h-12 rounded object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded bg-stone-100 flex items-center justify-center text-xs text-stone-500">No image</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-stone-800 text-sm line-clamp-1">{c.title}</h3>
                        <p className="text-xs text-stone-500 mb-1">{c.status}</p>
                        <div className="text-xs text-stone-600 space-y-0.5">
                          <p>Budget: ₦{c.budget.toLocaleString()}</p>
                          <p>Spent: ₦{spent.toLocaleString()}</p>
                          <p>Remaining: ₦{remaining.toLocaleString()}</p>
                        </div>
                      </div>
                    </Card>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Withdraw */}
      {view === "withdraw" && (
        <Card className="bg-white/90 shadow rounded-xl p-6 max-w-md mx-auto">
          <h2 className="text-lg font-semibold text-stone-800 mb-2">Request Withdrawal</h2>
          <p className="text-sm text-stone-600 mb-4">
            Refundable Balance: <span className="font-semibold text-stone-900 ml-2">₦(refundableBalance).toLocaleString()</span>
          </p>

          <form onSubmit={handleWithdrawSubmit} className="space-y-4">
            <Input placeholder="Full Name" value={withdrawForm.fullName} onChange={(e) => setWithdrawForm({ ...withdrawForm, fullName: e.target.value })} required />
            <Input placeholder="Phone Number" value={withdrawForm.phone} onChange={(e) => setWithdrawForm({ ...withdrawForm, phone: e.target.value })} required />
            <Input placeholder="Bank Name" value={withdrawForm.bankName} onChange={(e) => setWithdrawForm({ ...withdrawForm, bankName: e.target.value })} required />
            <Input placeholder="Account Number" value={withdrawForm.accountNumber} onChange={(e) => setWithdrawForm({ ...withdrawForm, accountNumber: e.target.value })} required />
            <Input placeholder="Email" type="email" value={withdrawForm.email} onChange={(e) => setWithdrawForm({ ...withdrawForm, email: e.target.value })} required />

            <div>
              <label className="text-xs text-stone-600 mb-1 block">Amount to withdraw</label>
              <Input type="number" placeholder="₦0" value={withdrawForm.amount || ""} onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: Number(e.target.value) })} required />
            </div>

            <p className={`text-sm ${remainingWithdrawBalance < 0 ? "text-red-600" : "text-stone-600"}`}>
              Remaining Refundable Balance: <span className="font-semibold">₦{remainingWithdrawBalance.toLocaleString()}</span>
            </p>

            <Button type="submit" className="bg-amber-500 text-stone-900 w-full">Submit Withdrawal Request</Button>
          </form>

          {/* Withdrawal History */}
          <div className="mt-8">
            <h3 className="text-md font-semibold text-stone-800 mb-3">Withdrawal History</h3>
            <div className="space-y-2">
              {withdrawals.length === 0 && <p className="text-sm text-stone-500">No withdrawals yet.</p>}
              {withdrawals.map((w) => (
                <Card key={w.id} className="p-3 flex justify-between items-center bg-white/80">
                  <div>
                    <p className="text-sm font-medium">₦{(w.amount || 0).toLocaleString()}</p>
                    <p className="text-xs text-stone-500">{formatDate(w.createdAt)}</p>
                    <p className="text-xs text-stone-600">{w.bankName ? `${w.fullName} • ${w.bankName} • ${w.accountNumber}` : null}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${w.status === "Pending" ? "bg-amber-100 text-amber-700" : w.status === "Approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{w.status}</span>
                </Card>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Reroute */}
      {view === "reroute" && (
        <Card className="bg-white/90 shadow rounded-xl p-6 max-w-lg mx-auto">
          <h2 className="text-lg font-semibold text-stone-800 mb-2">Reroute Balance</h2>
          <p className="text-sm text-stone-600 mb-4">
            Refundable Balance: <span className="font-semibold text-stone-900">₦(refundableBalance).toLocaleString()</span>
          </p>

          <form onSubmit={handleRerouteSubmit} className="space-y-4">
            {rerouteEntries.map((entry, i) => (
              <div key={i} className="flex gap-2 items-start border-b pb-2 mb-2">
                <select className="flex-1 border rounded px-3 py-2 text-sm" value={entry.campaignId} onChange={(e) => setRerouteEntries(rerouteEntries.map((r, idx) => idx === i ? { ...r, campaignId: e.target.value } : r))} required>
                  <option value="">Select Campaign</option>
                  {campaigns.filter((c) => c.status === "Active").map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
                
                <div>
              <label className="text-xs text-stone-600 mb-1 block">Amount to Reroute</label>
              <Input type="number" placeholder="₦0" value={entry.amount} onChange={(e) => setRerouteEntries(rerouteEntries.map((r, idx) => idx === i ? { ...r, amount: Number(e.target.value) } : r))} required />
            </div>

                {rerouteEntries.length > 1 && (
                  <button type="button" onClick={() => removeRerouteRow(i)} className="p-2 text-red-500 hover:text-red-700">
                    <Trash size={16} />
                  </button>
                )}
              </div>
            ))}

            <p className={`text-sm ${remainingRerouteBalance < 0 ? "text-red-600" : "text-stone-600"}`}>
              Total to reroute: <span className="font-semibold">₦{rerouteTotal.toLocaleString()}</span> • Remaining Refundable Balance: <span className="font-semibold">₦{remainingRerouteBalance.toLocaleString()}</span>
            </p>

            <div className="flex gap-3">
              <Button type="button" onClick={addRerouteRow} className="bg-stone-200 text-stone-800 flex-1"><Plus size={16} /> Add Another Campaign</Button>
              <Button type="submit" className="bg-amber-500 text-stone-900 flex-1">Submit Reroute Request</Button>
            </div>
          </form>

          {/* Reroute History */}
          <div className="mt-8">
            <h3 className="text-md font-semibold text-stone-800 mb-3">Reroute History</h3>
            <div className="space-y-2">
              {reroutes.length === 0 && <p className="text-sm text-stone-500">No reroute requests yet.</p>}
              {reroutes.map((r) => (
                <Card key={r.id} className="p-3 flex justify-between items-center bg-white/80">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {r.reroutes.map(rr => `${getCampaignTitle(rr.campaignId)}: ₦${rr.amount.toLocaleString()}`).join(" • ")}
                    </p>
                    <p className="text-xs text-stone-500">{formatDate(r.createdAt)}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${r.status === "Pending" ? "bg-amber-100 text-amber-700" : r.status === "Approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{r.status}</span>
                </Card>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
