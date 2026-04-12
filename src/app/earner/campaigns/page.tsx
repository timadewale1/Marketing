"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, doc } from "firebase/firestore";
import Image from "next/image"
import toast from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PageLoader } from "@/components/ui/loader";
import { PaymentSelector } from '@/components/payment-selector';
import { registerActivationReference } from "@/lib/activation-client";

type Campaign = {
  id: string;
  title: string;
  category?: string;
  budget?: number;
  reservedBudget?: number;
  costPerLead?: number;
  reward?: number;
  bannerUrl?: string;
  status?: string;
};

// All available task types (should match advertiser pricelist)
const TASK_TYPES = [
  "Video",
  "Share my Product",
  "other website tasks",
  "Survey",
  "App Download",
  "Instagram Follow",
  "Instagram Like",
  "Instagram Share",
  "Twitter Follow",
  "Twitter Retweet",
  "Facebook Like",
  "Facebook Share",
  "TikTok Follow",
  "TikTok Like",
  "TikTok Share",
  "YouTube Subscribe",
  "YouTube Like",
  "YouTube Comment",
  "WhatsApp Status",
  "WhatsApp Group Join",
  "Telegram Group Join",
  "Facebook Group Join",
];

export default function AvailableCampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [activated, setActivated] = useState<boolean | null>(null);
  const [strikeCount, setStrikeCount] = useState<number>(0);
  const [accountStatus, setAccountStatus] = useState<string>("active");
  const [activatingLoading, setActivatingLoading] = useState(true);
  const [showActivationPaymentSelector, setShowActivationPaymentSelector] = useState(false);
  const activationReloadedRef = useRef(false);
  const previousActivatedRef = useRef<boolean | null>(null);

  const [participatedIds, setParticipatedIds] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string>("All");
  useEffect(() => {
    const u = auth.currentUser
    let unsubProfile: (() => void) | null = null
    if (u) {
      if (!u.emailVerified) {
        router.replace("/auth/verify-email")
        setActivated(false)
        setActivatingLoading(false)
        return
      }
      const earnerDoc = doc(db, "earners", u.uid)
      unsubProfile = onSnapshot(earnerDoc, (d) => {
        if (!d.exists()) {
          router.replace("/auth/sign-in")
          setActivatingLoading(false)
          return
        }
        if (!d.data()?.onboarded) {
          router.replace("/earner/onboarding")
          setActivatingLoading(false)
          return
        }
        const nextActivated = !!d.data()?.activated
        setActivated(nextActivated)
        setStrikeCount(Number(d.data()?.strikeCount || 0))
        setAccountStatus(String(d.data()?.status || "active"))
        if (
          previousActivatedRef.current === false &&
          nextActivated &&
          !activationReloadedRef.current
        ) {
          activationReloadedRef.current = true
          toast.success("Your account is now activated. Refreshing this page...")
          setTimeout(() => window.location.reload(), 700)
        }
        previousActivatedRef.current = nextActivated
        setActivatingLoading(false)
      })
    } else {
      setActivated(false)
      setActivatingLoading(false)
    }

    const q = query(collection(db, "campaigns"), where("status", "==", "Active"));
    const unsub = onSnapshot(q, (snap) => {
      setCampaigns(
        snap.docs.map((d) => {
          const data = d.data() as Partial<Campaign>;
          return {
            id: d.id,
            title: data.title,
            category: data.category,
            budget: data.budget,
            reservedBudget: data.reservedBudget,
            costPerLead: data.costPerLead,
            reward: data.reward,
            bannerUrl: data.bannerUrl,
            status: data.status,
          } as Campaign;
        })
      );
      setLoading(false);
    });
    // load user's participated campaign ids if logged in
    let unsubParts: (() => void) | null = null
    const user = auth.currentUser
    if (user) {
      const qParts = query(collection(db, "earnerSubmissions"), where("userId", "==", user.uid))
      type Sub = { campaignId?: string }
      unsubParts = onSnapshot(qParts, (s) => {
        setParticipatedIds(s.docs.map(d => (d.data() as Sub).campaignId).filter(Boolean) as string[])
      })
    }
    return () => {
      unsub();
      if (unsubParts) unsubParts();
      if (unsubProfile) unsubProfile();
    }
  }, [router]);

  const filteredCampaigns = campaigns
    .filter((c) => Number(c.budget || 0) > 0)
    .filter((c) => filterType === "All" || c.category === filterType)
    .filter((c) => !participatedIds.includes(c.id));

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
      <div className="px-6 py-8 max-w-6xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.back()} className="hover:bg-white/20">
            <ArrowLeft size={16} className="mr-2" /> Back
          </Button>
          <h1 className="text-2xl font-semibold text-stone-800">Available Tasks</h1>
        </div>

        {activatingLoading || loading ? (
          <PageLoader />
        ) : activated === false ? (
          <div className="col-span-full text-center py-20 px-6">
            <div className="mb-8 relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-300 to-pink-300 opacity-20 animate-spin"></div>
              <div className="relative w-32 h-32 flex items-center justify-center">
                <div className="text-6xl animate-pulse">🔒</div>
              </div>
            </div>
            <h2 className="text-3xl font-bold text-stone-800 mb-3">Account Not Activated</h2>
            <p className="text-lg text-stone-600 text-center max-w-md mb-2">Please activate your account to see available tasks.</p>
            <p className="text-base text-stone-500 text-center max-w-md">
              Once you complete activation, refresh this page and tasks will appear.
            </p>
            {accountStatus === "suspended" ? (
              <p className="mt-3 text-sm text-red-600">Your account is suspended. Please contact support for review.</p>
            ) : strikeCount > 0 ? (
              <p className="mt-3 text-sm text-amber-600">
                You have {strikeCount} strike{strikeCount === 1 ? "" : "s"}. Repeated rejected submissions can lead to suspension.
              </p>
            ) : null}
            <Button size="sm" className="mt-4 bg-amber-500 text-stone-900" onClick={() => setShowActivationPaymentSelector(true)}>
              Activate Account (₦2,000)
            </Button>
          </div>
        ) : (
          <div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-stone-700 mb-2">Filter by Task Type</label>
              <select className="w-full md:w-64 border border-stone-300 rounded-lg px-4 py-2 bg-white text-stone-800 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="All">All Task Types</option>
                {TASK_TYPES.map((taskType) => (
                  <option key={taskType} value={taskType}>{taskType}</option>
                ))}
              </select>
            </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCampaigns.length === 0 ? (
                <div className="col-span-full">
                  <div className="flex flex-col items-center justify-center py-20 px-6">
                    {/* Animated illustration container */}
                    <div className="mb-8 relative">
                      {/* Outer animated ring */}
                      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-300 to-orange-300 opacity-20 animate-spin"></div>
                      
                      {/* Main icon container */}
                      <div className="relative w-32 h-32 flex items-center justify-center">
                        <div className="text-6xl animate-bounce">
                          📭
                        </div>
                      </div>
                    </div>

                    {/* Text content */}
                    <h2 className="text-3xl font-bold text-stone-800 mb-3 text-center">
                      No Available Tasks
                    </h2>
                    <p className="text-lg text-stone-600 text-center max-w-md mb-2">
                      at the moment
                    </p>
                    <p className="text-base text-stone-500 text-center max-w-md">
                      Check back later for more exciting tasks to earn rewards! 🎯
                    </p>

                    {/* Animated dots indicator */}
                    <div className="mt-8 flex gap-2 justify-center">
                      <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0s' }}></div>
                      <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                      <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                    </div>
                  </div>
                </div>
              ) : (
                filteredCampaigns.map((c) => {
                  // Calculate earner price as half of cost per lead
                  const earnerPrice = Math.round((c.costPerLead || 0) / 2);

                  return (
                    <Card key={c.id} className="overflow-hidden bg-white/80 backdrop-blur hover:shadow-xl transition duration-300">
                      <div className="relative h-48 overflow-hidden">
                        <div className="h-full w-full bg-stone-100">
                          <div className="w-full h-full relative">
                            <Image src={c.bannerUrl || "/placeholders/default.jpg"} alt={c.title || 'task banner'} fill style={{ objectFit: 'cover' }} />
                          </div>
                        </div>
                        <div className="absolute top-3 right-3">
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-white/90 text-stone-800">
                            {c.category}
                          </span>
                        </div>
                      </div>
                      <div className="p-5">
                        <h3 className="font-semibold text-lg text-stone-800 mb-2">{c.title}</h3>
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-sm text-stone-600">Earn per lead</p>
                            <p className="text-xl font-bold text-amber-600">₦{earnerPrice.toLocaleString()}</p>
                          </div>
                        </div>
                        <Button
                          onClick={() => {
                            const user = auth.currentUser
                            if (!user) {
                              toast.error("Please login to participate in tasks")
                              router.push('/auth/sign-in')
                              return
                            }
                            if (accountStatus === "suspended") {
                              toast.error("Your account is suspended. Please contact support for review.")
                              return
                            }
                            router.push(`/earner/campaigns/${c.id}`)
                          }}
                          className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-medium"
                        >
                          Participate
                        </Button>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        )}
      {showActivationPaymentSelector && (
        <PaymentSelector
          open={showActivationPaymentSelector}
          amount={2000}
          email={auth.currentUser?.email || undefined}
          fullName={auth.currentUser?.displayName || 'Earner'}
          description="Earner Account Activation"
          onMonnifyReferenceCreated={async (reference: string) => {
            await registerActivationReference({ role: 'earner', reference, provider: 'monnify' })
          }}
          onClose={() => {
            setShowActivationPaymentSelector(false)
          }}
          onPaymentSuccess={async (reference: string, provider: 'paystack' | 'monnify', monnifyResponse?: Record<string, unknown>) => {
            setShowActivationPaymentSelector(false)
            try {
              const res = await fetch('/api/earner/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference, userId: auth.currentUser?.uid, provider, monnifyResponse }),
              })
              const data = await res.json()
              if (res.ok && data.success) {
                if (data.pendingConfirmation) {
                  toast.success('Payment received. Your account will activate after Monnify confirms it.')
                } else {
                  toast.success('Activation successful')
                  setActivated(true)
                }
              } else {
                toast.error(data?.message || 'Activation failed')
              }
            } catch (err) {
              console.error('Activation error', err)
              toast.error('Activation request failed')
            }
          }}
        />
      )}
      </div>
    </div>
  );
}
