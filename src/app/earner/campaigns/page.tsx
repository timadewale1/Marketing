"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import Image from "next/image"
import toast from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PageLoader } from "@/components/ui/loader";

type Campaign = {
  id: string;
  title: string;
  category?: string;
  budget?: number;
  costPerLead?: number;
  reward?: number;
  bannerUrl?: string;
  status?: string;
};

export default function AvailableCampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  const [participatedIds, setParticipatedIds] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string>("All");
  useEffect(() => {
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
    const u = auth.currentUser
    let unsubParts: (() => void) | null = null
    if (u) {
      const qParts = query(collection(db, "earnerSubmissions"), where("userId", "==", u.uid))
      type Sub = { campaignId?: string }
      unsubParts = onSnapshot(qParts, (s) => {
        setParticipatedIds(s.docs.map(d => (d.data() as Sub).campaignId).filter(Boolean) as string[])
      })
    }
    return () => { unsub(); if (unsubParts) unsubParts() }
  }, [router]);

  const categories = Array.from(new Set(campaigns.map((c) => c.category || "").filter(Boolean)));
  const filteredCampaigns = campaigns.filter((c) => filterType === "All" || c.category === filterType);

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
      <div className="px-6 py-8 max-w-6xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.back()} className="hover:bg-white/20">
            <ArrowLeft size={16} className="mr-2" /> Back
          </Button>
          <h1 className="text-2xl font-semibold text-stone-800">Available Campaigns</h1>
        </div>

        {loading ? (
          <PageLoader />
        ) : (
          <div>
            <div className="flex items-center justify-end mb-4">
              <select className="border rounded px-2 py-1" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="All">All Types</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCampaigns.length === 0 ? (
                <div className="col-span-full text-center py-8">
                  <p className="text-stone-600">No active campaigns right now.</p>
                </div>
              ) : (
                filteredCampaigns.map((c) => {
                  const already = participatedIds.includes(c.id)
                  // Calculate earner price as half of cost per lead (not total budget)
                  const earnerPrice = Math.round((c.costPerLead || 0) / 2);

                  return (
                    <Card key={c.id} className="overflow-hidden bg-white/80 backdrop-blur hover:shadow-xl transition duration-300">
                      <div className="relative h-48 overflow-hidden">
                        <div className="h-full w-full bg-stone-100">
                          <div className="w-full h-full relative">
                            <Image src={c.bannerUrl || "/placeholders/default.jpg"} alt={c.title || 'campaign banner'} fill style={{ objectFit: 'cover' }} />
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
                              toast.error("Please login to participate in campaigns")
                              router.push('/auth/sign-in')
                              return
                            }
                            if (already) {
                              toast("You've already participated in this campaign", { icon: 'ℹ️' })
                              return
                            }
                            router.push(`/earner/campaigns/${c.id}`)
                          }}
                          className={`w-full ${already ? 'bg-stone-200 text-stone-500 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-600 text-stone-900 font-medium'}`}
                          disabled={already}
                        >
                          {already ? 'Participated' : 'Participate'}
                        </Button>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
