"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PlusCircle, TrendingUp, Wallet, Users, Info } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import Link from "next/link"
import { ReactTyped } from "react-typed"
import { auth, db } from "@/lib/firebase"
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore"

type Campaign = {
  id: string
  name: string
  image: string
  status: "Active" | "Paused" | "Stopped"
  spend: string
  clicks: number
}

export default function AdvertiserDashboard() {
  const [filter, setFilter] = useState("Active")
  const [name, setName] = useState<string>("Loading...")
  const [campaigns, setCampaigns] = useState<Campaign[]>([])

  // Fetch advertiser name
  useEffect(() => {
    const fetchName = async () => {
      const user = auth.currentUser
      if (user) {
        const ref = doc(db, "advertisers", user.uid)
        const snap = await getDoc(ref)
        if (snap.exists()) {
          setName(snap.data().name)
        }
      }
    }
    fetchName()
  }, [])

  // Real-time campaigns
  
  // Real-time campaigns
useEffect(() => {
  const user = auth.currentUser;
  if (!user) return;

  const q = query(
    collection(db, "campaigns"),
    where("ownerId", "==", user.uid)
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const data: Campaign[] = snapshot.docs.map((doc) => ({
      id: doc.id, // Firestore document ID
      ...(doc.data() as Omit<Campaign, "id">), // all other fields
    }));

    setCampaigns(data);
  });

  return () => unsubscribe();
}, []);


  const filteredCampaigns = campaigns.filter(
    (c) => c.status.toLowerCase() === filter.toLowerCase()
  )

  return (
    <div className="px-6 py-10 space-y-12 bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300 min-h-screen">
      {/* Hero */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-amber-700 rounded-2xl p-10 text-white shadow-xl space-y-2">
        <h1 className="text-2xl font-bold">Welcome Back, {name} 👋</h1>
        {name !== "Loading..." && (
          <ReactTyped
            strings={[
              `${name}, boost your reach 🚀`,
              `${name}, grow your leads 🌱`,
              `${name}, track performance easily 📊`,
            ]}
            typeSpeed={60}
            backSpeed={40}
            loop
            className="text-lg text-amber-200 font-medium"
          />
        )}
      </div>

      {/* Stats */}
      <TooltipProvider>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              title: "Active Campaigns",
              value: campaigns.filter((c) => c.status === "Active").length,
              icon: TrendingUp,
              color: "from-amber-500 to-amber-700",
              desc: "Number of campaigns currently running",
            },
            {
              title: "Total Spend",
              value: `₦${campaigns.reduce((sum, c) => sum + Number(c.spend), 0)}`,
              icon: Wallet,
              color: "from-stone-700 to-stone-900",
              desc: "Total money spent across all campaigns",
            },
            {
              title: "Leads Generated",
              value: campaigns.reduce((sum, c) => sum + (c.clicks || 0), 0),
              icon: Users,
              color: "from-stone-600 to-stone-800",
              desc: "Total leads collected from campaigns",
            },
          ].map((s, i) => (
            <Card
              key={i}
              className={`bg-gradient-to-br ${s.color} text-white shadow-lg rounded-xl`}
            >
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">{s.title}</h3>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info
                          size={14}
                          className="opacity-80 cursor-pointer hover:text-white"
                        />
                      </TooltipTrigger>
                      <TooltipContent className="bg-stone-800 text-amber-200 text-xs px-3 py-2 rounded-lg shadow-md">
                        {s.desc}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xl font-bold mt-2">{s.value}</p>
                </div>
                <s.icon size={26} className="opacity-90" />
              </CardContent>
            </Card>
          ))}
        </div>
      </TooltipProvider>

      {/* Campaigns Section */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-stone-800">Your Campaigns</h2>
        <Link href="/advertiser/create-campaign">
          <Button className="flex items-center gap-2 bg-amber-500 text-stone-900 hover:bg-amber-600">
            <PlusCircle size={18} />
            Create Campaign
          </Button>
        </Link>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-3">
        {["Active", "Paused", "Stopped"].map((status) => (
          <Button
            key={status}
            variant={filter === status ? "default" : "outline"}
            className={
              filter === status
                ? "bg-amber-500 text-stone-900 hover:bg-amber-600"
                : "text-stone-600 border-stone-300"
            }
            onClick={() => setFilter(status)}
          >
            {status}
          </Button>
        ))}
      </div>

      {/* Campaign Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {filteredCampaigns.length > 0 ? (
          filteredCampaigns.map((c) => (
            <Link key={c.id} href={`/advertiser/campaigns/${c.id}`}>
              <Card className="rounded-xl overflow-hidden shadow-md hover:shadow-2xl transform hover:scale-[1.02] transition-all duration-300 cursor-pointer bg-gradient-to-br from-amber-50 to-stone-100">
                <div className="relative">
                  <img
                    src={c.image}
                    alt={c.name}
                    className="w-full h-32 object-cover"
                  />
                  <div className="absolute top-3 left-3">
                    <span
                      className={`px-3 py-1 text-xs rounded-full font-semibold ${
                        c.status === "Active"
                          ? "bg-green-100 text-green-700"
                          : c.status === "Paused"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-600"
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                </div>
                <CardContent className="p-4 space-y-2">
                  <h3 className="text-base font-semibold text-stone-800">
                    {c.name}
                  </h3>
                  <div className="flex justify-between text-sm text-stone-600">
                    <span>₦{c.spend}</span>
                    <span>{c.clicks} clicks</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        ) : (
          <p className="text-stone-500 text-sm">No {filter} campaigns found.</p>
        )}
      </div>
    </div>
  )
}
