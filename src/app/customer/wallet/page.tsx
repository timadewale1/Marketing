"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FundWalletModal } from "@/components/fund-wallet-modal";
import { Wallet } from "lucide-react";
import toast from "react-hot-toast";

export default function CustomerWalletPage() {
  const router = useRouter();
  const [balance, setBalance] = useState(0);
  const [fundModalOpen, setFundModalOpen] = useState(false);
  const [email, setEmail] = useState<string | undefined>(undefined);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.push("/auth/sign-in?marketplace=1");
      return;
    }
    setEmail(user.email || undefined);
    const unsub = onSnapshot(doc(db, "customers", user.uid), (snap) => {
      if (!snap.exists()) return;
      setBalance(Number(snap.data()?.balance || 0));
    });
    return () => unsub();
  }, [router]);

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border-cyan-100 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-stone-500">Customer wallet</p>
            <p className="mt-2 text-3xl font-semibold text-stone-900">₦{Math.max(0, balance).toLocaleString()}</p>
          </div>
          <Wallet className="h-8 w-8 text-cyan-700" />
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setFundModalOpen(true)} className="rounded-full bg-cyan-700 hover:bg-cyan-600">
          Fund wallet
        </Button>
        <Button variant="outline" onClick={() => router.push("/customer/transactions")} className="rounded-full">
          Transactions & withdrawals
        </Button>
      </div>

      <FundWalletModal
        onlyMonnify
        open={fundModalOpen}
        email={email}
        onClose={() => setFundModalOpen(false)}
        onSuccess={async () => {
          setFundModalOpen(false);
          toast.success("Wallet funding initiated");
          const user = auth.currentUser;
          if (!user) return;
          const snap = await getDoc(doc(db, "customers", user.uid));
          if (snap.exists()) setBalance(Number(snap.data()?.balance || 0));
        }}
      />
    </div>
  );
}
