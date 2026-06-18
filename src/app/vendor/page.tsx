"use client"

import { useEffect, useRef, useState } from "react"
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
import VendorPulseLoader from "@/components/vendor/VendorPulseLoader"
import { AlertCircle, Camera, FileBadge2, FileText, ImageIcon, Package, ShieldCheck, Store, Wallet } from "lucide-react"

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
}

function parseTimestampMs(value: unknown) {
  if (!value || typeof value !== "object" || !("seconds" in value)) return 0
  return Number((value as { seconds?: number }).seconds || 0) * 1000
}

export default function VendorDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(auth.currentUser?.uid ?? null)
  const [profile, setProfile] = useState<VendorProfile | null>(null)
  const [submittingVerification, setSubmittingVerification] = useState(false)
  const [submittingSettings, setSubmittingSettings] = useState(false)
  const [showSetupPayment, setShowSetupPayment] = useState(false)
  const [showRentPayment, setShowRentPayment] = useState(false)

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

  const verificationStatusRaw = String(profile?.vendorVerificationStatus || "").toLowerCase()
  const isVendorVerified = verificationStatusRaw === "verified" || verificationStatusRaw === "approved"
  const isRejected = verificationStatusRaw === "rejected"
  const setupPaid = String(profile?.vendorPaymentStatus || "").toLowerCase() === "paid"
  const dueAtMs = parseTimestampMs(profile?.monthlyRentDueAt)
  const rentDue = setupPaid && dueAtMs > 0 && Date.now() >= dueAtMs
  const rentPaid = String(profile?.monthlyRentStatus || "").toLowerCase() === "paid" && !rentDue
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
    facialVerificationUrl
  )

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

  const saveStoreSettings = async () => {
    if (!auth.currentUser) return
    if (!storefrontLink || !storefrontSlug || !storeCoverUrl) {
      toast.error("Please provide your store contact link, store link text, and cover image.")
      return
    }
    setSubmittingSettings(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch("/api/vendor/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          updateType: "settings",
          storefrontLink,
          storefrontSlug,
          storeCoverUrl,
          shopLayout,
          shopTheme,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.message || "Could not update store settings")
      toast.success("Store settings updated")
      await loadProfile(idToken)
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Could not update settings")
    } finally {
      setSubmittingSettings(false)
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

  if (loading) {
    return <VendorPulseLoader label="Loading your vendor dashboard..." />
  }

  if (!userId) {
    return (
      <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-8 text-center">
        <Store className="mx-auto h-10 w-10 text-cyan-600" />
        <h1 className="mt-4 text-2xl font-semibold text-stone-900">Vendor dashboard</h1>
        <p className="mt-2 text-stone-600">Please sign in as a Pamba Vendor.</p>
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
              <div className="flex flex-wrap gap-2">
                <Button asChild className="rounded-full bg-cyan-700 hover:bg-cyan-600" disabled={!canPublish}>
                  <Link href="/vendor/products">Manage products</Link>
                </Button>
                {profile?.storefrontSlug ? (
                  <Button asChild variant="outline" className="rounded-full">
                    <Link href={`/marketplace/shop/${profile.storefrontSlug}`}>View shop</Link>
                  </Button>
                ) : (
                  <Button asChild variant="outline" className="rounded-full" disabled>
                    <span>View shop</span>
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="rounded-full border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-700">{statusText}</Badge>
              <Badge className="rounded-full border-stone-200 bg-stone-50 px-3 py-1 text-stone-700">
                Setup fee: {setupPaid ? "Paid" : "Pending"}
              </Badge>
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

      {setupPaid && dueAtMs > 0 && rentDue ? (
        <Card className="rounded-3xl border-rose-300 bg-rose-50/80 shadow-[0_20px_55px_-40px_rgba(225,29,72,0.65)]">
          <CardContent className="p-5">
            <p className="text-base font-semibold text-rose-900">Monthly rent is now due to keep your store visible.</p>
            <p className="mt-1 text-sm text-rose-900/80">
              Pay now so your products stay live in the marketplace.
            </p>
            <div className="mt-3">
              <Button className="rounded-full bg-rose-600 hover:bg-rose-500" onClick={() => setShowRentPayment(true)}>
                Pay monthly rent (₦2,000)
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!isVendorVerified ? (
        <Card className="rounded-[28px] border-stone-200 bg-white">
          <CardContent className="p-6 md:p-8">
            <h2 className="text-xl font-semibold text-stone-900">Complete your verification</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              Fill all fields below. After admin approval, this form will be replaced with your normal store dashboard.
            </p>

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
                <input className="hidden" type="file" accept="image/*,.pdf" onChange={(e) => e.target.files?.[0] && void uploadFile("proof", e.target.files[0])} />
                <p className="text-stone-600">{proofOfAddressUrl ? "Uploaded" : uploadingField === "proof" ? "Uploading..." : "Tap to upload"}</p>
              </label>

              <label className="cursor-pointer rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm">
                <span className="mb-2 inline-flex items-center gap-2 font-medium text-stone-900"><FileBadge2 className="h-4 w-4" /> NIN slip</span>
                <input className="hidden" type="file" accept="image/*,.pdf" onChange={(e) => e.target.files?.[0] && void uploadFile("nin", e.target.files[0])} />
                <p className="text-stone-600">{ninSlipUrl ? "Uploaded" : uploadingField === "nin" ? "Uploading..." : "Tap to upload"}</p>
              </label>

              <label className="cursor-pointer rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm">
                <span className="mb-2 inline-flex items-center gap-2 font-medium text-stone-900"><ImageIcon className="h-4 w-4" /> Store cover image</span>
                <input className="hidden" type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && void uploadFile("cover", e.target.files[0])} />
                <p className="text-stone-600">{storeCoverUrl ? "Uploaded" : uploadingField === "cover" ? "Uploading..." : "Tap to upload"}</p>
              </label>
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
      ) : (
        <Card className="rounded-[28px] border-stone-200 bg-white">
          <CardContent className="p-6 md:p-8">
            <h2 className="text-xl font-semibold text-stone-900">Store settings</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Your account is verified. Manage your public shop details below.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Input value={storefrontLink} onChange={(e) => setStorefrontLink(e.target.value)} placeholder="Customer contact link (WhatsApp or website)" />
              <Input value={storefrontSlug} onChange={(e) => setStorefrontSlug(e.target.value)} placeholder="Shop link name (example: glow-skincare)" />
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Shop layout style</label>
                <select
                  value={shopLayout}
                  onChange={(e) => setShopLayout(e.target.value)}
                  className="h-10 w-full rounded-xl border border-stone-300 px-3 text-sm text-stone-700 outline-none focus:border-cyan-400"
                >
                  <option value="cards">Cards</option>
                  <option value="spotlight">Spotlight</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Shop color mood</label>
                <select
                  value={shopTheme}
                  onChange={(e) => setShopTheme(e.target.value)}
                  className="h-10 w-full rounded-xl border border-stone-300 px-3 text-sm text-stone-700 outline-none focus:border-cyan-400"
                >
                  <option value="classic">Classic</option>
                  <option value="ocean">Ocean</option>
                  <option value="sunset">Sunset</option>
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="cursor-pointer rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-700">
                <span className="mb-2 inline-flex items-center gap-2 font-medium text-stone-900"><ImageIcon className="h-4 w-4" /> Update store cover image</span>
                <input className="hidden" type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && void uploadFile("cover", e.target.files[0])} />
                <p>{storeCoverUrl ? "Cover uploaded" : uploadingField === "cover" ? "Uploading..." : "Tap to upload"}</p>
              </label>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button className="rounded-full bg-cyan-700 hover:bg-cyan-600" onClick={() => void saveStoreSettings()} disabled={submittingSettings}>
                {submittingSettings ? "Saving..." : "Save shop settings"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
