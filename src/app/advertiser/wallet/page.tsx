"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from "firebase/firestore"

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
import Link from "next/link"

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

export default function WalletPage() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [view, setView] = useState<"overview" | "withdraw" | "reroute">(
    "overview"
  )
  const [withdrawForm, setWithdrawForm] = useState({
    fullName: "",
    bankName: "",
    accountNumber: "",
    email: "",
    phone: "",
  })
  const [rerouteEntries, setRerouteEntries] = useState<
    { campaignId: string; amount: number }[]
  >([{ campaignId: "", amount: 0 }])

  // Fetch campaigns
  useEffect(() => {
    const user = auth.currentUser
    if (!user) return
    const q = query(collection(db, "campaigns"), where("ownerId", "==", user.uid))
    const unsub = onSnapshot(q, (snap) => {
      const data: Campaign[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Campaign, "id">),
      }))
      setCampaigns(data)
    })
    return () => unsub()
  }, [])

  // Calculations
  const totalDeposited = campaigns.reduce((sum, c) => sum + (c.budget || 0), 0)
  const totalSpent = campaigns.reduce(
    (sum, c) => sum + (c.generatedLeads || 0) * (c.costPerLead || 0),
    0
  )
  const refundableBalance = campaigns
    .filter((c) => c.status === "Stopped" || c.status === "Deleted")
    .reduce(
      (sum, c) =>
        sum + (c.budget || 0) - (c.generatedLeads || 0) * (c.costPerLead || 0),
      0
    )
  const activeBalance = totalDeposited - totalSpent - refundableBalance

  const rerouteTotal = rerouteEntries.reduce(
    (sum, r) => sum + (r.amount || 0),
    0
  )
  const remainingBalance = refundableBalance - rerouteTotal

  const stats = [
    {
      title: "Total Deposited",
      value: `₦${totalDeposited.toLocaleString()}`,
      icon: Wallet,
    },
    {
      title: "Total Spent",
      value: `₦${totalSpent.toLocaleString()}`,
      icon: TrendingUp,
    },
    {
      title: "Active Balance",
      value: `₦${activeBalance.toLocaleString()}`,
      icon: DollarSign,
    },
    {
      title: "Refundable Balance",
      value: `₦${refundableBalance.toLocaleString()}`,
      icon: RefreshCw,
    },
  ]

  // Handle Withdraw
  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const user = auth.currentUser
      if (!user) return toast.error("Not authenticated")

      await addDoc(collection(db, "withdrawals"), {
        userId: user.uid,
        ...withdrawForm,
        amount: refundableBalance + activeBalance,
        status: "Pending",
        createdAt: serverTimestamp(),
      })

      toast.success("Withdrawal request submitted ✅")
      setWithdrawForm({
        fullName: "",
        bankName: "",
        accountNumber: "",
        email: "",
        phone: "",
      })
    } catch (err) {
      console.error(err)
      toast.error("Failed to submit withdrawal")
    }
  }

  // Handle Reroute
  const handleRerouteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (rerouteTotal > refundableBalance) {
      return toast.error("Reroute amount exceeds refundable balance")
    }
    try {
      const user = auth.currentUser
      if (!user) return toast.error("Not authenticated")

      const validEntries = rerouteEntries.filter(
        (r) => r.campaignId && r.amount > 0
      )
      if (validEntries.length === 0)
        return toast.error("Add at least one reroute")

      await addDoc(collection(db, "reroutes"), {
        userId: user.uid,
        reroutes: validEntries,
        status: "Pending",
        createdAt: serverTimestamp(),
      })

      toast.success("Balance reroute request submitted ✅")
      setRerouteEntries([{ campaignId: "", amount: 0 }])
    } catch (err) {
      console.error(err)
      toast.error("Failed to submit reroute request")
    }
  }

  // Add/remove reroute row
  const addRerouteRow = () =>
    setRerouteEntries([...rerouteEntries, { campaignId: "", amount: 0 }])
  const removeRerouteRow = (i: number) =>
    setRerouteEntries(rerouteEntries.filter((_, idx) => idx !== i))

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
          className={
            view === "overview"
              ? "bg-amber-500 text-stone-900"
              : "text-stone-700 border-stone-300"
          }
          onClick={() => setView("overview")}
        >
          Overview
        </Button>
        <Button
          variant={view === "withdraw" ? "default" : "outline"}
          className={
            view === "withdraw"
              ? "bg-amber-500 text-stone-900"
              : "text-stone-700 border-stone-300"
          }
          onClick={() => setView("withdraw")}
        >
          Request Withdrawal
        </Button>
        <Button
          variant={view === "reroute" ? "default" : "outline"}
          className={
            view === "reroute"
              ? "bg-amber-500 text-stone-900"
              : "text-stone-700 border-stone-300"
          }
          onClick={() => setView("reroute")}
        >
          Reroute Balance
        </Button>
      </div>

      {/* Overview */}
      {view === "overview" && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {stats.map((s, i) => (
              <Card
                key={i}
                className="bg-white/90 shadow rounded-xl p-4 flex items-center justify-between"
              >
                <div>
                  <h3 className="text-sm text-stone-500">{s.title}</h3>
                  <p className="text-lg font-bold text-stone-800">{s.value}</p>
                </div>
                <s.icon className="text-amber-600" size={24} />
              </Card>
            ))}
          </div>

          {/* Breakdown */}
          <div>
            <h2 className="text-lg font-semibold text-stone-800 mb-4">
              Campaign Breakdown
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {campaigns.map((c) => {
                const spent = (c.generatedLeads || 0) * (c.costPerLead || 0)
                const remaining = (c.budget || 0) - spent
                return (
                  <Link key={c.id} href={`/advertiser/campaigns/${c.id}`}>
                    <Card className="bg-white/90 shadow rounded-xl p-4 flex gap-3 items-center hover:shadow-md transition">
                      {c.bannerUrl && (
                        <img
                          src={c.bannerUrl}
                          alt={c.title}
                          className="w-12 h-12 rounded object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <h3 className="font-semibold text-stone-800 text-sm line-clamp-1">
                          {c.title}
                        </h3>
                        <p className="text-xs text-stone-500 mb-1">{c.status}</p>
                        <div className="text-xs text-stone-600 space-y-0.5">
                          <p>Budget: ₦{c.budget}</p>
                          <p>Spent: ₦{spent}</p>
                          <p>Remaining: ₦{remaining}</p>
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
          <h2 className="text-lg font-semibold text-stone-800 mb-4">
            Request Withdrawal
          </h2>
          <form onSubmit={handleWithdrawSubmit} className="space-y-4">
            <Input
              placeholder="Full Name"
              value={withdrawForm.fullName}
              onChange={(e) =>
                setWithdrawForm({ ...withdrawForm, fullName: e.target.value })
              }
              required
            />
            <Input
              placeholder="Phone Number"
              value={withdrawForm.phone}
              onChange={(e) =>
                setWithdrawForm({ ...withdrawForm, phone: e.target.value })
              }
              required
            />
            <Input
              placeholder="Bank Name"
              value={withdrawForm.bankName}
              onChange={(e) =>
                setWithdrawForm({ ...withdrawForm, bankName: e.target.value })
              }
              required
            />
            <Input
              placeholder="Account Number"
              value={withdrawForm.accountNumber}
              onChange={(e) =>
                setWithdrawForm({
                  ...withdrawForm,
                  accountNumber: e.target.value,
                })
              }
              required
            />
            <Input
              placeholder="Email"
              type="email"
              value={withdrawForm.email}
              onChange={(e) =>
                setWithdrawForm({ ...withdrawForm, email: e.target.value })
              }
              required
            />
            <Button type="submit" className="bg-amber-500 text-stone-900 w-full">
              Submit Withdrawal Request
            </Button>
          </form>
        </Card>
      )}

      {/* Reroute */}
      {view === "reroute" && (
        <Card className="bg-white/90 shadow rounded-xl p-6 max-w-lg mx-auto">
          <h2 className="text-lg font-semibold text-stone-800 mb-2">
            Reroute Balance
          </h2>
          <p className="text-sm text-stone-600 mb-4">
            Refundable Balance:{" "}
            <span className="font-semibold text-stone-900">
              ₦{refundableBalance.toLocaleString()}
            </span>
          </p>

          <form onSubmit={handleRerouteSubmit} className="space-y-4">
            {rerouteEntries.map((entry, i) => (
              <div
                key={i}
                className="flex gap-2 items-center border-b pb-2 mb-2"
              >
                <select
                  className="flex-1 border rounded px-3 py-2 text-sm"
                  value={entry.campaignId}
                  onChange={(e) =>
                    setRerouteEntries(
                      rerouteEntries.map((r, idx) =>
                        idx === i ? { ...r, campaignId: e.target.value } : r
                      )
                    )
                  }
                  required
                >
                  <option value="">Select Campaign</option>
                  {campaigns
                    .filter((c) => c.status === "Active")
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                </select>
                <div className="flex flex-col">
                  <label className="text-xs text-stone-600 mb-1">
                    Amount to reroute
                  </label>
                  <Input
                    type="number"
                    placeholder="₦0"
                    value={entry.amount}
                    onChange={(e) =>
                      setRerouteEntries(
                        rerouteEntries.map((r, idx) =>
                          idx === i
                            ? { ...r, amount: Number(e.target.value) }
                            : r
                        )
                      )
                    }
                    required
                  />
                </div>
                {rerouteEntries.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRerouteRow(i)}
                    className="p-2 text-red-500 hover:text-red-700"
                  >
                    <Trash size={16} />
                  </button>
                )}
              </div>
            ))}

            <p
              className={`text-sm ${
                remainingBalance < 0 ? "text-red-600" : "text-stone-600"
              }`}
            >
              Remaining Balance:{" "}
              <span className="font-semibold">
                ₦{remainingBalance.toLocaleString()}
              </span>
            </p>

            <Button
              type="button"
              onClick={addRerouteRow}
              className="bg-stone-200 text-stone-800 w-full flex items-center gap-2"
            >
              <Plus size={16} /> Add Another Campaign
            </Button>

            <Button
              type="submit"
              disabled={remainingBalance < 0}
              className="bg-amber-500 text-stone-900 w-full mt-2"
            >
              Submit Reroute Request
            </Button>
          </form>
        </Card>
      )}
    </div>
  )
}
