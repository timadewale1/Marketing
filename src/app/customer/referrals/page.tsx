"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { collection, getCountFromServer, limit, onSnapshot, query, where } from "firebase/firestore";
import { ArrowLeft, CheckCheck, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/loader";
import { getReferralPromoCopy } from "@/lib/referral-rewards";

type ReferralRow = {
  id: string;
  email?: string;
  name?: string;
  amount?: number;
  userType?: "earner" | "advertiser" | "vendor" | "customer";
  condition?: string;
  status?: "pending" | "completed";
  createdAt?: { seconds?: number };
};

function getReferralConditionLabel(condition?: string) {
  if (condition === "activation") return "activation";
  if (condition === "advertiser_first_task" || condition === "advertiser_task") return "advertiser task";
  if (condition === "vendor_setup_fee" || condition === "setup_fee") return "vendor setup fee";
  return condition || "referral";
}

export default function CustomerReferralsPage() {
  const router = useRouter();
  const referralPromo = getReferralPromoCopy();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [summary, setSummary] = useState({ total: 0, completed: 0, pending: 0 });
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.push("/auth/sign-in?marketplace=1");
      return;
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "https://www.pambaadverts.com";
    setInviteLink(`${origin}/auth/sign-up?ref=${user.uid}&marketplace=1`);

    void Promise.all([
      getCountFromServer(query(collection(db, "referrals"), where("referrerId", "==", user.uid))),
      getCountFromServer(query(collection(db, "referrals"), where("referrerId", "==", user.uid), where("status", "==", "completed"))),
    ])
      .then(([allSnap, doneSnap]) => {
        const total = allSnap.data().count;
        const completed = doneSnap.data().count;
        setSummary({ total, completed, pending: Math.max(0, total - completed) });
      })
      .catch(() => undefined);

    const q = query(collection(db, "referrals"), where("referrerId", "==", user.uid), limit(250));
    const unsub = onSnapshot(q, (snap) => {
      setRows(
        snap.docs.map((docItem) => {
          const data = docItem.data();
          return {
            id: docItem.id,
            email: String(data.email || ""),
            name: String(data.name || ""),
            amount: Number(data.amount || 0),
            userType: data.userType,
            condition: String(data.condition || ""),
            status: String(data.status || "pending") as "pending" | "completed",
            createdAt: data.createdAt,
          };
        })
      );
      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  const stats = useMemo(() => {
    const completedRows = rows.filter((row) => row.status === "completed");
    const pendingRows = rows.filter((row) => row.status !== "completed");

    return {
      totalEarned: completedRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      pendingEarn: pendingRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    };
  }, [rows]);

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-cyan-100 to-stone-300 px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft size={16} className="mr-2" /> Back
          </Button>
          <h1 className="text-2xl font-semibold text-stone-900">Customer referrals</h1>
        </div>

        <Card className="bg-white/80 p-6">
          <h2 className="text-lg font-semibold text-stone-900">Share your invite link</h2>
          <p className="mt-2 text-sm text-stone-600">
            Activation bonus: {referralPromo.activation} • Advertiser task bonus: {referralPromo.advertiserTask} • Vendor setup bonus: 10% of setup fee for any Pamba vendor you refer.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input readOnly value={inviteLink} className="h-11 flex-1 rounded-xl border border-stone-200 px-3 text-sm" />
            <Button onClick={() => void copyInvite()}>
              {copied ? (
                <>
                  <CheckCheck size={16} className="mr-2" />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={16} className="mr-2" />
                  Copy link
                </>
              )}
            </Button>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-white/80 p-5">
            <p className="text-sm text-stone-500">Completed referrals</p>
            <p className="mt-2 text-3xl font-semibold text-stone-900">{summary.completed}</p>
          </Card>
          <Card className="bg-white/80 p-5">
            <p className="text-sm text-stone-500">Total earned</p>
            <p className="mt-2 text-3xl font-semibold text-cyan-700">₦{stats.totalEarned.toLocaleString()}</p>
          </Card>
          <Card className="bg-white/80 p-5">
            <p className="text-sm text-stone-500">Pending earnings</p>
            <p className="mt-2 text-3xl font-semibold text-stone-900">₦{stats.pendingEarn.toLocaleString()}</p>
          </Card>
        </div>

        <Card className="bg-white/80 p-6">
          <h3 className="text-lg font-semibold text-stone-900">Referral history</h3>
          {loading ? (
            <PageLoader />
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-stone-600">No referrals yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {rows.map((row) => (
                <div key={row.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-stone-900">{row.name || row.email || "Referred user"}</p>
                      <p className="text-xs text-stone-500">
                        {row.userType || "user"} • {getReferralConditionLabel(row.condition)} •{" "}
                        {new Date((row.createdAt?.seconds || 0) * 1000 || Date.now()).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs ${
                          row.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {row.status === "completed" ? "Completed" : "Pending"}
                      </span>
                      <p className="mt-2 font-semibold text-cyan-700">₦{Number(row.amount || 0).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
