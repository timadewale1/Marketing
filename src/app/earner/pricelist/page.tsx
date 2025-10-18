"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PriceListPage() {
  type CampaignType = {
    category: string;
    advertiserPrice: number;
    earnerPrice: number;
  };
  const [campaignTypes, setCampaignTypes] = useState<CampaignType[]>([]);

  useEffect(() => {
    // Simple: read active campaigns and derive typical prices per category (avg)
    const unsub = onSnapshot(collection(db, "campaigns"), (snap) => {
      const map: Record<string, number[]> = {};
      snap.docs.forEach((d) => {
        type CampaignData = {
          category?: string;
          reward?: number;
          budget?: number;
          costPerLead?: number;
        };
        const r = d.data() as CampaignData;
        const cat = r.category || "General";
        const price = r.reward ?? r.budget ?? r.costPerLead ?? 0;
        map[cat] = map[cat] || [];
        map[cat].push(price);
      });
      const result = Object.entries(map).map(([cat, arr]) => {
        const avg = Math.round(arr.reduce((s, v) => s + (v || 0), 0) / (arr.length || 1));
        return { category: cat, advertiserPrice: avg, earnerPrice: Math.round(avg / 2) };
      });
      setCampaignTypes(result);
    });
    return () => unsub();
  }, []);

  const router = useRouter();
  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
      <div className="px-6 py-8 max-w-3xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.back()} className="hover:bg-white/20">
            <ArrowLeft size={16} className="mr-2" /> Back
          </Button>
          <h1 className="text-2xl font-semibold text-stone-800">Campaign Price List</h1>
        </div>

        <Card className="bg-white/80 backdrop-blur p-6">
          <h2 className="text-lg font-semibold text-stone-800 mb-4">Categories & Earner Price</h2>
          <div className="divide-y divide-stone-200">
            {campaignTypes.map((c) => (
              <div key={c.category} className="flex items-center justify-between py-4">
                <div>
                  <div className="font-medium text-stone-800">{c.category}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-stone-500">Earner price</div>
                  <div className="font-bold text-amber-600 text-lg">₦{c.earnerPrice.toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
