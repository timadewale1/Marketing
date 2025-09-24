"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { db } from "@/lib/firebase"
import { doc, getDoc, updateDoc, deleteDoc, collection, getDocs } from "firebase/firestore"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Pause, Play, StopCircle, Edit, Trash, ArrowLeft } from "lucide-react"
import { toast } from "react-hot-toast"

type Campaign = {
  id: string
  title: string
  bannerUrl: string
  category: string
  status: "Active" | "Paused" | "Stopped" | "Pending"
  budget: number
  estimatedLeads: number
  generatedLeads: number
  costPerLead: number
  createdAt?: string
  paymentRef?: string
}

export default function CampaignDetailsPage() {
  const { id } = useParams()
  const router = useRouter()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [avgCPL, setAvgCPL] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchCampaign = async () => {
      try {
        if (!id) return
        const ref = doc(db, "campaigns", id as string)
        const snap = await getDoc(ref)
        if (snap.exists()) {
  const data = snap.data() as Campaign;
  setCampaign({ ...data, id: snap.id })
        }
      } catch (error) {
        console.error(error)
        toast.error("Failed to fetch campaign")
      } finally {
        setLoading(false)
      }
    }
    fetchCampaign()
  }, [id])

  useEffect(() => {
    const fetchAvgCPL = async () => {
      try {
        const snap = await getDocs(collection(db, "campaigns"))
        const values = snap.docs.map((d) => (d.data() as Campaign).costPerLead || 0)
        if (values.length > 0) {
          const avg = values.reduce((a, b) => a + b, 0) / values.length
          setAvgCPL(avg)
        }
      } catch (error) {
        console.error(error)
      }
    }
    fetchAvgCPL()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
        <Card className="p-8 shadow-md bg-gradient-to-br from-amber-50 to-stone-100 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-stone-700 font-medium">Loading campaign...</p>
        </Card>
      </div>
    )
  }

  if (!campaign) return <p className="p-6">Campaign not found.</p>

  const percent = campaign.estimatedLeads
    ? Math.min((campaign.generatedLeads / campaign.estimatedLeads) * 100, 100)
    : 0

  const progressColor =
    percent >= 75
      ? "from-green-500 to-green-700"
      : percent >= 40
      ? "from-yellow-400 to-yellow-600"
      : "from-red-500 to-red-700"

  const updateStatus = async (status: "Active" | "Paused" | "Stopped") => {
    try {
      await updateDoc(doc(db, "campaigns", campaign.id), { status })
      setCampaign({ ...campaign, status })
      toast.success(`Campaign ${status}`)
    } catch {
      toast.error("Failed to update campaign")
    }
  }

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, "campaigns", campaign.id))
      toast.success("Campaign deleted")
      router.push("/advertiser")
    } catch {
      toast.error("Failed to delete campaign")
    }
  }

  // Dynamic insights message
  let insightsMsg = "No benchmark available yet."
  if (avgCPL !== null) {
    if (campaign.costPerLead < avgCPL * 0.9) {
      insightsMsg = "Your CPL is better than most campaigns 🎉"
    } else if (campaign.costPerLead <= avgCPL * 1.1) {
      insightsMsg = "Your CPL is around the average. Solid performance 👍"
    } else {
      insightsMsg = "Your CPL is higher than average. Try optimizing your ads ⚡"
    }
  }

  return (
    <div className="px-6 py-10 space-y-8 bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300 min-h-screen">
      {/* Back Button */}
      <Button
        onClick={() => router.back()}
        className="flex gap-2 mb-4 bg-stone-700 hover:bg-stone-800 text-white"
        size="sm"
      >
        <ArrowLeft size={16} /> Back
      </Button>

      {/* Hero Section */}
      <div className="flex justify-center">
        <Card className="w-full max-w-xs rounded-xl overflow-hidden shadow-md bg-gradient-to-br from-amber-50 to-stone-100">
          <img
            src={campaign.bannerUrl}
            alt={campaign.title}
            className="w-full aspect-square object-cover"
          />
          <CardContent className="p-4 space-y-2 text-center">
            <h1 className="text-lg font-semibold text-stone-800">
              {campaign.title}
            </h1>
            <p className="text-xs text-stone-500">{campaign.category}</p>
            <span
              className={`px-3 py-1 text-xs rounded-full font-semibold ${
                campaign.status === "Active"
                  ? "bg-green-100 text-green-700"
                  : campaign.status === "Paused"
                  ? "bg-yellow-100 text-yellow-700"
                  : campaign.status === "Pending"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-red-100 text-red-600"
              }`}
            >
              {campaign.status}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Performance + Controls grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Performance */}
        <Card className="p-6 bg-gradient-to-br from-amber-50 to-stone-100 shadow-md space-y-4">
          <h2 className="text-lg font-semibold text-stone-800">
            Performance Overview
          </h2>
          <div>
            <div className="w-full bg-stone-200 rounded-full h-2">
              <div
                className={`bg-gradient-to-r ${progressColor} h-2 rounded-full`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-xs text-stone-600 mt-1">
              {campaign.generatedLeads} of {campaign.estimatedLeads} leads (
              {percent.toFixed(1)}%)
            </p>
          </div>
        </Card>

        {/* Controls */}
        <Card className="p-6 bg-gradient-to-br from-stone-100 to-amber-50 shadow-md">
          <h2 className="text-lg font-semibold text-stone-800 mb-4">
            Manage Campaign
          </h2>
          <div className="flex flex-wrap gap-3">
            {campaign.status === "Active" ? (
              <Button
                onClick={() => updateStatus("Paused")}
                className="bg-yellow-500 hover:bg-yellow-600 flex gap-2"
                size="sm"
              >
                <Pause size={16} /> Pause
              </Button>
            ) : (
              <Button
                onClick={() => updateStatus("Active")}
                className="bg-green-500 hover:bg-green-600 flex gap-2"
                size="sm"
              >
                <Play size={16} /> Resume
              </Button>
            )}
            <Button
              onClick={() => router.push(`/advertiser/create-campaign?edit=${id}`)}
              className="bg-blue-500 hover:bg-blue-600 flex gap-2"
              size="sm"
            >
              <Edit size={16} /> Edit
            </Button>
            <Button
              onClick={() => updateStatus("Stopped")}
              className="bg-red-500 hover:bg-red-600 flex gap-2"
              size="sm"
            >
              <StopCircle size={16} /> Stop
            </Button>
          </div>
        </Card>
      </div>

      {/* Billing + Insights grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Billing */}
        <Card className="p-6 bg-gradient-to-br from-amber-50 to-stone-100 shadow-md">
          <h2 className="text-lg font-semibold text-stone-800 mb-4">Billing</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <p>Payment Ref: {campaign.paymentRef || "N/A"}</p>
            <p>Total Budget: ₦{campaign.budget}</p>
            <p>Estimated Leads: {campaign.estimatedLeads}</p>
            <p>Cost per Lead: ₦{campaign.costPerLead}</p>
          </div>
        </Card>

        {/* Insights */}
        <Card className="p-6 bg-gradient-to-br from-stone-100 to-amber-50 shadow-md">
          <h2 className="text-lg font-semibold text-stone-800 mb-3">Insights</h2>
          <p className="text-sm text-stone-700">{insightsMsg}</p>
        </Card>
      </div>

      {/* Danger Zone */}
      <div className="flex justify-center">
        <Card className="p-4 bg-red-50 border border-red-200 shadow-md max-w-sm text-center">
          <h2 className="text-base font-semibold text-red-700 mb-3">
            Danger Zone
          </h2>
          <Button
            onClick={handleDelete}
            className="bg-red-500 hover:bg-red-600 text-white flex gap-2 mx-auto"
            size="sm"
          >
            <Trash size={16} /> Delete Campaign
          </Button>
        </Card>
      </div>
    </div>
  )
}
