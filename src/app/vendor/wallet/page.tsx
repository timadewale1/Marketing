"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, limit, onSnapshot, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FundWalletModal } from "@/components/fund-wallet-modal";
import { WithdrawDialog } from "@/components/withdraw-dialog";
import { Wallet, RefreshCw } from "lucide-react";
import { toast } from "react-hot-toast";

type Withdrawal = {
  id: string;
  amount: number;
  status: string;
  createdAt?: { seconds?: number };
  bank?: { accountNumber?: string; bankName?: string; accountName?: string };
};

export default function VendorWalletPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "withdraw">("overview");
  const [fundModalOpen, setFundModalOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [bankDetails, setBankDetails] = useState<{ accountNumber: string; bankName: string; accountName: string } | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [totalDeposited, setTotalDeposited] = useState(0);
  const [balance, setBalance] = useState(0);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const withdrawalsPerPage = 5;

  useEffect(() => {
    let unsubWithdrawals: (() => void) | null = null;
    let unsubTx: (() => void) | null = null;

    const stopAll = () => {
      if (unsubWithdrawals) unsubWithdrawals();
      if (unsubTx) unsubTx();
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      stopAll();

      if (!user) {
        setWithdrawals([]);
        return;
      }

      setUserEmail(user.email || null);

      const qW = query(collection(db, "vendorWithdrawals"), where("userId", "==", user.uid), limit(150));
      unsubWithdrawals = onSnapshot(qW, (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Withdrawal, "id">) }));
        setWithdrawals(data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      });

      void (async () => {
        try {
          const vendorRef = doc(db, "vendors", user.uid);
          const vendorSnap = await getDoc(vendorRef);
          if (vendorSnap.exists()) {
            const d = vendorSnap.data() as { bank?: { accountNumber?: string; bankName?: string; accountName?: string }; balance?: number };
            const bank = d.bank;
            if (bank?.accountNumber && bank?.bankName && bank?.accountName) {
              setBankDetails({ accountNumber: bank.accountNumber, bankName: bank.bankName, accountName: bank.accountName });
            } else {
              setBankDetails(null);
            }
            setBalance(Number(d.balance || 0));
          }
        } catch (error) {
          console.warn("Failed to load vendor profile for wallet", error);
        }
      })();

      try {
        const qT = query(collection(db, "vendorTransactions"), where("userId", "==", user.uid), limit(250));
        unsubTx = onSnapshot(qT, (snap) => {
          const txs = snap.docs.map((d) => d.data() as { type?: string; amount?: number | string; status?: string | null });
          const deposited = txs
            .filter((t) => t.type === "wallet_funding" && (t.status === "completed" || t.status == null))
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
          setTotalDeposited(deposited);
        });
      } catch (error) {
        console.warn("Failed to read vendorTransactions for wallet", error);
      }
    });

    return () => {
      unsubscribeAuth();
      stopAll();
    };
  }, []);

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
        const fresh = await getDoc(doc(db, "vendors", user.uid));
        if (fresh.exists()) setBalance(Number(fresh.data()?.balance || 0));
      } catch {
        // ignore refresh errors
      }
    } catch (error) {
      console.error("Vendor withdraw error", error);
      toast.error("Failed to create withdrawal request");
    }
  };

  const stats = [
    { title: "Total Deposited", value: `₦${Math.max(0, totalDeposited).toLocaleString()}`, icon: Wallet },
    { title: "Wallet Balance", value: `₦${Math.max(0, balance).toLocaleString()}`, icon: RefreshCw },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-cyan-100 to-stone-300 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => router.back()} className="hover:bg-white/20">
              ← Back
            </Button>
            <h1 className="text-2xl font-semibold">Vendor Wallet</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {stats.map((s) => (
            <Card key={s.title} className="p-4 bg-white/80 backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-cyan-700">{s.title}</div>
                  <div className="text-lg font-bold">{s.value}</div>
                </div>
                <div className="text-cyan-600">
                  <s.icon size={28} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="border-b">
            <nav className="flex -mb-px">
              <button
                className={`flex-1 py-4 px-6 text-center border-b-2 text-sm font-medium ${
                  activeTab === "overview" ? "border-cyan-500 text-cyan-700" : "border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300"
                }`}
                onClick={() => setActiveTab("overview")}
              >
                Overview
              </button>
              <button
                className={`flex-1 py-4 px-6 text-center border-b-2 text-sm font-medium ${
                  activeTab === "withdraw" ? "border-cyan-500 text-cyan-700" : "border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300"
                }`}
                onClick={() => setActiveTab("withdraw")}
              >
                Withdraw
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === "overview" ? (
              <div className="flex gap-3">
                <Button onClick={() => setFundModalOpen(true)} className="bg-cyan-700 hover:bg-cyan-600 text-white">
                  Fund Wallet
                </Button>
                <Button variant="outline" onClick={() => router.push("/vendor/transactions")}>
                  View Transactions
                </Button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-stone-800">Withdraw</h3>
                    <p className="text-sm text-stone-600">Request a withdrawal from your wallet balance.</p>
                  </div>
                  <Button onClick={() => setWithdrawOpen(true)} className="bg-cyan-700 hover:bg-cyan-600 text-white">
                    Request Withdrawal
                  </Button>
                </div>

                <div className="space-y-3">
                  {withdrawals.length === 0 ? (
                    <div className="text-center py-8 text-stone-600">No withdrawal requests yet.</div>
                  ) : (
                    <>
                      {withdrawals
                        .slice((currentPage - 1) * withdrawalsPerPage, currentPage * withdrawalsPerPage)
                        .map((w) => (
                          <Card key={w.id} className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium text-stone-800">₦{Number(w.amount || 0).toLocaleString()}</div>
                                <div className="text-sm text-stone-600">{w.bank?.bankName || ""}</div>
                              </div>
                              <div className="text-sm text-right">
                                <div
                                  className={`inline-block px-2 py-1 rounded-full text-xs ${
                                    String(w.status || "").includes("pending")
                                      ? "bg-amber-100 text-amber-700"
                                      : String(w.status || "") === "completed"
                                      ? "bg-green-100 text-green-700"
                                      : "bg-stone-100 text-stone-700"
                                  }`}
                                >
                                  {w.status || "pending"}
                                </div>
                              </div>
                            </div>
                          </Card>
                        ))}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <FundWalletModal
          onlyMonnify
          open={fundModalOpen}
          email={userEmail || undefined}
          onClose={() => setFundModalOpen(false)}
          onSuccess={async () => {
            setFundModalOpen(false);
            toast.success("Wallet funding initiated");
            const user = auth.currentUser;
            if (!user) return;
            try {
              const [vendorSnap, txSnap] = await Promise.all([
                getDoc(doc(db, "vendors", user.uid)),
                getDocs(query(collection(db, "vendorTransactions"), where("userId", "==", user.uid), limit(250))),
              ]);
              if (vendorSnap.exists()) setBalance(Number(vendorSnap.data()?.balance || 0));
              const deposited = txSnap.docs
                .map((d) => d.data() as { type?: string; amount?: number | string; status?: string | null })
                .filter((t) => t.type === "wallet_funding" && (t.status === "completed" || t.status == null))
                .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
              setTotalDeposited(deposited);
            } catch {
              // ignore
            }
          }}
        />

        <WithdrawDialog
          open={withdrawOpen}
          onClose={() => setWithdrawOpen(false)}
          onSubmit={handleVendorWithdraw}
          maxAmount={Math.max(0, balance)}
          bankDetails={bankDetails}
        />
      </div>
    </div>
  );
}
