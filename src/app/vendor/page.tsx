"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { onAuthStateChanged } from "firebase/auth"
import { doc, onSnapshot } from "firebase/firestore"
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage"
import toast from "react-hot-toast"
import { auth, db, storage } from "@/lib/firebase"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PaymentSelector } from "@/components/payment-selector"
import VendorPulseLoader from "@/components/vendor/VendorPulseLoader"
import ReviewCenter from "@/components/reviews/ReviewCenter"
import { AlertCircle, BookOpen, Camera, CheckCircle2, FileBadge2, FileText, ImageIcon, Package, ShieldCheck, Store, Wallet } from "lucide-react"
import { NIGERIAN_BANKS } from "@/lib/banks"

type VendorProfile = {
  name?: string
  email?: string
  vendorVerificationStatus?: string
  vendorPaymentStatus?: string
  monthlyRentStatus?: string
  monthlyRentDueAt?: { seconds?: number }
  storeStatus?: string
  storefrontLink?: string
  storefrontSlug?: string
  storeCoverUrl?: string
  shopLayout?: string
  shopTheme?: string
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
  vendorVerificationRejectionReason?: string
}

function parseTimestampMs(value: unknown) {
  if (!value || typeof value !== "object" || !("seconds" in value)) return 0
  return Number((value as { seconds?: number }).seconds || 0) * 1000
}

