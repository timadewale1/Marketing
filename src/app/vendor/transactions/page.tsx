"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { collection, doc, getDoc, limit, onSnapshot, query, where } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WithdrawDialog } from "@/components/withdraw-dialog";
import { ArrowLeft } from "lucide-react";
import { PageLoader } from "@/components/ui/loader";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";

interface Transaction {
  id: string;
  type?: string;
  note?: string;
  amount: number;
  status?: string;
  withdrawalId?: string;
  createdAt?: { seconds?: number; nanoseconds?: number };
}

export default function VendorTransactionsPage() {
  const router = useRouter();
  const [history, setHistory] = useState<Transaction[]>([]);
  const [withdrawalStatusMap, setWithdrawalStatusMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [bankDetails, setBankDetails] = useState<{ accountNumber: string; bankName: string; accountName: string } | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const transactionsPerPage = 5;

  const handleVendorWithdraw = async (amount: number) => {
    const user = auth.currentUser;
    if (!user) {
      toast.error("You must be signed in to withdraw");
      return;
    }
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/vendor/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message || "Withdrawal failed");
        return;
      }
      toast.success(data?.message || "Withdrawal request submitted");
      setWithdrawOpen(false);
      try {
        router.refresh();
      } catch {
        // ignore
      }
    } catch (error) {
      console.error("Withdraw error", error);
      toast.error("Failed to create withdrawal request");
    }
  };

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.push("/auth/sign-in?marketplace=1");
      return;
    }

    const txQ = query(collection(db, "vendorTransactions"), where("userId", "==", user.uid), where("status", "!=", "failed"), limit(250));
    const unsubTx = onSnapshot(txQ, (snap) => {
      const txs = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            type: String(data.type || ""),
            note: String(data.note || ""),
            amount: Number(data.amount || 0),
            status: String(data.status || ""),
            withdrawalId: String(data.withdrawalId || ""),
            createdAt: data.createdAt,
          };
        })
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setHistory(txs);
      setLoading(false);
    });

    void (async () => {
      try {
        const vendorRef = doc(db, "vendors", user.uid);
        const vendorSnap = await getDoc(vendorRef);
        if (vendorSnap.exists()) {
          const data = vendorSnap.data() as { balance?: number; bank?: { accountNumber?: string; bankName?: string; accountName?: string } };
          setBalance(Number(data.balance || 0));
          setBankDetails((data.bank || null) as { accountNumber: string; bankName: string; accountName: string } | null);
        }
      } catch (error) {
        console.warn("Failed to load vendor profile for transactions", error);
      }
    })();

    const wQ = query(collection(db, "vendorWithdrawals"), where("userId", "==", user.uid), limit(150));
    const unsubW = onSnapshot(wQ, (snap) => {
      const map: Record<string, string> = {};
      snap.docs.forEach((d) => {
        map[d.id] = String(d.data().status || "");
      });
      setWithdrawalStatusMap(map);
    });

    return () => {
      unsubTx();
      unsubW();
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-cyan-100 to-stone-300">
      <div className="px-6 py-8 max-w-4xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.back()} className="hover:bg-white/20">
            <ArrowLeft size={16} className="mr-2" /> Back
          </Button>
          <h1 className="text-2xl font-semibold text-stone-800">Transactions</h1>
        </div>

        <Card className="bg-white/80 backdrop-blur p-6 mb-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-stone-800">Wallet Balance</h2>
              <p className="text-3xl font-bold text-cyan-700 mt-1">₦{balance.toLocaleString()}</p>
              <p className="text-sm text-stone-600 mt-1">Used for vendor task payments and withdrawals</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => router.push("/vendor/wallet")} className="bg-cyan-700 hover:bg-cyan-600 text-white">
                Fund Wallet
              </Button>
              <Button onClick={() => setWithdrawOpen(true)} variant="outline" className="min-w-[120px]">
                Withdraw
              </Button>
            </div>
          </div>
        </Card>

        <Card className="bg-white/80 backdrop-blur p-6">
          <h3 className="text-lg font-semibold text-stone-800 mb-4">Transaction History</h3>
          {loading ? (
            <PageLoader />
          ) : history.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-stone-600">No transactions yet.</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {history.slice((currentPage - 1) * transactionsPerPage, currentPage * transactionsPerPage).map((tx) => {
                  const sign = tx.amount < 0 ? "-" : "+";
                  const statusToCheck = tx.withdrawalId ? withdrawalStatusMap[tx.withdrawalId] || tx.status : tx.status;
                  return (
                    <Card key={tx.id} className="p-4 hover:shadow-md transition duration-200">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h4 className="font-medium text-stone-800">{tx.note || tx.type || "Transaction"}</h4>
                          {tx.createdAt?.seconds ? (
                            <div className="text-sm text-stone-500 mt-1">
                              {new Date(tx.createdAt.seconds * 1000).toLocaleDateString()} at {new Date(tx.createdAt.seconds * 1000).toLocaleTimeString()}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-right">
                          {statusToCheck ? (
                            <span
                              className={`inline-block px-2 py-1 text-xs font-medium rounded-full mb-1 ${
                                statusToCheck.includes("pending")
                                  ? "bg-amber-100 text-amber-700"
                                  : statusToCheck === "completed"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-stone-100 text-stone-700"
                              }`}
                            >
                              {statusToCheck}
                            </span>
                          ) : null}
                          <div className={`font-bold ${tx.amount < 0 ? "text-red-600" : "text-green-600"}`}>
                            {sign}₦{Math.abs(tx.amount).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </>
          )}

          <WithdrawDialog
            open={withdrawOpen}
            onClose={() => setWithdrawOpen(false)}
            onSubmit={handleVendorWithdraw}
            maxAmount={Math.max(0, balance)}
            bankDetails={bankDetails}
          />
        </Card>
      </div>
    </div>
  );
}
