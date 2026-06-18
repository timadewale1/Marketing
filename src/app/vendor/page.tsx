"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { onAuthStateChanged } from "firebase/auth"
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage"
import toast from "react-hot-toast"
import { auth, storage } from "@/lib/firebase"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PaymentSelector } from "@/components/payment-selector"
import { AlertCircle, Camera, FileBadge2, FileText, Package, ShieldCheck, Store, StoreIcon, Truck, Wallet } from "lucide-react"

type VendorProfile = {
  name?: string
  email?: string
  verified?: boolean
  vendorVerificationStatus?: string
  vendorPaymentStatus?: string
  monthlyRentStatus?: string
  monthlyRentDueAt?: { seconds?: number }
  storeStatus?: string
  storefrontLink?: string
  storefrontSlug?: string
  productsPublishedCount?: number
  verificationDetails?: {
    address?: string
    city?: string
    state?: string
    ninNumber?: string
    proofOfAddressUrl?: string
    ninSlipUrl?: string
    facialVerificationUrl?: string
  }
}

function toDateLabel(value: unknown) {
  if (!value || typeof value !== "object" || !("seconds" in value)) return "Not set"
  const millis = Number((value as { seconds?: number }).seconds || 0) * 1000
  if (!millis) return "Not set"
  return new Date(millis).toLocaleDateString()
}