function formatDateLabel(ms: number) {
  if (!ms) return ""
  return new Date(ms).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export default function VendorDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(auth.currentUser?.uid ?? null)
  const [profile, setProfile] = useState<VendorProfile | null>(null)
  const [submittingVerification, setSubmittingVerification] = useState(false)
  const [showSetupPayment, setShowSetupPayment] = useState(false)
  const [showRentPayment, setShowRentPayment] = useState(false)
  const [guideStage, setGuideStage] = useState<"preverification" | "postverification" | null>(null)

  const [storefrontLink, setStorefrontLink] = useState("")
  const [storefrontSlug, setStorefrontSlug] = useState("")
  const [storeCoverUrl, setStoreCoverUrl] = useState("")
  const [shopLayout, setShopLayout] = useState("cards")
  const [shopTheme, setShopTheme] = useState("classic")

  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")
  const [ninNumber, setNinNumber] = useState("")
  const [proofOfAddressUrl, setProofOfAddressUrl] = useState("")
  const [ninSlipUrl, setNinSlipUrl] = useState("")
  const [facialVerificationUrl, setFacialVerificationUrl] = useState("")
  const [bankCode, setBankCode] = useState("")
  const [bankName, setBankName] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [accountName, setAccountName] = useState("")
  const [verifyingBank, setVerifyingBank] = useState(false)
  const [uploadingField, setUploadingField] = useState<"" | "proof" | "nin" | "face" | "cover">("")

  const [cameraActive, setCameraActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

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
    setStoreCoverUrl(String(nextProfile.storeCoverUrl || ""))
    setShopLayout(String(nextProfile.shopLayout || "cards"))
    setShopTheme(String(nextProfile.shopTheme || "classic"))
    setAddress(String(details.address || ""))
    setCity(String(details.city || ""))
    setState(String(details.state || ""))
    setNinNumber(String(details.ninNumber || ""))
    setProofOfAddressUrl(String(details.proofOfAddressUrl || ""))
    setNinSlipUrl(String(details.ninSlipUrl || ""))
    setFacialVerificationUrl(String(details.facialVerificationUrl || ""))
    const profileBank = (nextProfile as unknown as { bank?: { bankCode?: string; bankName?: string; accountNumber?: string; accountName?: string } }).bank
    setBankCode(String(profileBank?.bankCode || ""))
    setBankName(String(profileBank?.bankName || ""))
    setAccountNumber(String(profileBank?.accountNumber || ""))
    setAccountName(String(profileBank?.accountName || ""))
  }

  useEffect(() => {
    let unsubProfile: (() => void) | null = null
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsubProfile?.()
      unsubProfile = null
      setUserId(user?.uid ?? null)
      if (!user) {
        setProfile(null)
        setLoading(false)
        return
      }

      try {
        const idToken = await user.getIdToken()
        await loadProfile(idToken)
        unsubProfile = onSnapshot(doc(db, "vendors", user.uid), (snap) => {
          if (!snap.exists()) return
          setProfile(snap.data() as VendorProfile)
        })
      } catch (error) {
        console.error(error)
        toast.error("Could not load vendor profile")
      } finally {
        setLoading(false)
      }
    })
    return () => {
      unsubProfile?.()
      unsub()
    }
  }, [])

  useEffect(() => {
    if (!cameraActive || !videoRef.current || !streamRef.current) return
    const v = videoRef.current
    v.srcObject = streamRef.current
    void v.play().catch(() => null)
  }, [cameraActive])

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    const verificationStatus = String(profile?.vendorVerificationStatus || "").toLowerCase()
    const verified = verificationStatus === "verified" || verificationStatus === "approved"
    const stage = !verified ? "preverification" : "postverification"
    const key = `vendor-guide-seen:${userId}:${stage}`
    const seen = typeof window !== "undefined" ? window.localStorage.getItem(key) : null
    if (!seen) {
      setGuideStage(stage)
    }
  }, [profile?.vendorPaymentStatus, profile?.vendorVerificationStatus, userId])

  const verificationStatusRaw = String(profile?.vendorVerificationStatus || "").toLowerCase()
  const isVendorVerified = verificationStatusRaw === "verified" || verificationStatusRaw === "approved"
  const isRejected = verificationStatusRaw === "rejected"
  const setupPaid = String(profile?.vendorPaymentStatus || "").toLowerCase() === "paid"
  const dueAtMs = parseTimestampMs(profile?.monthlyRentDueAt)
  const rentDue = setupPaid && dueAtMs > 0 && Date.now() >= dueAtMs
  const rentPaid = String(profile?.monthlyRentStatus || "").toLowerCase() === "paid" && !rentDue
  const rentBadgeLabel = !setupPaid
    ? "Setup fee: Pending"
    : rentDue
      ? "Rent: Due now"
      : dueAtMs > 0
        ? `Rent due: ${formatDateLabel(dueAtMs)}`
        : "Rent: First month free"
  const rentCardLabel = !setupPaid
    ? "Monthly rent"
    : rentDue
      ? "Monthly rent is due"
      : "First month free"
  const canPublish = isVendorVerified && setupPaid && (!rentDue || rentPaid)

  const verificationComplete = Boolean(
    storefrontLink &&
    storefrontSlug &&
    storeCoverUrl &&
    address &&
    city &&
    state &&
    ninNumber &&
    proofOfAddressUrl &&
    ninSlipUrl &&
    facialVerificationUrl &&
    bankName &&
    bankCode &&
    accountNumber &&
    accountName
  )

  useEffect(() => {
    const verifyBank = async () => {
      if (accountNumber.length !== 10 || !bankCode) return
      setVerifyingBank(true)
      try {
        const res = await fetch("/api/verify-bank", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountNumber, bankCode }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data?.status) {
          setAccountName("")
          toast.error(data?.message || "Could not verify bank account")
          return
        }
        setAccountName(String(data?.data?.account_name || ""))
        setBankName(String(data?.data?.bank_name || ""))
      } catch {
        setAccountName("")
      } finally {
        setVerifyingBank(false)
      }
    }
    void verifyBank()
  }, [accountNumber, bankCode])

  const uploadFile = async (field: "proof" | "nin" | "cover", file: File) => {
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
      if (field === "cover") setStoreCoverUrl(url)
      toast.success("File uploaded")
    } catch (error) {
      console.error("Vendor upload error", error)
      toast.error("Upload failed")
    } finally {
      setUploadingField("")
    }
  }

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      })
      streamRef.current = stream
      setCameraActive(true)
    } catch (error) {
      console.error(error)
      toast.error("Could not access your camera. Please allow camera permission.")
    }
  }

  const stopCamera = () => {
    const stream = streamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setCameraActive(false)
  }

  const captureFace = async () => {
    if (!videoRef.current || !canvasRef.current || !auth.currentUser) return
    const video = videoRef.current
    const canvas = canvasRef.current
    const width = video.videoWidth || 640
    const height = video.videoHeight || 480
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0, width, height)

    setUploadingField("face")
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9))
      if (!blob) throw new Error("Failed to capture face image")
      const uid = auth.currentUser.uid
      const path = `vendorVerification/${uid}/${Date.now()}-face-capture.jpg`
      const storageRef = ref(storage, path)
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, blob)
        task.on("state_changed", undefined, reject, () => resolve())
      })
      const url = await getDownloadURL(storageRef)
      setFacialVerificationUrl(url)
      toast.success("Face capture uploaded")
      stopCamera()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Could not upload captured face")
    } finally {
      setUploadingField("")
    }
  }

  const saveVerification = async () => {
    if (!auth.currentUser) return
    if (!verificationComplete) {
      toast.error("Please complete every verification field and upload all required files.")
      return
    }
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
          updateType: "verification",
          storefrontLink,
          storefrontSlug,
          storeCoverUrl,
          address,
          city,
          state,
          ninNumber,
          proofOfAddressUrl,
          ninSlipUrl,
          facialVerificationUrl,
          bankCode,
          bankName,
          accountNumber,
          accountName,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Could not submit verification")
      }
      toast.success("Verification submitted. Admin will review it shortly.")
      await loadProfile(idToken)
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Could not submit verification")
    } finally {
      setSubmittingVerification(false)
    }
  }

  const registerVendorPaymentReference = async (
    reference: string,
    purpose: "setup_fee" | "monthly_rent",
    amount: number
  ) => {
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

  const completeVendorPayment = async (
    reference: string,
    purpose: "setup_fee" | "monthly_rent",
    provider: "paystack" | "monnify",
    monnifyResponse?: Record<string, unknown>
  ) => {
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
    if (!res.ok || !data.success) throw new Error(data.message || "Vendor payment failed")
    toast.success(purpose === "setup_fee" ? "Setup fee confirmed" : "Monthly rent confirmed")
    await loadProfile(idToken)
  }

  const statusText = isVendorVerified ? "Verified" : isRejected ? "Needs attention" : "Waiting for verification"
  const rejectionReason = String(profile?.vendorVerificationRejectionReason || "").trim()

  const dismissGuide = () => {
    if (!userId || !guideStage || typeof window === "undefined") return
    window.localStorage.setItem(`vendor-guide-seen:${userId}:${guideStage}`, "1")
    setGuideStage(null)
  }

  if (loading) {
    return <VendorPulseLoader label="Loading your vendor dashboard..." />
  }

  if (!userId) {
    return (
      <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-8 text-center">
        <Store className="mx-auto h-10 w-10 text-cyan-600" />
        <h1 className="mt-4 text-2xl font-semibold text-stone-900">Vendor dashboard</h1>
        <p className="mt-2 text-stone-600">Please sign in as a Pamba Store.</p>
        <Button asChild className="mt-6 rounded-full bg-cyan-700 hover:bg-cyan-600">
          <Link href="/auth/sign-in">Go to sign in</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-[30px] border-cyan-100 bg-white shadow-[0_24px_80px_-60px_rgba(8,145,178,0.55)]">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-700">
                <Store className="h-4 w-4" />
                Vendor Hub
              </div>
              <h1 className="text-3xl font-semibold text-stone-900">
                Welcome{profile?.name ? `, ${profile.name}` : ""}.
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-stone-600">
                Build your store and list products once your account is approved and your setup fee is complete.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button asChild className="rounded-full bg-cyan-700 hover:bg-cyan-600">
                  <Link href="/vendor/products">Manage and Add Products</Link>
                </Button>
                {canPublish ? (
                  <Button asChild variant="outline" className="rounded-full">
                    <Link href="/vendor/create-task">Create task</Link>
                  </Button>
                ) : null}
                {profile?.storefrontSlug ? (
                  <>
                    <Button asChild variant="outline" className="rounded-full">
                      <Link href={`/marketplace/shop/${profile.storefrontSlug}`}>View shop</Link>
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-full"
                      onClick={() => {
                        const shopUrl = `${window.location.origin}/marketplace/shop/${profile.storefrontSlug}`
                        navigator.clipboard.writeText(shopUrl)
                          .then(() => toast.success("Shop link copied"))
                          .catch(() => toast.error("Could not copy shop link"))
                      }}
                    >
                      Copy shop link
                    </Button>
                  </>
                ) : (
                  <Button asChild variant="outline" className="rounded-full">
                    <Link href="/vendor/settings">Set shop link to enable view shop</Link>
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="rounded-full border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-700">{statusText}</Badge>
              <Badge className="rounded-full border-stone-200 bg-stone-50 px-3 py-1 text-stone-700">{rentBadgeLabel}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-3xl border-stone-200 bg-white">
          <CardContent className="p-5">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <p className="mt-3 text-xs uppercase tracking-[0.28em] text-stone-500">Verification</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">{statusText}</p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-stone-200 bg-white">
          <CardContent className="p-5">
            <Wallet className="h-5 w-5 text-cyan-600" />
            <p className="mt-3 text-xs uppercase tracking-[0.28em] text-stone-500">Setup fee</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">{setupPaid ? "Paid" : "₦10,000"}</p>
            {isVendorVerified && !setupPaid ? (
              <Button className="mt-3 rounded-full bg-cyan-700 hover:bg-cyan-600" onClick={() => setShowSetupPayment(true)}>
                Pay setup fee
              </Button>
            ) : null}
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

      {setupPaid ? (
        <Card className="rounded-3xl border-rose-300 bg-rose-50/80 shadow-[0_20px_55px_-40px_rgba(225,29,72,0.65)]">
          <CardContent className="p-5">
            <p className="text-base font-semibold text-rose-900">{rentCardLabel}</p>
            <p className="mt-1 text-sm text-rose-900/80">
              {rentDue
                ? "Pay now so your products stay live in the marketplace."
                : dueAtMs > 0
                  ? `Your first rent payment becomes due on ${formatDateLabel(dueAtMs)}.`
                  : "Your first month is free after setup is completed."}
            </p>
            <div className="mt-3">
              <Button className="rounded-full bg-rose-600 hover:bg-rose-500" onClick={() => setShowRentPayment(true)}>
                Pay monthly rent (₦2,000)
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <ReviewCenter role="vendor" />

      {guideStage ? (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-stone-950/60 px-4 py-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[28px] border border-cyan-100 bg-white p-6 shadow-[0_30px_100px_-50px_rgba(8,145,178,0.8)]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-cyan-50 p-3 text-cyan-700">
                  <BookOpen className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-700">Vendor guide</p>
                  <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                    {guideStage === "preverification" ? "Complete your vendor setup first" : "Your store is ready for the next step"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {guideStage === "preverification"
                      ? "Fill the verification form now so the admin can review your store. You will be emailed when the review is approved or if anything needs correction."
                      : "Your account is approved. You can now manage products, copy your shop link, publish tasks, and track store activity. You will also get email updates whenever your rent, setup, or verification status changes."}
                  </p>
                </div>
              </div>
              <button onClick={dismissGuide} className="rounded-full px-3 py-2 text-sm font-medium text-stone-500 hover:bg-stone-100">
                Close
              </button>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {guideStage === "preverification" ? (
                <>
                  <GuideItem title="Step 1: Fill every field" body="Add your shop link, shop link name, address, city, state, NIN, proof of address, NIN slip, store cover image, and live facial capture." />
                  <GuideItem title="Step 2: Wait for approval" body="After submission, admin reviews your verification. You will get an email alert when they approve or reject it." />
                </>
              ) : (
                <>
                  <GuideItem title="Step 1: Manage your shop" body="Use your dashboard to update your shop link, store cover, and product settings. Copy your shop link any time to share it." />
                  <GuideItem title="Step 2: Publish products and tasks" body="Once setup fee and rent are active, you can add products, create eligible tasks, and see your sales, transactions, and referrals." />
                </>
              )}
              <GuideItem title="Email alerts" body="We send email notifications for verification approval or rejection, setup fee confirmation, rent reminders, and account status updates." />
              <GuideItem title="Need details?" body="Open the vendor guide page any time from the sidebar to see the full step-by-step flow in one place." />
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild className="rounded-full bg-cyan-700 hover:bg-cyan-600">
                <Link href="/vendor/guide" onClick={dismissGuide}>Open full vendor guide</Link>
              </Button>
              <Button variant="outline" className="rounded-full" onClick={dismissGuide}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Got it
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {!isVendorVerified ? (
        <Card className="rounded-[28px] border-stone-200 bg-white">
          <CardContent className="p-6 md:p-8">
            <h2 className="text-xl font-semibold text-stone-900">Complete your verification</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              Fill all fields below. After admin approval, this form will be replaced with your normal store dashboard.
            </p>
            {isRejected && rejectionReason ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                <p className="font-semibold">Your previous verification was rejected.</p>
                <p className="mt-1">Reason: {rejectionReason}</p>
                <p className="mt-1">Please correct the issue and submit again.</p>
              </div>
            ) : null}

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Input required value={storefrontLink} onChange={(e) => setStorefrontLink(e.target.value)} placeholder="How should customers contact you to buy? (WhatsApp or website link)" />
                <p className="text-xs text-stone-500">Example: your WhatsApp link or order page link customers will open to buy.</p>
              </div>
              <div className="space-y-1">
                <Input required value={storefrontSlug} onChange={(e) => setStorefrontSlug(e.target.value)} placeholder="Choose a short shop link name (example: glow-skincare)" />
                <p className="text-xs text-stone-500">This becomes your public shop link: `/marketplace/shop/your-name`.</p>
              </div>
              <Input required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Business address" />
              <Input required value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
              <Input required value={state} onChange={(e) => setState(e.target.value)} placeholder="State" />
              <Input required value={ninNumber} onChange={(e) => setNinNumber(e.target.value)} placeholder="NIN number" />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="cursor-pointer rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm">
                <span className="mb-2 inline-flex items-center gap-2 font-medium text-stone-900"><FileText className="h-4 w-4" /> Proof of address</span>
                <input required className="hidden" type="file" accept="image/*,.pdf" onChange={(e) => e.target.files?.[0] && void uploadFile("proof", e.target.files[0])} />
                <p className="text-stone-600">{proofOfAddressUrl ? "Uploaded" : uploadingField === "proof" ? "Uploading..." : "Tap to upload"}</p>
              </label>

              <label className="cursor-pointer rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm">
                <span className="mb-2 inline-flex items-center gap-2 font-medium text-stone-900"><FileBadge2 className="h-4 w-4" /> NIN slip</span>
                <input required className="hidden" type="file" accept="image/*,.pdf" onChange={(e) => e.target.files?.[0] && void uploadFile("nin", e.target.files[0])} />
                <p className="text-stone-600">{ninSlipUrl ? "Uploaded" : uploadingField === "nin" ? "Uploading..." : "Tap to upload"}</p>
              </label>

              <label className="cursor-pointer rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm">
                <span className="mb-2 inline-flex items-center gap-2 font-medium text-stone-900"><ImageIcon className="h-4 w-4" /> Store cover image</span>
                <input required className="hidden" type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && void uploadFile("cover", e.target.files[0])} />
                <p className="text-stone-600">{storeCoverUrl ? "Uploaded" : uploadingField === "cover" ? "Uploading..." : "Tap to upload"}</p>
              </label>
            </div>

            <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm font-medium text-stone-900">Bank details (required)</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <select
                  required
                  value={bankCode}
                  onChange={(e) => {
                    const code = e.target.value
                    setBankCode(code)
                    const found = NIGERIAN_BANKS.find((b) => b.code === code)
                    setBankName(found?.name || "")
                    setAccountName("")
                  }}
                  className="h-10 w-full rounded-xl border border-stone-300 px-3 text-sm text-stone-700 outline-none focus:border-cyan-400"
                >
                  <option value="">Select bank</option>
                  {NIGERIAN_BANKS.map((bank) => (
                    <option key={bank.code} value={bank.code}>
                      {bank.name}
                    </option>
                  ))}
                </select>
                <Input
                  required
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="Account number"
                />
                <Input required value={accountName} readOnly placeholder={verifyingBank ? "Verifying account..." : "Verified account name"} className="md:col-span-2" />
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm font-medium text-stone-900">Facial verification (live capture only)</p>
              <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
                <div className="h-48 w-full max-w-xs overflow-hidden rounded-2xl border border-stone-200 bg-black">
                  {cameraActive ? (
                    <video ref={videoRef} className="h-full w-full object-cover" muted autoPlay playsInline />
                  ) : facialVerificationUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={facialVerificationUrl} alt="Facial capture" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-stone-400">No capture yet</div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!cameraActive ? (
                    <Button onClick={() => void startCamera()} className="rounded-full bg-cyan-700 hover:bg-cyan-600">
                      <Camera className="mr-2 h-4 w-4" />
                      Start camera
                    </Button>
                  ) : (
                    <>
                      <Button onClick={() => void captureFace()} className="rounded-full bg-cyan-700 hover:bg-cyan-600" disabled={uploadingField === "face"}>
                        {uploadingField === "face" ? "Uploading..." : "Capture face"}
                      </Button>
                      <Button variant="outline" onClick={stopCamera} className="rounded-full">
                        Stop camera
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                className="rounded-full bg-cyan-700 hover:bg-cyan-600"
                disabled={submittingVerification || !verificationComplete || uploadingField !== "" || cameraActive}
                onClick={() => void saveVerification()}
              >
                {submittingVerification ? "Submitting..." : "Submit verification"}
              </Button>
            </div>

            {!verificationComplete ? (
              <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-sm text-amber-900">
                <AlertCircle className="mr-2 inline-block h-4 w-4 align-[-2px]" />
                Every field and upload is required before submission.
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {showSetupPayment ? (
        <PaymentSelector
          open={showSetupPayment}
          amount={10000}
          email={auth.currentUser?.email || undefined}
          fullName={profile?.name || auth.currentUser?.displayName || "Vendor"}
          description="Pamba Store Setup Fee"
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
          description="Pamba Store Monthly Rent"
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

function GuideItem({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-sm font-semibold text-stone-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-stone-600">{body}</p>
    </div>
  )
}
