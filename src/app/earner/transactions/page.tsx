"use client";

import React, { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, addDoc, serverTimestamp, getDoc, doc } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PageLoader } from "@/components/ui/loader";
import { WithdrawDialog } from "@/components/withdraw-dialog";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

interface Transaction {
  id: string;
  type?: string;
  note?: string;
  amount: number;
  status?: 'pending' | 'completed' | 'cancelled';
  createdAt?: {
    seconds: number;
    nanoseconds: number;
  };
}

interface BankDetails {
  accountNumber: string;
  bankName: string;
  accountName: string;
}

export default function TransactionsPage() {
  const router = useRouter();
  const [history, setHistory] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [availableBalance, setAvailableBalance] = useState(0);

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) {
      router.push('/auth/sign-in');
      return;
    }

    // Get bank details and available balance
    const unsubUser = onSnapshot(doc(db, "earners", u.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.bank) {
          setBankDetails({
            accountNumber: data.bank.accountNumber,
            bankName: data.bank.bankName,
            accountName: data.bank.accountName,
          });
        }
      }
    });

    // Get transaction history
    const q = query(
      collection(db, "earnerTransactions"),
      where("userId", "==", u.uid),
      where("status", "in", ["completed", null]) // null for backward compatibility
    );
    const unsubTx = onSnapshot(q, (snap) => {
      const txs = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: data.type,
          note: data.note,
          amount: data.amount,
          status: data.status,
          createdAt: data.createdAt
        } as Transaction;
      });
      setHistory(txs);
      
      // Calculate available balance from completed transactions
      const balance = txs.reduce((sum, tx) => sum + tx.amount, 0);
      setAvailableBalance(balance);
      setLoading(false);
    });

    return () => {
      unsubUser();
      unsubTx();
    };
  }, [router]);

  const requestWithdraw = async (amount: number): Promise<void> => {
    const u = auth.currentUser;
    if (!u) {
      toast.error("Login required");
      return;
    }
    if (!bankDetails) {
      toast.error("Please add bank details first");
      return;
    }

    try {
      // Create withdrawal request with bank details
      await addDoc(collection(db, "earnerWithdrawals"), {
        userId: u.uid,
        amount: amount,
        status: "pending",
        createdAt: serverTimestamp(),
        bank: bankDetails,
      });

      // Add transaction record
      await addDoc(collection(db, "earnerTransactions"), {
        userId: u.uid,
        type: "withdrawal",
        amount: -amount,
        status: "pending",
        note: "Withdrawal requested",
        createdAt: serverTimestamp(),
      });

      toast.success("Withdrawal request submitted");
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit withdrawal request");
    }
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
              <h2 className="text-lg font-semibold text-stone-800">Available Balance</h2>
              <p className="text-3xl font-bold text-amber-600 mt-1">
                ₦{availableBalance.toLocaleString()}
              </p>
              <p className="text-sm text-stone-600 mt-1">
                Minimum withdrawal: ₦2,000
              </p>
            </div>
            <Button
              onClick={() => setWithdrawOpen(true)}
              disabled={availableBalance < 2000 || !bankDetails}
              className="bg-amber-500 hover:bg-amber-600 text-stone-900 font-medium min-w-[150px]"
            >
              Withdraw Funds
            </Button>
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
                      <div className="font-medium text-stone-800">
                        {tx.type === 'withdrawal' ? 'Withdrawal' : tx.note || "Transaction"}
                      </div>
                      {tx.createdAt && (
                        <div className="text-sm text-stone-500 mt-1">
                          {new Date(tx.createdAt.seconds * 1000).toLocaleDateString()} at{" "}
                          {new Date(tx.createdAt.seconds * 1000).toLocaleTimeString()}
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
                        tx.amount < 0 ? 'text-red-600' : 'text-green-600'
                      }`}>
                        ₦{Math.abs(tx.amount).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>

        <WithdrawDialog
          open={withdrawOpen}
          onClose={() => setWithdrawOpen(false)}
          onSubmit={requestWithdraw}
          maxAmount={availableBalance}
          bankDetails={bankDetails}
        />
      </div>
    </div>
  );
}
