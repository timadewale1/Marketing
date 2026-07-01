"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { collection, doc, getDoc, limit, onSnapshot, query, where } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WithdrawDialog } from "@/components/withdraw-dialog";
import { PageLoader } from "@/components/ui/loader";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";

type Transaction = {
  id: string;
  type?: string;
  note?: string;
  amount: number;
  status?: string;
  withdrawalId?: string;
  createdAt?: { seconds?: number };
};

export default function CustomerTransactionsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [withdrawalStatusMap, setWithdrawalStatusMap] = useState<Record<string, string>>({});
  const [balance, setBalance] = useState(0);
  const [bankDetails, setBankDetails] = useState<{ accountNumber: string; bankName: string; accountName: string } | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const transactionsPerPage = 8;

  const handleWithdraw = async (amount: number) => {
    const user = auth.currentUser;
    if (!user) {
      toast.error("You must be signed in to withdraw");
      return;
    }
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/customer/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(String(data?.message || "Withdrawal failed"));
        return;
      }
      toast.success(String(data?.message || "Withdrawal request submitted"));
      setWithdrawOpen(false);
    } catch (error) {
      console.error("Customer withdrawal error", error);
      toast.error("Failed to submit withdrawal request");
    }
  };

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.push("/auth/sign-in?marketplace=1");
      return;
    }

    const txQ = query(collection(db, "customerTransactions"), where("userId", "==", user.uid), limit(250));
    const unsubTx = onSnapshot(txQ, (snap) => {
      const list = snap.docs
        .map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            type: String(data.type || ""),
            note: String(data.note || ""),
            amount: Number(data.amount || 0),
            status: String(data.status || ""),
            withdrawalId: String(data.withdrawalId || ""),
            createdAt: data.createdAt as { seconds?: number } | undefined,
          };
        })
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setHistory(list);
      setLoading(false);
    });

    const wQ = query(collection(db, "customerWithdrawals"), where("userId", "==", user.uid), limit(150));
    const unsubW = onSnapshot(wQ, (snap) => {
      const map: Record<string, string> = {};
      snap.docs.forEach((d) => {
        map[d.id] = String(d.data()?.status || "");
      });
      setWithdrawalStatusMap(map);
    });

    void (async () => {
      try {
        const profileSnap = await getDoc(doc(db, "customers", user.uid));
        if (!profileSnap.exists()) return;
        const data = profileSnap.data() as { balance?: number; bank?: { accountNumber?: string; bankName?: string; accountName?: string } };
        setBalance(Number(data.balance || 0));
        if (data.bank?.accountNumber && data.bank?.bankName && data.bank?.accountName) {
          setBankDetails({
            accountNumber: data.bank.accountNumber,
            bankName: data.bank.bankName,
            accountName: data.bank.accountName,
          });
        }
      } catch (error) {
        console.warn("Failed to load customer profile", error);
      }
    })();

    return () => {
      unsubTx();
      unsubW();
    };
  }, [router]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft size={16} className="mr-2" /> Back
          </Button>
          <h1 className="text-2xl font-semibold text-stone-900">Customer Transactions</h1>
        </div>
        <Button onClick={() => setWithdrawOpen(true)} disabled={!bankDetails} className="rounded-full bg-cyan-700 hover:bg-cyan-600">
          Withdraw
        </Button>
      </div>

      <Card className="rounded-2xl border-stone-200 bg-white p-5">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">Available balance</p>
        <p className="mt-2 text-3xl font-semibold text-stone-900">₦{Math.max(0, balance).toLocaleString()}</p>
      </Card>

      <Card className="rounded-2xl border-stone-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-stone-900">History</h2>
        {loading ? (
          <div className="py-8"><PageLoader /></div>
        ) : history.length === 0 ? (
          <p className="py-10 text-sm text-stone-600">No transactions yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {history.slice((currentPage - 1) * transactionsPerPage, currentPage * transactionsPerPage).map((tx) => {
              const status = tx.withdrawalId ? withdrawalStatusMap[tx.withdrawalId] || tx.status : tx.status;
              return (
                <div key={tx.id} className="rounded-xl border border-stone-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-stone-900">{tx.note || tx.type || "Transaction"}</p>
                      {tx.createdAt?.seconds ? (
                        <p className="text-xs text-stone-500 mt-1">{new Date(tx.createdAt.seconds * 1000).toLocaleString()}</p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${tx.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {tx.amount < 0 ? "-" : "+"}₦{Math.abs(tx.amount).toLocaleString()}
                      </p>
                      {status ? <p className="mt-1 text-xs text-stone-500">{status}</p> : null}
                    </div>
                  </div>
                </div>
              );
            })}
            {history.length > transactionsPerPage ? (
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>Prev</Button>
                <span className="text-xs text-stone-600">{currentPage} / {Math.ceil(history.length / transactionsPerPage)}</span>
                <Button variant="outline" size="sm" disabled={currentPage >= Math.ceil(history.length / transactionsPerPage)} onClick={() => setCurrentPage((p) => p + 1)}>Next</Button>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <WithdrawDialog
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        onSubmit={handleWithdraw}
        maxAmount={Math.max(0, balance)}
        bankDetails={bankDetails}
      />
    </div>
  );
}