export default function VendorDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(auth.currentUser?.uid ?? null)
  const [profile, setProfile] = useState<VendorProfile | null>(null)
  const [submittingVerification, setSubmittingVerification] = useState(false)
  const [showSetupPayment, setShowSetupPayment] = useState(false)
  const [showRentPayment, setShowRentPayment] = useState(false)
  const [storefrontLink, setStorefrontLink] = useState("")
  const [storefrontSlug, setStorefrontSlug] = useState("")
  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")
  const [ninNumber, setNinNumber] = useState("")
  const [proofOfAddressUrl, setProofOfAddressUrl] = useState("")
  const [ninSlipUrl, setNinSlipUrl] = useState("")
  const [facialVerificationUrl, setFacialVerificationUrl] = useState("")
  const [uploadingField, setUploadingField] = useState<"" | "proof" | "nin" | "face">("")

  const loadProfile = async (idToken: string) => {
    const res = await fetch("/api/vendor/profile", {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      throw new Error(data.message || "Failed to load vendor profile")
    }
    const nextProfile = (data.profile || {}) as VendorProfile
    setProfile(nextProfile)
    const details = nextProfile.verificationDetails || {}
    setStorefrontLink(String(nextProfile.storefrontLink || ""))
    setStorefrontSlug(String(nextProfile.storefrontSlug || ""))
    setAddress(String(details.address || ""))
    setCity(String(details.city || ""))
    setState(String(details.state || ""))
    setNinNumber(String(details.ninNumber || ""))
    setProofOfAddressUrl(String(details.proofOfAddressUrl || ""))
    setNinSlipUrl(String(details.ninSlipUrl || ""))
    setFacialVerificationUrl(String(details.facialVerificationUrl || ""))
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setUserId(user?.uid ?? null)
      if (!user) {
        setProfile(null)
        setLoading(false)
        return
      }

      try {
        const idToken = await user.getIdToken()
        await loadProfile(idToken)
      } catch (error) {
        console.error(error)
        toast.error("Could not load vendor profile")
      } finally {
        setLoading(false)
      }
    })
    return () => unsub()
  }, [])

  const verificationStatus = useMemo(() => {
    const raw = String(profile?.vendorVerificationStatus || "").toLowerCase()
    if (profile?.verified || raw === "verified" || raw === "approved") return "Verified"
    if (raw === "rejected") return "Needs attention"
    return "Waiting for verification"
  }, [profile])

  const setupPaid = String(profile?.vendorPaymentStatus || "").toLowerCase() === "paid"
  const rentPaid = String(profile?.monthlyRentStatus || "").toLowerCase() === "paid"
  const verificationComplete = Boolean(address && city && state && ninNumber && proofOfAddressUrl && ninSlipUrl && facialVerificationUrl)
  const canPublish = setupPaid && rentPaid && (verificationStatus === "Verified")

  const uploadVerificationFile = async (field: "proof" | "nin" | "face", file: File) => {
    if (!auth.currentUser) return
    const uid = auth.currentUser.uid
    const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "-")
    const path = `vendorVerification/${uid}/${Date.now()}-${field}-${safeName}`
    const storageRef = ref(storage, path)
    setUploadingField(field)
    try {
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, file)
        task.on("state_changed", undefined, reject, () => resolve())
      })
      const url = await getDownloadURL(storageRef)
      if (field === "proof") setProofOfAddressUrl(url)
      if (field === "nin") setNinSlipUrl(url)
      if (field === "face") setFacialVerificationUrl(url)
      toast.success("File uploaded")
    } catch (error) {
      console.error("Verification upload error", error)
      toast.error("Upload failed")
    } finally {
      setUploadingField("")
    }
  }

  const saveVerification = async () => {
    if (!auth.currentUser) return
    setSubmittingVerification(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch("/api/vendor/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          storefrontLink,
          storefrontSlug,
          address,
          city,
          state,
          ninNumber,
          proofOfAddressUrl,
          ninSlipUrl,
          facialVerificationUrl,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Could not submit verification")
      }
      toast.success("Verification details submitted")
      await loadProfile(idToken)
    } catch (error) {
      console.error("Vendor verification submit error", error)
      toast.error(error instanceof Error ? error.message : "Could not submit verification")
    } finally {
      setSubmittingVerification(false)
    }
  }

  const registerVendorPaymentReference = async (reference: string, purpose: "setup_fee" | "monthly_rent", amount: number) => {
    if (!auth.currentUser) return
    const idToken = await auth.currentUser.getIdToken()
    await fetch("/api/vendor/register-payment-reference", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ reference, purpose, amount }),
    })
  }

  const completeVendorPayment = async (reference: string, purpose: "setup_fee" | "monthly_rent", provider: "paystack" | "monnify", monnifyResponse?: Record<string, unknown>) => {
    if (!auth.currentUser) return
    const idToken = await auth.currentUser.getIdToken()
    const res = await fetch("/api/vendor/complete-payment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ reference, purpose, provider, monnifyResponse }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      throw new Error(data.message || "Vendor payment failed")
    }
    if (data.pendingConfirmation) {
      toast.success("Payment received. Waiting for Monnify confirmation.")
    } else {
      toast.success(purpose === "setup_fee" ? "Setup fee confirmed" : "Monthly rent confirmed")
    }
    await loadProfile(idToken)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 p-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-stone-500">Loading vendor dashboard...</p>
        </div>
      </div>
    )
  }

  if (!userId) {
    return (
      <div className="min-h-screen bg-stone-50 p-6">
        <div className="mx-auto max-w-4xl rounded-3xl border border-dashed border-stone-300 bg-white p-8 text-center shadow-sm">
          <Store className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-4 text-2xl font-semibold text-stone-900">Vendor dashboard</h1>
          <p className="mt-2 text-stone-600">Please sign in as a Pamba Vendor to continue setting up your store.</p>
          <Button asChild className="mt-6 rounded-full">
            <Link href="/auth/sign-in">Go to sign in</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fffdf8_0%,#faf5ea_100%)] p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Card className="rounded-[32px] border-amber-100 bg-white/90 shadow-[0_24px_80px_-50px_rgba(120,53,15,0.45)]">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-700">
                  <Store className="h-4 w-4" />
                  Pamba Vendor
                </div>
                <h1 className="text-3xl font-semibold text-stone-900">
                  Welcome{profile?.name ? `, ${profile.name}` : ""}.
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-stone-600">
                  Build your storefront, publish products, and share your shop link with buyers.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild className="rounded-full" disabled={!canPublish}>
                    <Link href="/vendor/products">Manage products</Link>
                  </Button>
                  <Button asChild variant="outline" className="rounded-full">
                    <Link href="/marketplace">View marketplace</Link>
                  </Button>
                  {profile?.storefrontLink ? (
                    <Button asChild variant="outline" className="rounded-full">
                      <Link href={`/marketplace/vendor/${userId}`}>Public shop page</Link>
                    </Button>
                  ) : null}
                  {profile?.storefrontSlug ? (
                    <Button asChild variant="outline" className="rounded-full">
                      <Link href={`/marketplace/shop/${profile.storefrontSlug}`}>Public shop link</Link>
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className="rounded-full border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
                  {verificationStatus}
                </Badge>
                <Badge className="rounded-full border-stone-200 bg-stone-50 px-3 py-1 text-stone-700">
                  Setup: {setupPaid ? "Paid" : "Unpaid"}
                </Badge>
                <Badge className="rounded-full border-stone-200 bg-stone-50 px-3 py-1 text-stone-700">
                  Rent: {rentPaid ? "Paid" : "Unpaid"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="rounded-3xl border-stone-200 bg-white">
            <CardContent className="p-5">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <p className="mt-3 text-xs uppercase tracking-[0.28em] text-stone-500">Verification</p>
              <p className="mt-2 text-2xl font-semibold text-stone-900">{verificationStatus}</p>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border-stone-200 bg-white">
            <CardContent className="p-5">
              <Wallet className="h-5 w-5 text-amber-600" />
              <p className="mt-3 text-xs uppercase tracking-[0.28em] text-stone-500">Setup fee</p>
              <p className="mt-2 text-2xl font-semibold text-stone-900">{setupPaid ? "Paid" : "₦10,000 due"}</p>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border-stone-200 bg-white">
            <CardContent className="p-5">
              <Truck className="h-5 w-5 text-rose-600" />
              <p className="mt-3 text-xs uppercase tracking-[0.28em] text-stone-500">Monthly rent</p>
              <p className="mt-2 text-2xl font-semibold text-stone-900">{rentPaid ? "Paid" : "₦2,000 due"}</p>
              <p className="mt-1 text-xs text-stone-500">Next due: {toDateLabel(profile?.monthlyRentDueAt)}</p>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border-stone-200 bg-white">
            <CardContent className="p-5">
              <Package className="h-5 w-5 text-sky-600" />
              <p className="mt-3 text-xs uppercase tracking-[0.28em] text-stone-500">Published products</p>
              <p className="mt-2 text-2xl font-semibold text-stone-900">{Number(profile?.productsPublishedCount || 0).toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-[28px] border-stone-200 bg-white">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-stone-900">Vendor verification and storefront</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
                  Submit your address details, proof of address, NIN slip, and facial verification. You can also set your storefront link for buyers.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Input value={storefrontLink} onChange={(e) => setStorefrontLink(e.target.value)} placeholder="Storefront link (WhatsApp, website, or custom shop URL)" />
              <Input value={storefrontSlug} onChange={(e) => setStorefrontSlug(e.target.value)} placeholder="Custom shop slug (example: my-fashion-store)" />
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" />
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
              <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="State" />
              <Input value={ninNumber} onChange={(e) => setNinNumber(e.target.value)} placeholder="NIN number" />
              <div className="rounded-2xl border border-stone-200 px-4 py-3 text-sm text-stone-600">
                Store status: <span className="font-semibold text-stone-900">{String(profile?.storeStatus || "awaiting_verification").replace(/_/g, " ")}</span>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="cursor-pointer rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm">
                <span className="mb-2 inline-flex items-center gap-2 font-medium text-stone-900"><FileText className="h-4 w-4" /> Proof of address</span>
                <input className="hidden" type="file" accept="image/*,.pdf" onChange={(e) => e.target.files?.[0] && void uploadVerificationFile("proof", e.target.files[0])} />
                <p className="text-stone-600">{proofOfAddressUrl ? "Uploaded" : uploadingField === "proof" ? "Uploading..." : "Tap to upload"}</p>
              </label>
              <label className="cursor-pointer rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm">
                <span className="mb-2 inline-flex items-center gap-2 font-medium text-stone-900"><FileBadge2 className="h-4 w-4" /> NIN slip</span>
                <input className="hidden" type="file" accept="image/*,.pdf" onChange={(e) => e.target.files?.[0] && void uploadVerificationFile("nin", e.target.files[0])} />
                <p className="text-stone-600">{ninSlipUrl ? "Uploaded" : uploadingField === "nin" ? "Uploading..." : "Tap to upload"}</p>
              </label>
              <label className="cursor-pointer rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm">
                <span className="mb-2 inline-flex items-center gap-2 font-medium text-stone-900"><Camera className="h-4 w-4" /> Facial verification</span>
                <input className="hidden" type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && void uploadVerificationFile("face", e.target.files[0])} />
                <p className="text-stone-600">{facialVerificationUrl ? "Uploaded" : uploadingField === "face" ? "Uploading..." : "Tap to upload"}</p>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button className="rounded-full" disabled={submittingVerification} onClick={() => void saveVerification()}>
                {submittingVerification ? "Submitting..." : "Submit verification details"}
              </Button>
              {!setupPaid ? (
                <Button variant="outline" className="rounded-full" onClick={() => setShowSetupPayment(true)}>
                  Pay setup fee (₦10,000)
                </Button>
              ) : null}
              {setupPaid ? (
                <Button variant="outline" className="rounded-full" onClick={() => setShowRentPayment(true)}>
                  Pay monthly rent (₦2,000)
                </Button>
              ) : null}
            </div>

            {!verificationComplete ? (
              <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-sm text-amber-900">
                <AlertCircle className="mr-2 inline-block h-4 w-4 align-[-2px]" />
                Complete all verification fields and uploads before admin can approve your vendor account.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {showSetupPayment ? (
        <PaymentSelector
          open={showSetupPayment}
          amount={10000}
          email={auth.currentUser?.email || undefined}
          fullName={profile?.name || auth.currentUser?.displayName || "Vendor"}
          description="Pamba Vendor Setup Fee"
          onClose={() => setShowSetupPayment(false)}
          onMonnifyReferenceCreated={async (reference: string) => {
            await registerVendorPaymentReference(reference, "setup_fee", 10000)
          }}
          onPaymentSuccess={async (reference, provider, monnifyResponse) => {
            setShowSetupPayment(false)
            await completeVendorPayment(reference, "setup_fee", provider, monnifyResponse)
          }}
        />
      ) : null}

      {showRentPayment ? (
        <PaymentSelector
          open={showRentPayment}
          amount={2000}
          email={auth.currentUser?.email || undefined}
          fullName={profile?.name || auth.currentUser?.displayName || "Vendor"}
          description="Pamba Vendor Monthly Rent"
          onClose={() => setShowRentPayment(false)}
          onMonnifyReferenceCreated={async (reference: string) => {
            await registerVendorPaymentReference(reference, "monthly_rent", 2000)
          }}
          onPaymentSuccess={async (reference, provider, monnifyResponse) => {
            setShowRentPayment(false)
            await completeVendorPayment(reference, "monthly_rent", provider, monnifyResponse)
          }}
        />
      ) : null}
    </div>
  )
}
