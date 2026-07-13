"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import CashbackClaimPanel from "@/components/marketplace/CashbackClaimPanel";
import { Gift, Repeat, ShoppingBag, Store } from "lucide-react";

type CustomerProfile = {
  name?: string;
  balance?: number;
  cashbackApprovedAmountTotal?: number;
  cashbackApprovedOrderTotal?: number;
  pointsBalance?: number;
};

export default function CustomerDashboardPage() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsub = onSnapshot(doc(db, "customers", user.uid), (snap) => {
      if (!snap.exists()) return;
      setProfile(snap.data() as CustomerProfile);
    });
    return () => unsub();
  }, []);

  return (
    <div className="space-y-6">
      <Card className="rounded-[30px] border-cyan-100 bg-white shadow-[0_24px_80px_-60px_rgba(8,145,178,0.55)]">
        <CardContent className="p-6 md:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-700">
            <ShoppingBag className="h-4 w-4" />
            Marketplace customer
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-stone-900">Welcome{profile?.name ? `, ${profile.name}` : ""}.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
            Track your approved cashback and referrals in one place while shopping from verified vendors.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild className="rounded-full bg-cyan-700 hover:bg-cyan-600">
              <Link href="/marketplace">Shop now</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/customer/referrals">View referrals</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/customer/purchases">Purchase history</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/customer/wallet">Wallet</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/customer/bank">Bank details</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="rounded-3xl border-stone-200 bg-white">
          <CardContent className="p-5">
            <Gift className="h-5 w-5 text-cyan-600" />
            <p className="mt-3 text-xs uppercase tracking-[0.28em] text-stone-500">Cashback balance</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">₦{Number(profile?.balance || 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-stone-200 bg-white">
          <CardContent className="p-5">
            <Store className="h-5 w-5 text-sky-600" />
            <p className="mt-3 text-xs uppercase tracking-[0.28em] text-stone-500">Approved orders total</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">₦{Number(profile?.cashbackApprovedOrderTotal || 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-stone-200 bg-white">
          <CardContent className="p-5">
            <Repeat className="h-5 w-5 text-emerald-600" />
            <p className="mt-3 text-xs uppercase tracking-[0.28em] text-stone-500">Approved cashback total</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">₦{Number(profile?.cashbackApprovedAmountTotal || 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-stone-200 bg-white">
          <CardContent className="p-5">
            <Gift className="h-5 w-5 text-amber-600" />
            <p className="mt-3 text-xs uppercase tracking-[0.28em] text-stone-500">Points</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">{Number(profile?.pointsBalance || 0).toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <CashbackClaimPanel role="customer" />
    </div>
  );
}
