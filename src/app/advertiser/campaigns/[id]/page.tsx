"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { db } from "@/lib/firebase"
import {
  doc,
  onSnapshot,
  updateDoc,
  collection,
  query,
  where,
  addDoc,
  serverTimestamp,
} from "firebase/firestore"
import { getAuth } from "firebase/auth"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Trash, ArrowLeft } from "lucide-react"
import Image from "next/image"
import { toast } from "react-hot-toast"
import { Dialog } from "@headlessui/react"
import { summarizeCampaignProgress } from "@/lib/campaign-progress"

// types
type Campaign = {
  id: string
  title: string
  bannerUrl: string
  category: string
  status: "Active" | "Paused" | "Stopped" | "Pending" | "Deleted" | "Completed"
  budget: number
  estimatedLeads: number
  generatedLeads: number
  costPerLead: number
  createdAt?: string
  paymentRef?: string
  reservedBudget?: number
  originalBudget?: number
}

type Submission = {
  id: string
  status?: string
}

interface PaystackResponse {
  reference?: string
}

interface WindowWithPaystack extends Window {
  PaystackPop?: {
    setup: (options: {
      key: string
      email: string
      amount: number
      currency?: string
      label?: string
      onClose?: () => void
      callback?: (response: PaystackResponse) => void
    }) => { openIframe: () => void }
  }
}

export default function CampaignDetailsPage() {
  const { id } = useParams()
  const router = useRouter()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const avgCPL: number | null = null
  const [loading, setLoading] = useState(true)
  const [submissions, setSubmissions] = useState<Submission[]>([])

  // Resume modal state
  const [showResumeModal, setShowResumeModal] = useState(false)
  const [useRefundAmount, setUseRefundAmount] = useState<number>(0)
  const [depositAmount, setDepositAmount] = useState<number>(0)
  const availableRefundable = 0
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

  useEffect(() => {
    if (!id) return

    const submissionsQuery = query(
      collection(db, "earnerSubmissions"),
      where("campaignId", "==", id as string)
    )

    const unsub = onSnapshot(submissionsQuery, (snap) => {
      setSubmissions(
        snap.docs.map((submissionDoc) => ({
          id: submissionDoc.id,
          status: String(submissionDoc.data().status || ""),
        }))
      )
    })

    return () => unsub()
  }, [id])

  // ⚡ Fetch Avg CPL once
  // Note: latest leads and realtime submission list removed to simplify details view.

  const handleDelete = async () => {
    if (!campaign) return
    try {
      const user = getAuth().currentUser
      if (!user) {
        toast.error("Not authenticated")
        return
      }

      const token = await user.getIdToken()
      const response = await fetch(`/api/advertiser/tasks/${campaign.id}/delete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()
      if (!response.ok) {
        toast.error(result.message || "Failed to delete task")
        return
      }

      toast.success("Task deleted and budget refunded to your balance")
      router.push("/advertiser")
    } catch (error) {
      console.error('Delete task error:', error)
      toast.error("Failed to delete task")
    }
  }

  // Resume feature disabled — tasks now run until funds exhaust. Keep handler as no-op.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleResume = async () => {
    toast('Resume feature is disabled. Tasks will run until funds are exhausted.')
    return
  }

  // Start resume flow: supports using refundable + depositing more
  const startResumeFlow = async () => {
  if (!campaign) return toast.error("Task missing")
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
    const win = window as WindowWithPaystack
    if (!win.PaystackPop) {
    toast.error("Payment library not loaded yet")
    setProcessing(false)
    return
  }

    const paystackPop = (window as WindowWithPaystack).PaystackPop
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
      callback: (response: PaystackResponse) => {
        ;(async () => {
          try {
            const resp = response || {}
          // record transaction
          await addDoc(collection(db, "transactions"), {
            userId: user.uid,
            campaignId: campaign.id,
            type: "deposit",
            amount: deposit,
              reference: resp.reference || null,
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
  reference: undefined,
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
          toast.success("Task resumed")
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
  toast.success("Task resumed using refundable balance")
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
          <p className="text-stone-700 font-medium">Loading task...</p>
        </Card>
      </div>
    )
  }

  if (!campaign) return <p className="p-6">Task not found.</p>

  const progress = summarizeCampaignProgress({
    target: Number(campaign.estimatedLeads || 0),
    generatedLeads: Number(campaign.generatedLeads || 0),
    submissions,
  })
  const percent = progress.progressPercent

  const progressColor =
    percent >= 75
      ? "from-green-500 to-green-700"
      : percent >= 40
      ? "from-yellow-400 to-yellow-600"
      : "from-red-500 to-red-700"

  // 🎛️ Status buttons
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
                alt={campaign.title || "Task banner"}
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
          <h2 className="text-lg font-semibold text-stone-800">Performance Overview</h2>
          <div>
            <div className="w-full bg-stone-200 rounded-full h-2">
              <div
                className={`bg-gradient-to-r ${progressColor} h-2 rounded-full`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-xs text-stone-600 mt-1">
              {progress.verified} verified
              {progress.pending > 0 ? ` • ${progress.pending} pending review` : ""}
              {progress.target > 0 ? ` • ${progress.target} target` : ""}
              {` (${percent.toFixed(1)}%)`}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div className="rounded-xl bg-white/70 p-3">
              <p className="text-stone-500">Verified</p>
              <p className="mt-1 font-semibold text-stone-900">{progress.verified}</p>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <p className="text-stone-500">Pending</p>
              <p className="mt-1 font-semibold text-stone-900">{progress.pending}</p>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <p className="text-stone-500">Rejected</p>
              <p className="mt-1 font-semibold text-stone-900">{progress.rejected}</p>
            </div>
          </div>
        </Card>

        {/* Controls: Keep basic actions for edit/delete */}
        {/* <Card className="p-6 bg-gradient-to-br from-stone-100 to-amber-50 shadow-md">
          <h2 className="text-lg font-semibold text-stone-800 mb-4">Actions</h2>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => router.push(`/advertiser/create-campaign?edit=${id}`)} size="sm" className="bg-blue-500 hover:bg-blue-600 text-white">
              <Edit size={16} /> Edit
            </Button>
            <Button onClick={handleDelete} size="sm" className="bg-red-500 hover:bg-red-600 text-white">
              <Trash size={16} /> Delete
            </Button>
          </div>
        </Card> */}
      </div>

      {/* Billing + Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="p-6 bg-gradient-to-br from-amber-50 to-stone-100 shadow-md">
          <h2 className="text-lg font-semibold text-stone-800 mb-4">Billing</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <p>Payment Ref: {campaign.paymentRef || "N/A"}</p>
            <p>Total Budget: ₦{(Number(campaign.originalBudget || (Number(campaign.budget || 0) + Number(campaign.reservedBudget || 0)))).toLocaleString()}</p>
            <p>Estimated Leads: {progress.target}</p>
            <p>Cost per Lead: ₦{campaign.costPerLead}</p>
          </div>
        </Card>

        {/* Insights removed per request */}
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
            <Trash size={16} /> Delete Task
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
            Resume Task
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
