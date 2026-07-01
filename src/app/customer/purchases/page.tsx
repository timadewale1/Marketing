"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

type PurchaseRecord = {
  id: string;
  vendorName: string;
  productId: string;
  amount: number;
  cashbackAmount: number;
  status: string;
  createdAt?: { seconds?: number };
};

export default function CustomerPurchasesPage() {
  const router = useRouter();
  const [records, setRecords] = useState<PurchaseRecord[]>([]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.push("/auth/sign-in?marketplace=1");
      return;
    }

    const q = query(collection(db, "vendorPurchaseSubmissions"), where("userId", "==", user.uid), limit(250));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          return {
            id: docSnap.id,
            vendorName: String(data.vendorName || "Vendor"),
            productId: String(data.productId || "-"),
            amount: Number(data.amount || 0),
            cashbackAmount: Number(data.cashbackAmount || 0),
            status: String(data.status || "pending"),
            createdAt: data.createdAt as { seconds?: number } | undefined,
          };
        })
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setRecords(list);
    });

    return () => unsub();
  }, [router]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft size={16} className="mr-2" /> Back
        </Button>
        <h1 className="text-2xl font-semibold text-stone-900">Purchase History</h1>
      </div>

      {records.length === 0 ? (
        <Card className="rounded-2xl border-stone-200 bg-white p-8">
          <p className="text-sm text-stone-600">No purchase records yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <Card key={record.id} className="rounded-2xl border-stone-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-stone-900">{record.vendorName}</p>
                  <p className="mt-1 text-sm text-stone-600">Product ID: {record.productId}</p>
                  <p className="mt-1 text-sm text-stone-600">Order: ₦{record.amount.toLocaleString()}</p>
                  {record.createdAt?.seconds ? <p className="mt-1 text-xs text-stone-500">{new Date(record.createdAt.seconds * 1000).toLocaleString()}</p> : null}
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-stone-600">Status</p>
                  <p className="text-sm font-semibold text-stone-900">{record.status}</p>
                  {record.status === "approved" ? (
                    <p className="mt-1 text-sm font-semibold text-emerald-600">Cashback ₦{record.cashbackAmount.toLocaleString()}</p>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
