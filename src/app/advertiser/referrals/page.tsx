"use client";

import React, { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Copy, CheckCheck } from "lucide-react";
import { PageLoader } from "@/components/ui/loader";
import { useRouter } from "next/navigation";

type Referral = {
  id: string;
  email?: string;
  name?: string;
  amount?: number;
  userType?: "earner" | "advertiser";
  bonusPaid?: boolean;
  createdAt?: {
    seconds: number;
    nanoseconds: number;
  };
  status?: "pending" | "completed";
};

export default function AdvertiserReferralsPage() {
  const router = useRouter();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.push("/auth/sign-in");
      return;
    }

    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "https://pambaadverts.com";
      setInviteLink(`${origin}/auth/sign-up?ref=${user.uid}&type=advertiser`);
    } catch {
      setInviteLink(`https://pambaadverts.com/auth/sign-up?ref=${user.uid}&type=advertiser`);
    }

    const q = query(collection(db, "referrals"), where("referrerId", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setReferrals(
        snap.docs.map((docItem) => ({
          id: docItem.id,
          email: docItem.data().email,
          name: docItem.data().name,
          amount: docItem.data().amount,
          createdAt: docItem.data().createdAt,
          status: docItem.data().status,
          userType: docItem.data().userType,
          bonusPaid: docItem.data().bonusPaid,
        }))
      );
      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const stats = useMemo(() => {
    const completed = referrals.filter((referral) => referral.status === "completed");
    const pending = referrals.filter((referral) => referral.status !== "completed");

    return {
      completedCount: completed.length,
      pendingCount: pending.length,
      totalEarned: completed.reduce((sum, referral) => sum + (Number(referral.amount) || 0), 0),
      pendingEarnings: pending.reduce((sum, referral) => sum + (Number(referral.amount) || 0), 0),
    };
  }, [referrals]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
      <div className="px-6 py-8 max-w-5xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.back()} className="hover:bg-white/20">
            <ArrowLeft size={16} className="mr-2" /> Back
          </Button>
          <h1 className="text-2xl font-semibold text-stone-800">Referrals</h1>
        </div>

        <Card className="bg-white/80 backdrop-blur p-6 mb-6">
          <h2 className="text-lg font-semibold text-stone-800 mb-4">Share your invite link</h2>
          <div className="space-y-4">
            <div className="bg-stone-50 p-4 rounded-lg space-y-3">
              <h3 className="font-medium text-stone-800">Earn by referring others:</h3>
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <div className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium w-fit">
                    ₦500 per activated advertiser
                  </div>
                  <div className="text-xs text-stone-500">
                    Paid when the referred advertiser activates their account.
                  </div>
                </div>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium w-fit">
                    ₦500 per activated earner
                  </div>
                  <div className="text-xs text-stone-500">
                    Paid when the referred earner completes activation.
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className="flex-1 min-w-0 px-4 py-2.5 bg-white border border-stone-200 rounded-lg text-sm break-all focus:outline-none focus:ring-2 focus:ring-amber-500"
                readOnly
                value={inviteLink}
              />
              <Button
                onClick={handleCopy}
                className="bg-amber-500 hover:bg-amber-600 text-stone-900 font-medium shrink-0"
              >
                {copied ? (
                  <span className="flex items-center gap-2">
                    <CheckCheck size={16} /> Copied
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Copy size={16} /> Copy Link
                  </span>
                )}
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-white/80 backdrop-blur p-6">
            <h3 className="text-sm font-medium text-stone-500 mb-2">Completed Referrals</h3>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-stone-800">{stats.completedCount}</span>
              <span className="text-stone-500">out of {referrals.length}</span>
            </div>
          </Card>

          <Card className="bg-white/80 backdrop-blur p-6">
            <h3 className="text-sm font-medium text-stone-500 mb-2">Total Earned Referrals</h3>
            <div className="text-3xl font-bold text-amber-600">
              ₦{stats.totalEarned.toLocaleString()}
            </div>
          </Card>

          <Card className="bg-white/80 backdrop-blur p-6">
            <h3 className="text-sm font-medium text-stone-500 mb-2">Pending Earnings</h3>
            <div className="text-3xl font-bold text-stone-800">
              ₦{stats.pendingEarnings.toLocaleString()}
            </div>
            <p className="mt-2 text-xs text-stone-500">{stats.pendingCount} referral(s) awaiting activation</p>
          </Card>
        </div>

        <div className="bg-white/80 backdrop-blur rounded-lg p-6">
          <h3 className="text-lg font-semibold text-stone-800 mb-4">Referral History</h3>
          {loading ? (
            <PageLoader />
          ) : referrals.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-stone-600">No referrals yet. Share your link to start earning.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {referrals.map((referral) => (
                <Card key={referral.id} className="p-4 hover:shadow-md transition duration-200">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="font-medium text-stone-800 break-words">
                        {referral.name || referral.email || "New user"}
                      </div>
                      <div className="text-sm text-stone-500 mt-1 break-words">
                        {new Date((referral.createdAt?.seconds ?? 0) * 1000 || Date.now()).toLocaleDateString()} at{" "}
                        {new Date((referral.createdAt?.seconds ?? 0) * 1000 || Date.now()).toLocaleTimeString()}
                      </div>
                      <div className="text-xs text-stone-500 mt-2">
                        Referred as {referral.userType || "user"}
                      </div>
                    </div>
                    <div className="text-left md:text-right shrink-0">
                      <div
                        className={`mb-2 inline-flex text-sm px-2 py-1 rounded-full ${
                          referral.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {referral.status === "completed" ? "Completed" : "Pending"}
                      </div>
                      <div className="font-bold text-amber-600">
                        ₦{(referral.amount || 500).toLocaleString()}
                      </div>
                      <div className="text-xs text-stone-500 mt-1">
                        {referral.status === "completed" ? "Bonus paid" : "Awaiting activation"}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
