"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { auth, db } from "@/lib/firebase"
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, getDocs, doc, getDoc } from "firebase/firestore"
import { Timestamp } from "firebase/firestore"
import { calculateWalletBalances } from "@/lib/wallet"
import { onAuthStateChanged } from "firebase/auth"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PaystackFundWalletModal } from "@/components/paystack-fund-wallet-modal"
import { WithdrawDialog } from '@/components/withdraw-dialog'
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
  const [activeTab, setActiveTab] = useState<'overview' | 'withdraw'>('overview')
  const [fundModalOpen, setFundModalOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [bankDetails, setBankDetails] = useState<{ accountNumber?: string; bankName?: string; accountName?: string } | null>(null)
  type ResumedCampaign = {
    id: string;
    status: string;
    resumedBudget?: number;
    amountUsed?: number;
    // Add more fields as needed, specify their types here if required
  };
  const [resumedCampaigns, setResumedCampaigns] = useState<ResumedCampaign[]>([])
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [totalDeposited, setTotalDeposited] = useState<number>(0)
  const [withdrawableBalance, setWithdrawableBalance] = useState<number>(0)
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [reroutes, setReroutes] = useState<Reroute[]>([])
  // Withdrawal form state removed as feature is disabled
  const [rerouteEntries, setRerouteEntries] = useState<{ campaignId: string; amount: number }[]>([
    { campaignId: "", amount: 0 },
  ])

  useEffect(() => {
    let unsubCampaigns: (() => void) | null = null
    let unsubWithdrawals: (() => void) | null = null
    let unsubReroutes: (() => void) | null = null
    let unsubResumed: (() => void) | null = null
    let unsubscribeAuth: (() => void) | null = null

    const stopAll = () => {
      if (unsubCampaigns) unsubCampaigns()
      if (unsubWithdrawals) unsubWithdrawals()
      if (unsubReroutes) unsubReroutes()
      if (unsubResumed) unsubResumed()
    }

    unsubscribeAuth = onAuthStateChanged(auth, (user) => {
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
      // Fetch advertiser bank details from profile
      ;(async () => {
        try {
          const advQ = query(collection(db, 'advertisers'), where('email', '==', user.email))
          const docRef = await getDocs(advQ)
          if (!docRef.empty) {
            const d = docRef.docs[0].data() as {
              bank?: {
                accountNumber?: string
                bankName?: string
                accountName?: string
              }
            }
            setBankDetails(d.bank || null)
          }
        } catch (e) {
          console.warn('Failed to load advertiser bank details', e)
        }
      })()
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

      // --- Advertiser transactions (for wallet totals) ---
      try {
        const txQ = query(collection(db, 'advertiserTransactions'), where('userId', '==', user.uid))
        const unsubTx = onSnapshot(txQ, (snap) => {
          const txs = snap.docs.map((d) => d.data() as Record<string, any>)
          const deposited = txs
            .filter((t) => t.type === 'wallet_funding' && (t.status === 'completed' || t.status == null))
            .reduce((s, t) => s + (Number(t.amount) || 0), 0)
          setTotalDeposited(deposited)
        })
        unsubWithdrawals = unsubWithdrawals || null
      } catch (e) {
        console.warn('Failed to listen to advertiserTransactions', e)
      }

      // --- Advertiser profile (balance) ---
      ;(async () => {
        try {
          const advRef = doc(db, 'advertisers', user.uid)
          const advSnap = await getDoc(advRef)
          if (advSnap.exists()) {
            setWithdrawableBalance(Number(advSnap.data()?.balance || 0))
          }
        } catch (e) {
          console.warn('Failed to load advertiser profile for balance', e)
        }
      })()
    })
    return () => {
      if (unsubscribeAuth) unsubscribeAuth()
      stopAll()
    }
  }, [])

  // Use advertiser transactions + profile balance for wallet totals
  const handleAdvertiserWithdraw = async (amount: number) => {
    const user = auth.currentUser
    if (!user) {
      toast.error('You must be signed in to withdraw')
      return
    }

    try {
      const idToken = await user.getIdToken()
      const res = await fetch('/api/advertiser/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ amount }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.message || 'Withdrawal failed')
        return
      }
      toast.success(data?.message || 'Withdrawal request submitted')
      setWithdrawOpen(false)
    } catch (err) {
      console.error('Withdraw error', err)
      toast.error('Failed to create withdrawal request')
    }
  }

  // Reroute totals (live)
  

  const stats = [
    { title: "Total Deposited", value: `₦${Math.max(0, totalDeposited).toLocaleString()}`, icon: Wallet },
    { title: "Withdrawable Balance", value: `₦${Math.max(0, withdrawableBalance).toLocaleString()}`, icon: RefreshCw },
  ]

  

  // Render wallet page with tabs
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-100 via-gold-100 to-primary-200 p-6">
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
                  <div className="text-sm text-primary-600">{s.title}</div>
                  <div className="text-lg font-bold">{s.value}</div>
                </div>
                <div className="text-gold-600">
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
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-primary-500 hover:text-primary-700 hover:border-primary-300'
                }`}
                onClick={() => setActiveTab('overview')}
              >
                Overview
              </button>
              <button
                className={`flex-1 py-4 px-6 text-center border-b-2 text-sm font-medium ${
                  activeTab === 'withdraw'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-primary-500 hover:text-primary-700 hover:border-primary-300'
                }`}
                onClick={() => setActiveTab('withdraw')}
              >
                Withdraw
              </button>
              {/* Reroute feature removed — tasks now run until funds exhaust */}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'overview' && (
              <>
                {/* Action Buttons */}
                <div className="flex gap-3 mb-6">
                  <Button onClick={() => setFundModalOpen(true)} className="bg-gold-500 hover:bg-gold-600">
                    Fund Wallet
                  </Button>
                  <Button variant="outline" onClick={() => router.push('/advertiser/transactions')}>
                    View Transactions
                  </Button>
                </div>

                {/* Task Breakdown removed for now — wallet shows fund & withdraw only */}
              </>
            )}

            {/* Reroute feature removed — tasks now run until funds exhaust */}
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
        <WithdrawDialog
          open={withdrawOpen}
          onClose={() => setWithdrawOpen(false)}
          onSubmit={handleAdvertiserWithdraw}
          maxAmount={Math.max(0, withdrawableBalance)}
          bankDetails={
            bankDetails
              ? {
                  accountNumber: bankDetails.accountNumber || "",
                  bankName: bankDetails.bankName || "",
                  accountName: bankDetails.accountName || "",
                }
              : null
          }
        />
      </div>
    </div>
  )
    }
