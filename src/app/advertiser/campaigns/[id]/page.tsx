"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { db } from "@/lib/firebase"
import {
  doc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  where,
  addDoc,
  serverTimestamp,
} from "firebase/firestore"
import { getAuth } from "firebase/auth"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Pause, Play, StopCircle, Edit, Trash, ArrowLeft } from "lucide-react"
import Image from "next/image"
import { toast } from "react-hot-toast"
import { Dialog } from "@headlessui/react"

// types
type Campaign = {
  id: string
  title: string
  bannerUrl: string
  category: string
  status: "Active" | "Paused" | "Stopped" | "Pending" | "Deleted"
  budget: number
  estimatedLeads: number
  generatedLeads: number
  costPerLead: number
  createdAt?: string
  paymentRef?: string
}

type Lead = {
  id: string
  name: string
  email?: string
  phone?: string
  status?: string
  createdAt?: { toDate: () => Date }
}

export default function CampaignDetailsPage() {
  const { id } = useParams()
  const router = useRouter()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [avgCPL, setAvgCPL] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [leads, setLeads] = useState<Lead[]>([])

  // Resume modal state
  const [showResumeModal, setShowResumeModal] = useState(false)
  const [useRefundAmount, setUseRefundAmount] = useState<number>(0)
  const [depositAmount, setDepositAmount] = useState<number>(0)
  const [availableRefundable, setAvailableRefundable] = useState<number>(0)
  const [processing, setProcessing] = useState<boolean>(false)

  // Load Paystack script once (inline)
  useEffect(() => {
    const id = "paystack-inline-script"
    if (!document.getElementById(id)) {
      const script = document.createElement("script")
      script.id = id
      script.src = "https://js.paystack.co/v1/inline.js"
      script.async = true
      document.body.appendChild(script)
    }
  }, [])

  // 🔄 Realtime campaign updates
  useEffect(() => {
    if (!id) return
    const unsub = onSnapshot(doc(db, "campaigns", id as string), (snap) => {
      if (snap.exists()) {
        setCampaign({ ...(snap.data() as Campaign), id: snap.id })
      } else {
        setCampaign(null)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [id])

  // ⚡ Fetch Avg CPL once
  useEffect(() => {
    const fetchAvg = async () => {
      try {
        const snap = await getDocs(collection(db, "campaigns"))
        if (!snap.empty) {
          const avg =
            snap.docs.reduce(
              (sum, d) => sum + ((d.data() as Campaign).costPerLead || 0),
              0
            ) / snap.size
          setAvgCPL(avg)
        }
      } catch (error) {
        console.error(error)
      }
    }
    fetchAvg()
  }, [])

  // 📋 Fetch latest 10 leads
  useEffect(() => {
    if (!id) return
    const qLeads = query(
      collection(db, "campaigns", id as string, "leads"),
      orderBy("createdAt", "desc"),
      limit(10)
    )
    const unsub = onSnapshot(qLeads, (snap) => {
      const data: Lead[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Lead, "id">),
      }))
      setLeads(data)
    })
    return () => unsub()
  }, [id])

  const updateStatus = async (status: "Active" | "Paused" | "Stopped") => {
  if (!campaign) return
  try {
    if (status === "Active") {
      if (campaign.status === "Stopped") {
        // open resume modal only for stopped campaigns
        await handleResume()
        return
      } else if (campaign.status === "Paused") {
        // direct resume for paused campaigns
        await updateDoc(doc(db, "campaigns", campaign.id), { status: "Active" })
        setCampaign({ ...campaign, status: "Active" })
        toast.success("Campaign resumed")
        return
      }
    }
    await updateDoc(doc(db, "campaigns", campaign.id), { status })
    setCampaign({ ...campaign, status })
    toast.success(`Campaign ${status}`)
  } catch (err) {
    console.error(err)
    toast.error("Failed to update campaign")
  }
}


  const handleDelete = async () => {
    if (!campaign) return
    try {
      await deleteDoc(doc(db, "campaigns", campaign.id))
      toast.success("Campaign deleted")
      router.push("/advertiser")
    } catch {
      toast.error("Failed to delete campaign")
    }
  }

  // Compute refundable balance for the user (fresh) and open modal
  const handleResume = async () => {
    try {
      const auth = getAuth()
      const user = auth.currentUser
      if (!user || !user.uid) {
        toast.error("You must be signed in to resume a campaign.")
        return
      }

      // compute refundable base (stopped/deleted campaigns)
      const cSnap = await getDocs(query(collection(db, "campaigns"), where("ownerId", "==", user.uid)))
      const userCampaigns = cSnap.docs.map((d) => d.data() as Campaign)

      const refundableBase = userCampaigns
        .filter((c) => c.status === "Stopped" || c.status === "Deleted")
        .reduce(
          (sum, c) => sum + (c.budget || 0) - (c.generatedLeads || 0) * (c.costPerLead || 0),
          0
        )

      // total requested withdrawals (pending/approved)
      type Withdrawal = { amount: number }
      const wSnap = await getDocs(query(collection(db, "withdrawals"), where("userId", "==", user.uid)))
      const totalRequestedWithdrawals = wSnap.docs.reduce((s, d) => s + ((d.data() as Withdrawal).amount || 0), 0)

      // total requested reroutes (pending/approved)
      type RerouteItem = { amount: number }
      const rSnap = await getDocs(query(collection(db, "reroutes"), where("userId", "==", user.uid)))
      const totalRequestedReroutes = rSnap.docs.reduce(
        (s, d) =>
          s +
          (((d.data() as { reroutes?: RerouteItem[] }).reroutes || []).reduce((sub: number, rr: RerouteItem) => sub + (rr.amount || 0), 0) || 0),
        0
      )

      const available = refundableBase - totalRequestedWithdrawals - totalRequestedReroutes
      setAvailableRefundable(Math.max(0, available))
      // preset inputs
      setUseRefundAmount(Math.min(Math.max(0, Math.floor(Math.min(available, (campaign?.budget || 0)))) , available))
      setDepositAmount(0)
      setShowResumeModal(true)
    } catch (err) {
      console.error("Failed to compute refundable balance:", err)
      toast.error("Unable to determine refundable balance. Try again.")
    }
  }

  // Start resume flow: supports using refundable + depositing more
  const startResumeFlow = async () => {
  if (!campaign) return toast.error("Campaign missing")
  const useRefund = Number(useRefundAmount || 0)
  const deposit = Number(depositAmount || 0)

  if (useRefund < 0 || deposit < 0) return toast.error("Invalid amounts")
  if (useRefund > availableRefundable) return toast.error("Refundable exceeds balance")
  const total = useRefund + deposit
  if (total <= 0) return toast.error("Enter an amount to resume with")

  const auth = getAuth()
  const user = auth.currentUser
  if (!user?.uid) return toast.error("Not authenticated")

  setProcessing(true)

  try {
    // If deposit is required
    if (deposit > 0) {
  interface WindowWithPaystack extends Window {
    PaystackPop?: {
      setup: (options: {
        key: string
        email: string
        amount: number
        currency?: string
        label?: string
        onClose?: () => void
        callback?: (response: unknown) => void
      }) => { openIframe: () => void }
    }
  }
  const win = window as WindowWithPaystack;
  if (!win.PaystackPop) {
    toast.error("Payment library not loaded yet")
    setProcessing(false)
    return
  }

  const paystackPop = (window as WindowWithPaystack).PaystackPop;
  const handler = paystackPop!.setup({
    key: process.env.NEXT_PUBLIC_PAYSTACK_KEY ?? "",
    email: user.email || "",
    amount: Math.round(deposit * 100),
    currency: "NGN",
    label: `Deposit for ${campaign.title}`,
    onClose: () => {
      toast.error("Payment cancelled")
      setProcessing(false)
    },
    callback: (response: unknown) => {
      (async () => { // ✅ Wrap in parentheses
        try {
          const resp = response as { reference?: string }
          // record transaction
          await addDoc(collection(db, "transactions"), {
            userId: user.uid,
            campaignId: campaign.id,
            type: "deposit",
            amount: deposit,
            reference: resp?.reference || null,
            status: "Success",
            createdAt: serverTimestamp(),
          })

          // only deduct the refund amount entered
          if (useRefund > 0) {
            await addDoc(collection(db, "resumedCampaigns"), {
              userId: user.uid,
              campaignId: campaign.id,
              amountUsed: useRefund,
              source: "refundable",
              status: "Approved",
              createdAt: serverTimestamp(),
            })
          }

          // reset campaign as new
          const campaignRef = doc(db, "campaigns", campaign.id)

// Create a subdocument under /campaigns/{id}/resumes/
await addDoc(collection(campaignRef, "resumes"), {
  resumedBudget: deposit + useRefund, // total used to resume
  resumedAt: serverTimestamp(),
  costPerLead: campaign.costPerLead,
  estimatedLeads: Math.floor((deposit + useRefund) / campaign.costPerLead),
  reference: resp?.reference || null,
  status: "Active",
})

// Update parent campaign basic fields (no new doc, no old budget overwrite)
await updateDoc(campaignRef, {
  status: "Active",
  resumedBudget: deposit + useRefund, // just for summary display
  generatedLeads: 0, // reset leads
})


          setCampaign({ ...campaign, status: "Active", budget: total, generatedLeads: 0 })
          setShowResumeModal(false)
          toast.success("Campaign resumed")
        } catch (err) {
          console.error("Finalize failed:", err)
          toast.error("Something went wrong after payment")
        } finally {
          setProcessing(false)
        }
      })() // ✅ IIFE invocation
    },
  })
  handler.openIframe()
  return
}

    const campaignRef = doc(db, "campaigns", campaign.id)

// Create a subdocument under /campaigns/{id}/resumes/
await addDoc(collection(campaignRef, "resumes"), {
  resumedBudget: deposit + useRefund, // total used to resume
  resumedAt: serverTimestamp(),
  costPerLead: campaign.costPerLead,
  estimatedLeads: Math.floor((deposit + useRefund) / campaign.costPerLead),
  // reference: resp?.reference || null,
  status: "Active",
})

// Update parent campaign basic fields (no new doc, no old budget overwrite)
await updateDoc(campaignRef, {
  status: "Active",
  resumedBudget: deposit + useRefund, // just for summary display
  generatedLeads: 0, // reset leads
})


    setCampaign({ ...campaign, status: "Active", budget: total, generatedLeads: 0 })
    setShowResumeModal(false)
    toast.success("Campaign resumed using refundable balance")
    setProcessing(false)
  } catch (err) {
    console.error("Resume failed:", err)
    toast.error("Failed to resume")
    setProcessing(false)
  }
}


  // 📊 Insights logic
  const getInsights = () => {
    if (avgCPL === null) return "No benchmark available yet."
    if (!campaign) return "N/A"
    if (campaign.costPerLead < avgCPL * 0.9) {
      return "Your CPL is better than most campaigns 🎉"
    } else if (campaign.costPerLead <= avgCPL * 1.1) {
      return "Your CPL is around the average. Solid performance 👍"
    } else {
      return "Your CPL is higher than average. Try optimizing your ads ⚡"
    }
  }

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

  // 🎛️ Status buttons
  const statusActions = [
    {
      label: campaign.status === "Active" ? "Pause" : "Resume",
      action: () =>
        updateStatus(campaign.status === "Active" ? "Paused" : "Active"),
      color:
        campaign.status === "Active"
          ? "bg-yellow-500 hover:bg-yellow-600"
          : "bg-green-500 hover:bg-green-600",
      icon: campaign.status === "Active" ? Pause : Play,
    },
    {
      label: "Edit",
      action: () => router.push(`/advertiser/create-campaign?edit=${id}`),
      color: "bg-blue-500 hover:bg-blue-600",
      icon: Edit,
    },
    {
      label: "Stop",
      action: () => updateStatus("Stopped"),
      color: "bg-red-500 hover:bg-red-600",
      icon: StopCircle,
    },
  ]

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
          <Image
            src={campaign.bannerUrl || "/placeholders/default.jpg"}
            alt={campaign.title || "Campaign banner"}
            width={400}
            height={400}
            className="w-full aspect-square object-cover"
            style={{ objectFit: "cover" }}
            priority
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

      {/* Performance + Controls */}
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

          {/* Leads Table */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-stone-700 mb-2">
              Latest Leads
            </h3>
            {leads.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-stone-200 rounded">
                  <thead className="bg-stone-100 text-stone-600">
                    <tr>
                      <th className="p-2 text-left">Name</th>
                      <th className="p-2 text-left">Email</th>
                      <th className="p-2 text-left">Phone</th>
                      <th className="p-2 text-left">Status</th>
                      <th className="p-2 text-left">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => (
                      <tr
                        key={lead.id}
                        className="border-t border-stone-200 hover:bg-stone-50"
                      >
                        <td className="p-2">{lead.name || "N/A"}</td>
                        <td className="p-2">{lead.email || "-"}</td>
                        <td className="p-2">{lead.phone || "-"}</td>
                        <td className="p-2">{lead.status || "New"}</td>
                        <td className="p-2">
                          {lead.createdAt
                            ? new Date(lead.createdAt.toDate()).toLocaleDateString()
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-stone-500">No leads yet.</p>
            )}
          </div>
        </Card>

        {/* Controls */}
        <Card className="p-6 bg-gradient-to-br from-stone-100 to-amber-50 shadow-md">
          <h2 className="text-lg font-semibold text-stone-800 mb-4">
            Manage Campaign
          </h2>
          <div className="flex flex-wrap gap-3">
            {statusActions.map((btn, i) => (
              <Button
                key={i}
                onClick={btn.action}
                className={`${btn.color} flex gap-2`}
                size="sm"
              >
                <btn.icon size={16} /> {btn.label}
              </Button>
            ))}
          </div>
        </Card>
      </div>

      {/* Billing + Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="p-6 bg-gradient-to-br from-amber-50 to-stone-100 shadow-md">
          <h2 className="text-lg font-semibold text-stone-800 mb-4">Billing</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <p>Payment Ref: {campaign.paymentRef || "N/A"}</p>
            <p>Total Budget: ₦{campaign.budget}</p>
            <p>Estimated Leads: {campaign.estimatedLeads}</p>
            <p>Cost per Lead: ₦{campaign.costPerLead}</p>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-stone-100 to-amber-50 shadow-md">
          <h2 className="text-lg font-semibold text-stone-800 mb-3">Insights</h2>
          <p className="text-sm text-stone-700">{getInsights()}</p>
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

      {/* Resume Modal */}
      <Dialog
        open={showResumeModal}
        onClose={() => {
          if (!processing) setShowResumeModal(false)
        }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      >
        <Dialog.Panel className="bg-white rounded-lg p-6 w-full max-w-md">
          <Dialog.Title className="text-lg font-semibold mb-2">
            Resume Campaign
          </Dialog.Title>

          <p className="text-sm text-stone-600 mb-4">
            Refundable Balance:{" "}
            <span className="font-semibold text-stone-900">
              ₦{availableRefundable.toLocaleString()}
            </span>
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-stone-600 mb-1 block">Amount from refundable balance</label>
              <input
                type="number"
                min={0}
                max={availableRefundable}
                value={useRefundAmount}
                onChange={(e) => setUseRefundAmount(Number(e.target.value || 0))}
                className="border rounded p-2 w-full"
                placeholder="₦0"
              />
              <p className="text-xs text-stone-500 mt-1">You may use up to ₦{availableRefundable.toLocaleString()} from refundable funds.</p>
            </div>

            <div>
              <label className="text-xs text-stone-600 mb-1 block">Additional deposit (optional)</label>
              <input
                type="number"
                min={0}
                value={depositAmount}
                onChange={(e) => setDepositAmount(Number(e.target.value || 0))}
                className="border rounded p-2 w-full"
                placeholder="₦0"
              />
              <p className="text-xs text-stone-500 mt-1">Deposit more to top-up the resume amount (Paystack will be used).</p>
            </div>

            {campaign && (
              <p className="text-xs text-stone-600">
                Total to apply:{" "}
                <span className="font-semibold">
                  ₦{(useRefundAmount + depositAmount).toLocaleString()}
                </span>{" "}
                • Estimated Leads:{" "}
                <span className="font-semibold">
                  {Math.floor(((useRefundAmount + depositAmount) || 0) / campaign.costPerLead)}
                </span>
              </p>
            )}

            {useRefundAmount > availableRefundable && (
              <p className="text-xs text-red-600">Warning: requested refundable amount exceeds available refundable balance.</p>
            )}
          </div>

          <div className="flex gap-3 mt-5">
            <Button
              onClick={startResumeFlow}
              disabled={processing}
              className="bg-amber-500 text-stone-900 flex-1"
            >
              {processing ? "Processing..." : "Confirm & Resume"}
            </Button>
            <Button
              onClick={() => !processing && setShowResumeModal(false)}
              className="bg-stone-200 text-stone-800 flex-1"
            >
              Cancel
            </Button>
          </div>
        </Dialog.Panel>
      </Dialog>
    </div>
  )
}
