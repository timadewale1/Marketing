"use client";

import React, { useEffect, useState } from "react";
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
  createdAt?: {
    seconds: number;
    nanoseconds: number;
  };
  status?: 'pending' | 'completed';
};

export default function ReferralsPage() {
  const router = useRouter();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) {
      router.push('/auth/sign-in');
      return;
    }

    // Use current origin so invite links remain correct across environments
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://pambaadverts.com'
      setInviteLink(`${origin}/auth/sign-up?ref=${u.uid}`)
    } catch {
      setInviteLink(`https://pambaadverts.com/auth/sign-up?ref=${u.uid}`)
    }
    const q = query(collection(db, "referrals"), where("referrerId", "==", u.uid));
    const unsub = onSnapshot(q, (snap) => {
      setReferrals(snap.docs.map((d) => ({ 
        email: d.data().email,
        name: d.data().name,
        amount: d.data().amount,
        createdAt: d.data().createdAt,
        status: d.data().status,
        id: d.id 
      })));
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalEarned = referrals.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const completedReferrals = referrals.filter(r => r.status === 'completed').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
      <div className="px-6 py-8 max-w-4xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.back()} className="hover:bg-white/20">
            <ArrowLeft size={16} className="mr-2" /> Back
          </Button>
          <h1 className="text-2xl font-semibold text-stone-800">Referrals</h1>
        </div>

        <Card className="bg-white/80 backdrop-blur p-6 mb-6">
          <h2 className="text-lg font-semibold text-stone-800 mb-4">Share your invite link</h2>
          <div>
            <div className="mb-4 space-y-3">
              <div className="bg-stone-50 p-4 rounded-lg space-y-2">
                <h3 className="font-medium text-stone-800">Earn by referring others:</h3>
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
                    ₦1,000 per activated earner
                  </div>
                  <div className="text-xs text-stone-500">
                    Paid when referred earner pays ₦2,000 activation fee
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                    ₦1,000 per activated advertiser
                  </div>
                  <div className="text-xs text-stone-500">
                    Paid when the referred advertiser activates their account
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <input 
                className="flex-1 px-4 py-2.5 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                readOnly 
                value={inviteLink} 
              />
              <Button
                onClick={handleCopy}
                className="bg-amber-500 hover:bg-amber-600 text-stone-900 font-medium"
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card className="bg-white/80 backdrop-blur p-6">
            <h3 className="text-sm font-medium text-stone-500 mb-2">Total Completed Referrals</h3>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-stone-800">{completedReferrals}</span>
              <span className="text-stone-500">out of {referrals.length}</span>
            </div>
          </Card>

          <Card className="bg-white/80 backdrop-blur p-6">
            <h3 className="text-sm font-medium text-stone-500 mb-2">Total Earnings</h3>
            <div className="text-3xl font-bold text-amber-600">
              ₦{totalEarned.toLocaleString()}
            </div>
          </Card>
        </div>

        <div className="bg-white/80 backdrop-blur rounded-lg p-6">
          <h3 className="text-lg font-semibold text-stone-800 mb-4">Referral History</h3>
          {loading ? (
            <PageLoader />
          ) : referrals.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-stone-600">No referrals yet. Share your link to start earning!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {referrals.map((r) => (
                <Card key={r.id} className="p-4 hover:shadow-md transition duration-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-stone-800">
                        {r.email || r.name || "New user"}
                      </div>
                      <div className="text-sm text-stone-500 mt-1">
                        {new Date((r.createdAt?.seconds ?? 0) * 1000 || Date.now()).toLocaleDateString()} at{" "}
                        {new Date((r.createdAt?.seconds ?? 0) * 1000 || Date.now()).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`mb-1 text-sm px-2 py-1 rounded-full ${
                        r.status === 'completed' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {r.status === 'completed' ? 'Completed' : 'Pending'}
                      </div>
                      <div className="font-bold text-amber-600">
                        ₦{(r.amount || 1000).toLocaleString()}
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
