"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AdvertiserPriceListPage() {
  // canonical campaign types and CPL map (should match create-campaign)
  const CPL_MAP: Record<string, number> = {
    Video: 250,
    Picture: 150,
    "Third-Party Task": 100,
    Survey: 100,
    "App Download": 200,
    "Instagram Follow": 80,
    "Instagram Like": 50,
    "Instagram Share": 60,
    "Twitter Follow": 80,
    "Twitter Retweet": 60,
    "Facebook Like": 50,
    "Facebook Share": 60,
    "TikTok Follow": 80,
    "TikTok Like": 50,
    "TikTok Share": 60,
    "YouTube Subscribe": 100,
    "YouTube Like": 60,
    "YouTube Comment": 70,
  };
  const campaignTypes = Object.keys(CPL_MAP).map((k) => ({
    category: k,
    price: CPL_MAP[k],
  }));

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
          <h2 className="text-lg font-semibold text-stone-800 mb-4">Campaign Types & Cost Per Lead</h2>
          <div className="divide-y divide-stone-200">
            {campaignTypes.map((c) => (
              <div key={c.category} className="flex items-center justify-between py-4">
                <div>
                  <div className="font-medium text-stone-800">{c.category}</div>
                  <div className="text-sm text-stone-500 mt-1">
                    ₦{(c.price * 100).toLocaleString()} budget = {100} leads
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-stone-500">Cost per lead</div>
                  <div className="font-bold text-amber-600 text-lg">₦{c.price.toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}