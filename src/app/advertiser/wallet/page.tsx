"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { auth, db } from "@/lib/firebase"
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore"
import { Timestamp } from "firebase/firestore";
import { calculateWalletBalances } from "@/lib/wallet"
import { onAuthStateChanged } from "firebase/auth"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PaystackFundWalletModal } from "@/components/paystack-fund-wallet-modal"
import { Wallet, TrendingUp, DollarSign, RefreshCw } from "lucide-react"
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
  // admin-style bank object (earnerWithdrawals/earner side)
  bank?: {
    accountNumber?: string;
    bankName?: string;
    accountName?: string;
  };
  fullName?: string;
  phone?: string;
  email?: string;
};

type Reroute = {
  id: string;
  reroutes: { campaignId: string; amount: number }[];
  status: string;
  createdAt?: Timestamp;
};



export default function WalletPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'withdraw' | 'reroute'>('overview')
  const [fundModalOpen, setFundModalOpen] = useState(false)
  type ResumedCampaign = {
    id: string;
    status: string;
    resumedBudget?: number;
    amountUsed?: number;
    // Add more fields as needed, specify their types here if required
  };
  const [resumedCampaigns, setResumedCampaigns] = useState<ResumedCampaign[]>([])
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [reroutes, setReroutes] = useState<Reroute[]>([])
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

  useEffect(() => {
    let unsubCampaigns: (() => void) | null = null
    let unsubWithdrawals: (() => void) | null = null
    let unsubReroutes: (() => void) | null = null
    let unsubResumed: (() => void) | null = null

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
        const u = auth.currentUser
        setUserEmail(u?.email || null)
        
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

  // Use central util to compute all balances including refundable
  const { totalDeposited, totalSpent, refundableBalance, activeBalance } = calculateWalletBalances(
    campaigns,
    withdrawals,
    reroutes,
    resumedCampaigns
  )

  // Reroute totals (live)
  

  const stats = [
    { title: "Total Deposited", value: `₦${Math.max(0, totalDeposited).toLocaleString()}`, icon: Wallet },
    { title: "Total Spent", value: `₦${Math.max(0, totalSpent).toLocaleString()}`, icon: TrendingUp },
    { title: "Active Balance", value: `₦${Math.max(0, activeBalance).toLocaleString()}`, icon: DollarSign },
    { title: "Refundable Balance", value: `₦${Math.max(0, refundableBalance).toLocaleString()}`, icon: RefreshCw },
  ]

  const getCampaignTitle = (id: string) => campaigns.find((c) => c.id === id)?.title || "Unknown campaign"

  const formatDate = (ts: Timestamp | Date | string | undefined) => {
    if (!ts) return "-"
    if (ts instanceof Timestamp) return ts.toDate().toLocaleString()
    if (ts instanceof Date) return ts.toLocaleString()
    try {
      return new Date(ts).toLocaleString()
    } catch {
      return String(ts)
    }
  }

  // Render wallet page with tabs
  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => router.back()} className="hover:bg-white/20">
              ← Back
            </Button>
            <h1 className="text-2xl font-semibold">Wallet</h1>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((s) => (
            <Card key={s.title} className="p-4 bg-white/80 backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-stone-600">{s.title}</div>
                  <div className="text-lg font-bold">{s.value}</div>
                </div>
                <div className="text-amber-600">
                  <s.icon size={28} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="border-b">
            <nav className="flex -mb-px">
              <button
                className={`flex-1 py-4 px-6 text-center border-b-2 text-sm font-medium ${
                  activeTab === 'overview'
                    ? 'border-amber-500 text-amber-600'
                    : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
                }`}
                onClick={() => setActiveTab('overview')}
              >
                Overview
              </button>
              <button
                className={`flex-1 py-4 px-6 text-center border-b-2 text-sm font-medium ${
                  activeTab === 'withdraw'
                    ? 'border-amber-500 text-amber-600'
                    : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
                }`}
                onClick={() => setActiveTab('withdraw')}
              >
                Withdraw
              </button>
              <button
                className={`flex-1 py-4 px-6 text-center border-b-2 text-sm font-medium ${
                  activeTab === 'reroute'
                    ? 'border-amber-500 text-amber-600'
                    : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
                }`}
                onClick={() => setActiveTab('reroute')}
              >
                Reroute
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'overview' && (
              <>
                {/* Action Buttons */}
                <div className="flex gap-3 mb-6">
                  <Button onClick={() => setFundModalOpen(true)} className="bg-amber-500 hover:bg-amber-600">
                    Fund Wallet
                  </Button>
                  <Button variant="outline" onClick={() => router.push('/advertiser/transactions')}>
                    View Transactions
                  </Button>
                </div>

                {/* Campaign Breakdown */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Campaign Breakdown</h3>
                  {campaigns.length === 0 ? (
                    <p className="text-stone-500">No active campaigns</p>
                  ) : (
                    <div className="space-y-3">
                      {campaigns.map((c) => (
                        <Card key={c.id} className="p-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-medium">{c.title}</h4>
                              <p className="text-sm text-stone-600">
                                Status: {c.status} • Budget: ₦{c.budget.toLocaleString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-stone-600">
                                Leads: {c.generatedLeads || 0} / {c.estimatedLeads}
                              </div>
                              {c.costPerLead && (
                                <div className="text-xs text-amber-600">
                                  ₦{c.costPerLead} per lead
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'withdraw' && (
              <div className="space-y-4">
                <div className="p-4 border rounded">
                  <h3 className="text-lg font-medium mb-4">Request Withdrawal</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">Full Name</label>
                      <Input
                        value={withdrawForm.fullName}
                        onChange={(e) => setWithdrawForm(s => ({ ...s, fullName: e.target.value }))}
                        placeholder="Enter account holder name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">Bank Name</label>
                      <Input
                        value={withdrawForm.bankName}
                        onChange={(e) => setWithdrawForm(s => ({ ...s, bankName: e.target.value }))}
                        placeholder="Enter bank name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">Account Number</label>
                      <Input
                        value={withdrawForm.accountNumber}
                        onChange={(e) => setWithdrawForm(s => ({ ...s, accountNumber: e.target.value }))}
                        placeholder="Enter account number"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">Phone Number</label>
                      <Input
                        value={withdrawForm.phone}
                        onChange={(e) => setWithdrawForm(s => ({ ...s, phone: e.target.value }))}
                        placeholder="Enter phone number"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">Amount (₦)</label>
                      <Input
                        type="number"
                        value={withdrawForm.amount || ""}
                        onChange={(e) => setWithdrawForm(s => ({ ...s, amount: Number(e.target.value) }))}
                        placeholder="Enter amount"
                      />
                    </div>
                    <Button
                      className="w-full bg-amber-500 hover:bg-amber-600"
                      onClick={async () => {
                        const u = auth.currentUser
                        if (!u) return toast.error('Login required')
                        const amount = Number(withdrawForm.amount || 0)
                        if (!amount || amount < 1000) return toast.error('Minimum withdrawal is ₦1,000')
                        if (amount > refundableBalance) return toast.error('Amount exceeds refundable balance')
                        if (!withdrawForm.fullName) return toast.error('Full name is required')
                        if (!withdrawForm.bankName) return toast.error('Bank name is required')
                        if (!withdrawForm.accountNumber) return toast.error('Account number is required')
                        try {
                          // create admin-visible withdrawal request collection (earnerWithdrawals)
                          await addDoc(collection(db, 'earnerWithdrawals'), {
                            userId: u.uid,
                            amount,
                            status: 'pending',
                            createdAt: serverTimestamp(),
                            bank: {
                              accountNumber: withdrawForm.accountNumber,
                              bankName: withdrawForm.bankName,
                              accountName: withdrawForm.fullName,
                            },
                            fullName: withdrawForm.fullName,
                            email: withdrawForm.email || u.email || null,
                            phone: withdrawForm.phone || null,
                          })

                          // record advertiser transaction entry
                          await addDoc(collection(db, 'advertiserTransactions'), {
                            userId: u.uid,
                            type: 'withdrawal',
                            amount: -Math.abs(amount),
                            status: 'pending',
                            note: 'Withdrawal request',
                            createdAt: serverTimestamp(),
                          })
                          toast.success('Withdrawal requested and sent to admin for processing')
                          setWithdrawForm({
                            fullName: "",
                            bankName: "",
                            accountNumber: "",
                            email: "",
                            phone: "",
                            amount: 0,
                          })
                        } catch (e) {
                          console.error(e)
                          toast.error('Failed to request withdrawal')
                        }
                      }}
                    >
                      Request Withdrawal
                    </Button>
                  </div>
                </div>

                {/* Recent Withdrawals */}
                <div>
                  <h3 className="font-medium mb-3">Recent Withdrawals</h3>
                  {withdrawals.length === 0 ? (
                    <p className="text-stone-500 text-sm">No withdrawals yet</p>
                  ) : (
                    <div className="space-y-3">
                      {withdrawals.map((w) => (
                        <Card key={w.id} className="p-4">
                          <div className="flex justify-between">
                            <div>
                              <div className="font-medium">₦{w.amount.toLocaleString()}</div>
                              <div className="text-sm text-stone-600">
                                To: {w.bank?.bankName || w.bankName || '-'} - {w.bank?.accountNumber || w.accountNumber || '-'}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-stone-500">{formatDate(w.createdAt)}</div>
                              <div className="text-sm font-medium text-amber-600">
                                {w.status}
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'reroute' && (
              <div className="space-y-4">
                <div className="p-4 border rounded">
                  <h3 className="text-lg font-medium mb-4">Reroute Funds</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">Campaign</label>
                      <select
                        className="w-full border rounded px-3 py-2"
                        value={rerouteEntries[0]?.campaignId || ''}
                        onChange={(e) => setRerouteEntries([{ campaignId: e.target.value, amount: rerouteEntries[0]?.amount || 0 }])}
                      >
                        <option value="">Select campaign (active only)</option>
                        {campaigns.filter(c => c.status === 'Active').map(c => (
                          <option key={c.id} value={c.id}>{c.title}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">Amount (₦)</label>
                      <Input
                        type="number"
                        value={rerouteEntries[0]?.amount || ""}
                        onChange={(e) => setRerouteEntries([{ campaignId: rerouteEntries[0]?.campaignId || '', amount: Number(e.target.value) }])}
                        placeholder="Enter amount to reroute"
                      />
                    </div>
                    <Button
                      className="w-full bg-amber-500 hover:bg-amber-600"
                      onClick={async () => {
                        const u = auth.currentUser
                        const entry = rerouteEntries[0]
                        if (!u) return toast.error('Login required')
                        if (!entry || !entry.campaignId) return toast.error('Select a campaign')
                        const amount = Number(entry.amount || 0)
                        if (!amount || amount < 100) return toast.error('Enter valid amount')
                        if (amount > refundableBalance) return toast.error('Amount exceeds refundable balance')
                        try {
                          await addDoc(collection(db, 'reroutes'), {
                            userId: u.uid,
                            reroutes: [{ campaignId: entry.campaignId, amount }],
                            status: 'pending',
                            createdAt: serverTimestamp(),
                          })
                          await addDoc(collection(db, 'advertiserTransactions'), {
                            userId: u.uid,
                            type: 'reroute',
                            amount: -Math.abs(amount),
                            status: 'pending',
                            note: `Reroute to ${getCampaignTitle(entry.campaignId)}`,
                            campaignId: entry.campaignId,
                            createdAt: serverTimestamp(),
                          })
                          toast.success('Reroute requested')
                          setRerouteEntries([{ campaignId: '', amount: 0 }])
                        } catch (e) {
                          console.error(e)
                          toast.error('Failed to request reroute')
                        }
                      }}
                    >
                      Submit Reroute Request
                    </Button>
                  </div>
                </div>

                {/* Recent Reroutes */}
                <div>
                  <h3 className="font-medium mb-3">Recent Reroutes</h3>
                  {reroutes.length === 0 ? (
                    <p className="text-stone-500 text-sm">No reroutes yet</p>
                  ) : (
                    <div className="space-y-3">
                      {reroutes.map((r) => (
                        <Card key={r.id} className="p-4">
                          <div className="flex justify-between">
                            <div>
                              <div className="text-sm">
                                {r.reroutes?.map((e) => (
                                  <div key={e.campaignId} className="font-medium">
                                    ₦{e.amount.toLocaleString()} to {getCampaignTitle(e.campaignId)}
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-stone-500">{formatDate(r.createdAt)}</div>
                              <div className="text-sm font-medium text-amber-600">
                                {r.status}
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <PaystackFundWalletModal
          open={fundModalOpen}
          email={userEmail || undefined}
          onClose={() => setFundModalOpen(false)}
          onSuccess={() => {
            setFundModalOpen(false)
            toast.success("Wallet funded")
          }}
        />
      </div>
    </div>
  )
    }
