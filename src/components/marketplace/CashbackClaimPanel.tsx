"use client"

import { useEffect, useState } from "react"
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage"
import toast from "react-hot-toast"
import { auth, storage } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Props = {
  role: "earner" | "advertiser" | "customer"
}

type CashbackSubmission = {
  id: string
  vendorName: string
  productId: string
  amount: number
  cashbackAmount: number
  pointsAmount?: number
  rewardType?: string
  status: string
}

export default function CashbackClaimPanel({ role }: Props) {
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [remainingCap, setRemainingCap] = useState(0)
  const [submissions, setSubmissions] = useState<CashbackSubmission[]>([])
  const [vendorName, setVendorName] = useState("")
  const [productId, setProductId] = useState("")
  const [amount, setAmount] = useState("")
  const [proofUrls, setProofUrls] = useState<string[]>([])

  const load = async () => {
    if (!auth.currentUser) return
    const idToken = await auth.currentUser.getIdToken()
    const res = await fetch("/api/vendor/cashback", {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    const data = await res.json().catch(() => ({})) as {
      success?: boolean
      hasLiveProducts?: boolean
      canSubmit?: boolean
      remainingOrderCap?: number
      submissions?: CashbackSubmission[]
    }
    if (!res.ok || !data.success) {
      throw new Error("Failed to load cashback status")
    }
    const hasLiveProducts = Boolean(data.hasLiveProducts)
    setVisible(hasLiveProducts)
    setRemainingCap(Number(data.remainingOrderCap || 0))
    setSubmissions(Array.isArray(data.submissions) ? data.submissions.slice(0, 6) : [])
    return Boolean(data.canSubmit)
  }

  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false)
      return
    }
    load()
      .catch((error) => {
        console.error("Cashback panel load error", error)
      })
      .finally(() => setLoading(false))
  }, [])

  const uploadProofs = async (files: FileList) => {
    if (!auth.currentUser || !files.length) return
    setUploading(true)
    try {
      const results: string[] = []
      for (const file of Array.from(files).slice(0, 8)) {
        const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "-")
        const storageRef = ref(storage, `vendorCashbackProofs/${auth.currentUser.uid}/${Date.now()}-${safeName}`)
        await new Promise<void>((resolve, reject) => {
          const task = uploadBytesResumable(storageRef, file)
          task.on("state_changed", undefined, reject, () => resolve())
        })
        results.push(await getDownloadURL(storageRef))
      }
      setProofUrls((prev) => [...prev, ...results].slice(0, 8))
      toast.success("Proof uploaded")
    } catch (error) {
      console.error("Cashback proof upload error", error)
      toast.error("Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const submitClaim = async () => {
    if (!auth.currentUser) return
    if (!vendorName.trim() || !productId.trim() || Number(amount) <= 0 || !proofUrls.length) {
      toast.error("Please fill vendor name, product id, amount, and upload proof.")
      return
    }

    setSubmitting(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch("/api/vendor/cashback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          vendorName: vendorName.trim(),
          productId: productId.trim(),
          amount: Number(amount),
          proofUrls,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Could not submit cashback claim")
      }
      toast.success("Cashback claim submitted")
      setVendorName("")
      setProductId("")
      setAmount("")
      setProofUrls([])
      await load()
    } catch (error) {
      console.error("Cashback submit error", error)
      toast.error(error instanceof Error ? error.message : "Could not submit cashback claim")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !visible) return null

  return (
    <div className="rounded-3xl border border-amber-100 bg-white/80 p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">Vendor cashback</p>
      <h3 className="mt-2 text-xl font-semibold text-stone-900">Claim first-purchase cashback or 200 points from Pamba Marketplace purchases</h3>
      <p className="mt-2 text-sm text-stone-600">
        Submit your purchase proof, vendor name, and product ID. The first approved purchase from a vendor earns 10% cashback, while later approved purchases earn 200 points until your first ₦50,000 in eligible orders is reached.
      </p>
      <p className="mt-2 text-sm font-medium text-stone-700">Remaining eligible order cap: ₦{remainingCap.toLocaleString()}</p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Vendor name" />
        <Input value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="Product ID" />
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="Purchase amount (₦)" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700">
          {uploading ? "Uploading proof..." : "Upload proof files"}
          <input className="hidden" type="file" multiple accept="image/*,.pdf" onChange={(e) => e.target.files && void uploadProofs(e.target.files)} />
        </label>
        <Button onClick={() => void submitClaim()} disabled={submitting || uploading} className="rounded-full">
          {submitting ? "Submitting..." : "Submit cashback claim"}
        </Button>
      </div>
      {proofUrls.length ? <p className="mt-2 text-xs text-stone-500">{proofUrls.length} proof file(s) ready</p> : null}

      {submissions.length ? (
        <div className="mt-5 space-y-2 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-sm font-semibold text-stone-900">Recent cashback claims</p>
          {submissions.map((item) => (
            <p key={item.id} className="text-sm text-stone-700">
              {item.vendorName} • {item.productId} • ₦{Number(item.amount || 0).toLocaleString()} • {item.status}
              {item.rewardType === "points"
                ? ` • Points ${Number(item.pointsAmount || 0).toLocaleString()}`
                : item.status === "approved"
                  ? ` • Cashback ₦${Number(item.cashbackAmount || 0).toLocaleString()}`
                  : ""}
            </p>
          ))}
        </div>
      ) : null}
      <p className="mt-3 text-xs text-stone-500">Available for {role}s. Claims are reviewed by admin before cashback is credited.</p>
    </div>
  )
}
