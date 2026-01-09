"use client";

import React, { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, doc, getDoc } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WithdrawDialog } from '@/components/withdraw-dialog';
import { ArrowLeft } from "lucide-react";
import { PageLoader } from "@/components/ui/loader";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";

interface Transaction {
  id: string;
  type?: string;
  note?: string;
  amount: number;
  campaignId?: string;
  campaignTitle?: string;
  status?: 'pending' | 'completed' | 'cancelled';
  createdAt?: {
    seconds: number;
    nanoseconds: number;
  };
}

export default function AdvertiserTransactionsPage() {
  const router = useRouter();
  const [history, setHistory] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [withdrawableBalance, setWithdrawableBalance] = useState<number>(0);
  const [bankDetails, setBankDetails] = useState<{ accountNumber: string; bankName: string; accountName: string } | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const handleAdvertiserWithdraw = async (amount: number) => {
    const u = auth.currentUser
    if (!u) {
      toast.error('You must be signed in to withdraw')
      return
    }
    try {
      const idToken = await u.getIdToken()
      const res = await fetch('/api/advertiser/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ amount }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.message || 'Withdrawal failed')
        return
      }
      toast.success(data?.message || 'Withdrawal request submitted')
      setWithdrawOpen(false)
      try { router.refresh() } catch (e) { /* ignore */ }
    } catch (err) {
      console.error('Withdraw error', err)
      toast.error('Failed to create withdrawal request')
    }
  }

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) {
      router.push('/auth/sign-in');
      return;
    }

    // Get transaction history (campaign creation, deposits, withdrawals, reroutes, etc)
    const txQ = query(collection(db, "advertiserTransactions"), where("userId", "==", u.uid));
    const unsubTx = onSnapshot(txQ, (snap) => {
      const txs = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: data.type,
          note: data.note,
          amount: data.amount,
          status: data.status,
          campaignId: data.campaignId,
          campaignTitle: data.campaignTitle,
          createdAt: data.createdAt
        } as Transaction;
      });
      const sorted = txs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setHistory(sorted);
      // keep local balance in case needed (not used for withdrawable amount)
      const bal = sorted.reduce((s, t) => s + (t.amount || 0), 0)
      setBalance(bal)
      setLoading(false);
    });

    // fetch advertiser profile for withdrawable balance and bank details
    ;(async () => {
      try {
        const advRef = doc(db, 'advertisers', u.uid)
        const advSnap = await getDoc(advRef)
        if (advSnap.exists()) {
          const data = advSnap.data() || {}
          setWithdrawableBalance(Number(data.balance || 0))
          setBankDetails(data.bank || null)
        }
      } catch (e) {
        console.warn('Failed to load advertiser profile for transactions page', e)
      }
    })()

    return () => {
      unsubTx();
    };
  }, [router]);

  // Navigate to wallet page for funding
  const handleFundWallet = () => {
    router.push('/advertiser/wallet');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
      <div className="px-6 py-8 max-w-4xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.back()} className="hover:bg-white/20">
            <ArrowLeft size={16} className="mr-2" /> Back
          </Button>
          <h1 className="text-2xl font-semibold text-stone-800">Transactions</h1>
        </div>

        {/* Balance Card */}
        <Card className="bg-white/80 backdrop-blur p-6 mb-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-stone-800">Wallet Balance</h2>
              <p className="text-3xl font-bold text-amber-600 mt-1">
                ₦{balance.toLocaleString()}
              </p>
              <p className="text-sm text-stone-600 mt-1">
                Used for task payments
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleFundWallet}
                className="bg-amber-500 hover:bg-amber-600 text-stone-900 font-medium min-w-[150px]"
              >
                Fund Wallet
              </Button>
              <Button
                onClick={() => setWithdrawOpen(true)}
                variant="outline"
                className="min-w-[120px]"
              >
                Withdraw
              </Button>
            </div>
          </div>
        </Card>

        {/* Transaction History */}
        <Card className="bg-white/80 backdrop-blur p-6">
          <h3 className="text-lg font-semibold text-stone-800 mb-4">Transaction History</h3>
          
              {loading ? (
            <PageLoader />
          ) : history.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-stone-600">No transactions yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((tx) => (
                <Card key={tx.id} className="p-4 hover:shadow-md transition duration-200">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-medium text-stone-800">
                        {tx.type === 'campaign_payment' ? 'Task Payment' : tx.type === 'deposit' ? 'Deposit' : tx.type === 'withdrawal' || tx.type === 'withdrawal_request' ? 'Withdrawal' : tx.note || "Transaction"}
                      </h4>
                      {tx.createdAt && (
                        <div className="text-sm text-stone-500 mt-1">
                          {new Date(tx.createdAt.seconds * 1000).toLocaleDateString()} at{" "}
                          {new Date(tx.createdAt.seconds * 1000).toLocaleTimeString()}
                        </div>
                      )}
                      {tx.campaignId && (
                        <div className="text-xs text-amber-600 mt-1">
                          Task ID: {tx.campaignId}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      {tx.status === 'pending' && (
                        <span className="inline-block px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded-full mb-1">
                          Pending
                        </span>
                      )}
                      <div className={`font-bold ${
                        tx.type === 'campaign_payment' || tx.type === 'withdrawal' || tx.type === 'withdrawal_request' ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {tx.type === 'campaign_payment' || tx.type === 'withdrawal' || tx.type === 'withdrawal_request' ? '-' : '+'}₦{Math.abs(tx.amount).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
          {/* Withdraw dialog should always be mounted so button opens it even with no history */}
          <WithdrawDialog
            open={withdrawOpen}
            onClose={() => setWithdrawOpen(false)}
            onSubmit={handleAdvertiserWithdraw}
            maxAmount={Math.max(0, withdrawableBalance)}
            bankDetails={bankDetails}
          />
        </Card>
      </div>
    </div>
  );
}