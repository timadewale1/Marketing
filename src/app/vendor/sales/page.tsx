"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

type VendorSale = {
  id: string;
  buyerCollection: string;
  productId: string;
  amount: number;
  cashbackAmount: number;
  approvedAt?: { seconds?: number };
};

export default function VendorSalesPage() {
  const router = useRouter();
  const [sales, setSales] = useState<VendorSale[]>([]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.push("/auth/sign-in?marketplace=1");
      return;
    }
    const q = query(collection(db, "vendorSales"), where("vendorId", "==", user.uid), limit(300));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          return {
            id: docSnap.id,
            buyerCollection: String(data.buyerCollection || ""),
            productId: String(data.productId || "-"),
            amount: Number(data.amount || 0),
            cashbackAmount: Number(data.cashbackAmount || 0),
            approvedAt: data.approvedAt as { seconds?: number } | undefined,
          };
        })
        .sort((a, b) => (b.approvedAt?.seconds || 0) - (a.approvedAt?.seconds || 0));
      setSales(list);
    });
    return () => unsub();
  }, [router]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft size={16} className="mr-2" /> Back
        </Button>
        <h1 className="text-2xl font-semibold text-stone-900">Marketplace Sales</h1>
      </div>

      {sales.length === 0 ? (
        <Card className="rounded-2xl border-stone-200 bg-white p-8">
          <p className="text-sm text-stone-600">No approved marketplace purchase records yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {sales.map((sale) => (
            <Card key={sale.id} className="rounded-2xl border-stone-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-stone-900">Product {sale.productId}</p>
                  <p className="mt-1 text-sm text-stone-600">Buyer type: {sale.buyerCollection}</p>
                  {sale.approvedAt?.seconds ? <p className="mt-1 text-xs text-stone-500">{new Date(sale.approvedAt.seconds * 1000).toLocaleString()}</p> : null}
                </div>
                <div className="text-right">
                  <p className="text-sm text-stone-600">Order</p>
                  <p className="font-semibold text-stone-900">₦{sale.amount.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-emerald-600">Cashback paid: ₦{sale.cashbackAmount.toLocaleString()}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
