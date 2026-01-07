"use client"

import React, { useEffect, useState, useRef } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
// Dropzone removed: banner upload disabled, thumbnails auto-generated per task type
import { auth, storage, db } from "@/lib/firebase"
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage"
import { serverTimestamp, getDocs, query, where, collection, updateDoc } from "firebase/firestore"

import toast from "react-hot-toast"
import imageCompression from "browser-image-compression"
import { motion, AnimatePresence } from "framer-motion"
import {
  FileText,
  ArrowRight,
  ArrowLeft,
  CreditCard,
} from "lucide-react"

type CampaignType =
  | "Video"
  | "Share my Product"
  | "WhatsApp Status"
  | "WhatsApp Group Join"
  | "Telegram Group Join"
  | "Facebook Group Join"
  | "other website tasks"
  | "Survey"
  | "App Download"
  | "Instagram Follow"
  | "Instagram Like"
  | "Instagram Share"
  | "Twitter Follow"
  | "Twitter Retweet"
  | "Facebook Like"
  | "Facebook Share"
  | "TikTok Follow"
  | "TikTok Like"
  | "TikTok Share"
  | "YouTube Subscribe"
  | "YouTube Like"
  | "YouTube Comment"

const STEPS = ["Details", "Upload Task Link", "Budget", "Review & Pay"] as const

// Different CPL values per category
const CPL_MAP: Record<CampaignType, number> = {
  // Advertiser price (NGN). Earner usually gets half, except Video which pays a fixed 150 to earner.
   Video: 100,
    "Share my Product": 150,
    "other website tasks": 100,
    Survey: 100,
    "App Download": 200,
    "Instagram Follow": 50,
    "Instagram Like": 50,
    "Instagram Share": 100,
    "Twitter Follow": 50,
    "Twitter Retweet": 50,
    "Facebook Like": 50,
    "Facebook Share": 100,
    "TikTok Follow": 50,
    "TikTok Like": 50,
    "TikTok Share": 50,
    "YouTube Subscribe": 50,
    "YouTube Like": 50,
    "YouTube Comment": 50,
    "WhatsApp Status": 100,
    "WhatsApp Group Join": 100,
    "Telegram Group Join": 100,
    "Facebook Group Join": 100,
}

export default function CreateCampaignPage() {
  const router = useRouter()

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (!user) {
        router.push("/auth/sign-in")
      }
    })
    return () => unsub()
  }, [router])

  // stepper
  const [step, setStep] = useState<number>(0)

  // loading / progress states
  const [loading, setLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)

  // form fields
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<CampaignType | "">("")
  const [bannerUrl, setBannerUrl] = useState("")
  const [mediaUrl, setMediaUrl] = useState("")
  const [externalLink, setExternalLink] = useState("")
  const [videoLink, setVideoLink] = useState("") // ✅ new field
  const [productLink, setProductLink] = useState("") // ✅ product link field
  // face verification + address (for product campaigns)
  const [faceImage, setFaceImage] = useState<string | null>(null)
  const [faceImageUrl, setFaceImageUrl] = useState<string | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [faceUploading, setFaceUploading] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const [addressLine, setAddressLine] = useState("")
  const [city, setCity] = useState("")
  const [stateRegion, setStateRegion] = useState("")


  // targeting removed — only budget is required now

  const [budget, setBudget] = useState<number | "">("")

  // derived values
  const numericBudget = typeof budget === "number" ? budget : Number(budget || 0)
  const currentCPL = category ? CPL_MAP[category as CampaignType] : 200
  const estimatedLeads =
    numericBudget > 0 ? Math.floor(numericBudget / currentCPL) : 0

  // helper: generate thumbnail for category
  const getThumbnailForCategory = (cat: string) => {
    if (!cat) return "/placeholders/default.jpg"
    const slug = cat.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    // prefer vector icons in public/icons, fallback to placeholders
    return `/icons/${slug}.svg`
  }

  // generate a thumbnail when user reaches review step (do not show on initial details)
  React.useEffect(() => {
    if (step >= 3 && category && !bannerUrl) {
      setBannerUrl(getThumbnailForCategory(category as string))
    }
  }, [step, category, bannerUrl])

  // Load Paystack script once
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

  // compress images client-side
  const compressImage = async (file: File) => {
    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      }
const compressed = await imageCompression(file, options)
      return compressed as File
    } catch (error) {
      console.error('Image compression failed:', error)
      return file
    }
  }

  // upload to Firebase Storage
  const uploadFile = (
    file: File,
    path: string,
    onUrl: (url: string) => void
  ) => {
    const storageRef = ref(storage, path)
    const uploadTask = uploadBytesResumable(storageRef, file)

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const pct = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        setUploadProgress(Math.round(pct))
      },
      (error) => {
        console.error("Upload error:", error)
        toast.error("Upload failed. Try again.")
        setLoading(false)
        setUploadProgress(null)
      },
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref)
        onUrl(url)
        setUploadProgress(null)
        setLoading(false)
      }
    )
  }

  // Reference helpers so they are not flagged as unused (banner upload removed)
  React.useEffect(() => {
    void compressImage
    void uploadFile
    void setMediaUrl
  }, [])

  // Banner upload removed; media upload still uses uploadFile helper above when needed elsewhere

  // Step validation
  const isStepValid = () => {
    if (step === 0)
      return (
        title.trim().length >= 3 &&
        description.trim().length >= 10 &&
        category
      )
    if (step === 1) {
      if (category === "Video") return videoLink.trim().length > 5 
      if (category === "Share my Product") return productLink.trim().length > 5
      if (["Survey", "other website tasks", "App Download"].includes(category))
        return externalLink.trim().length > 5
      return true
    }
    if (step === 2) return numericBudget > 0
    if (step === 3) {
      // If this is a product campaign require face capture upload and address
      if (category === "Share my Product") {
        return Boolean((faceImageUrl || faceImage) && addressLine.trim().length > 3 && city.trim().length > 1)
      }
      return true
    }
    return false
  }

  // Verify payment server-side
  const verifyPayment = async (reference: string, campaignData: Record<string, unknown>) => {
    const t = toast.loading("Verifying payment...")
    try {
      const res = await fetch("/api/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, campaignData }),
      })
      const data = await res.json()
      toast.dismiss(t)
      if (res.ok && data.success) {
        toast.success("Payment confirmed - task created")
        router.push("/advertiser")
      } else {
        toast.error(data?.message || "Payment verification failed")
      }
    } catch {
      toast.dismiss(t)
      toast.error("Error verifying payment")
    }
  }

  // Paystack payment
  const handlePay = async () => {
    const user = auth.currentUser
    if (!user || !user.email) {
      toast.error("You must be logged in to pay")
      return
    }

    if (!isStepValid()) {
      toast.error("Please complete all required fields")
      return
    }

    // Ensure advertiser profile is onboarded/activated before allowing task creation
    let advertiserProfile: Record<string, unknown> | null = null

    // Build a temporary campaign payload early so we can persist it if activation is required
    const tempCampaignData: Record<string, unknown> = {
      ownerId: user.uid,
      title: title.trim(),
      description: description.trim(),
      category,
      bannerUrl,
      mediaUrl: category === "Video" ? videoLink : mediaUrl,
      externalLink: category === "Share my Product" ? productLink : (externalLink || ""),
      budget: numericBudget,
      estimatedLeads,
      costPerLead: currentCPL,
      status: "Active",
      createdAt: serverTimestamp(),
    }
    try {
      const docs = await getDocs(query(collection(db, 'advertisers'), where('email', '==', user.email)))
      if (docs.empty) {
        toast.error('Advertiser profile not found - please complete onboarding')
        router.push('/advertiser/onboarding')
        return
      }
      advertiserProfile = docs.docs[0].data() as Record<string, unknown>
      // If not onboarded, send to onboarding
      if (!advertiserProfile['onboarded']) {
        toast.error('Please complete advertiser onboarding before creating tasks')
        router.push('/advertiser/onboarding')
        return
      }
      // If onboarded but not activated, show an inline activation prompt instead of redirecting
      if (!advertiserProfile['activated']) {
        // show a prompt to the user to activate now
        setShowActivatePrompt(true)
        // keep campaignData persisted in state so we can continue after activation
        setPendingCampaign(tempCampaignData)
        return
      }
    } catch (e) {
      console.warn('Failed to validate advertiser profile', e)
    }

    const campaignData: Record<string, unknown> = { ...tempCampaignData }

    // Attach advertiser display name for admin/reporting convenience
    if (advertiserProfile) {
      campaignData.advertiserName = String(advertiserProfile['fullName'] || advertiserProfile['businessName'] || advertiserProfile['name'] || user.email)
    }

    // If product campaign, attach face capture URL (preferred) and address
    if (category === "Share my Product") {
      if (faceImageUrl) campaignData['advertiserFaceImage'] = faceImageUrl
      else if (faceImage) campaignData['advertiserFaceImage'] = faceImage
      campaignData['advertiserAddress'] = {
        addressLine: addressLine || "",
        city: city || "",
        state: stateRegion || "",
      }
    }

      // Attempt to create the campaign using wallet funds first
    try {
      const idToken = await user.getIdToken()
      const res = await fetch('/api/advertiser/campaign/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ campaignData }),
      })

      if (res.ok) {
        toast.success('Campaign created using wallet funds')
        setTimeout(() => router.push('/advertiser'), 600)
        return
      }

      const data = await res.json().catch(() => ({}))
      if (res.status === 402 || /insufficient/i.test(String(data?.message || ''))) {
        toast.error('Insufficient wallet balance - please fund wallet to continue')
        setTimeout(() => router.push('/advertiser/wallet'), 700)
        return
      }

      toast.error(data?.message || 'Failed to create campaign using wallet')
    } catch (err) {
      console.error('Wallet create error', err)
      toast.error('Failed to create campaign — try again')
    }
  }

  // Activation prompt state and helper
  const [showActivatePrompt, setShowActivatePrompt] = useState(false)
  const [pendingCampaign, setPendingCampaign] = useState<Record<string, unknown> | null>(null)

  const triggerActivationPayment = async (campaignAfter?: Record<string, unknown> | null) => {
    const user = auth.currentUser
    if (!user || !user.email) {
      toast.error('You must be logged in to activate')
      return
    }

    if (!process.env.NEXT_PUBLIC_PAYSTACK_KEY) {
      toast.error('Payment configuration error')
      return
    }

    try {
      const PaystackPop = (window as unknown as { PaystackPop: { setup: (config: Record<string, unknown>) => { openIframe: () => void } } }).PaystackPop
      if (!PaystackPop) throw new Error('Paystack not loaded')

      // Use a non-async callback wrapper (Paystack validates that `callback` is a function)
      const onActivationCallback = function (resp: { reference: string }) {
        ;(async () => {
          let res: Response | null = null
          try {
            res = await fetch('/api/advertiser/activate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reference: resp.reference, userId: user.uid }),
            })
          } catch (networkErr) {
            console.error('Activation network error', networkErr)
            toast.error('Network request failed during activation')
            return
          }

          let text = ''
          try {
            text = await res.text()
          } catch (e) {
            console.error('Failed reading activation response text', e)
          }

          let data: Record<string, unknown> = {}
          try {
            data = text ? JSON.parse(text) : {}
          } catch (e) {
            // ignore non-JSON
          }

          if (res.ok && data?.success) {
            toast.success('Account activated successfully')
            setShowActivatePrompt(false)
            if (campaignAfter || pendingCampaign) {
              setTimeout(() => {
                if (campaignAfter) {
                  void handlePay()
                } else if (pendingCampaign) {
                  void handlePay()
                }
              }, 800)
            }
            return
          }

          const message = data?.message || text || `Activation failed (status ${res.status})`
          console.error('Activation verify error', { status: res.status, message, data, text })
          toast.error(String(message))
        })().catch((e) => console.error('Activation callback error', e))
      }

      const handler = PaystackPop.setup({
        key: process.env.NEXT_PUBLIC_PAYSTACK_KEY,
        email: user.email,
        amount: 2000 * 100,
        currency: 'NGN',
        label: 'Advertiser Account Activation',
        metadata: { userId: user.uid },
        onClose: function () { toast.error('Activation cancelled') },
        callback: onActivationCallback,
      })
      handler.openIframe()
    } catch (err) {
      console.error('Activation error', err)
      toast.error('Activation failed')
    }
  }

  // helpers
  const canGoNext = isStepValid()

  // Camera helpers for face verification
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraActive(true)
    } catch (e) {
      console.error('Camera start failed', e)
      toast.error('Unable to access camera. Please allow camera permission.')
    }
  }

  const stopCamera = () => {
    try {
      const stream = videoRef.current?.srcObject as MediaStream | null
      if (stream) {
        stream.getTracks().forEach((t) => t.stop())
      }
      if (videoRef.current) videoRef.current.srcObject = null
    } finally {
      setCameraActive(false)
    }
  }

  const captureFace = async () => {
    if (!videoRef.current) return
    const v = videoRef.current
    const canvas = canvasRef.current || document.createElement('canvas')
    canvas.width = v.videoWidth || 320
    canvas.height = v.videoHeight || 240
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
    const data = canvas.toDataURL('image/jpeg', 0.9)
    setFaceImage(data)
    stopCamera()

    // upload captured image to Firebase Storage
    try {
      setFaceUploading(true)
      // convert dataURL to blob
      const blob = await (await fetch(data)).blob()
      const user = auth.currentUser
      const uid = user?.uid || 'anon'
      const filename = `face_${uid}_${Date.now()}.jpg`
      let file = new File([blob], filename, { type: blob.type || 'image/jpeg' })

      // compress the captured image before upload
      try {
        const compressed = await compressImage(file)
        file = compressed as File
      } catch (e) {
        console.warn('Image compression failed, uploading original', e)
      }

      const path = `advertiserFaces/${uid}/${filename}`
      // reuse uploadFile helper
      uploadFile(file, path, async (url) => {
        setFaceImageUrl(url)
        setFaceUploading(false)
        toast.success('Face image uploaded')

        // persist the uploaded face image URL into the advertiser profile if available
        try {
          const docs = await getDocs(query(collection(db, 'advertisers'), where('email', '==', user?.email)))
          if (!docs.empty) {
            await updateDoc(docs.docs[0].ref, { advertiserFaceImage: url, advertiserFaceUploadedAt: serverTimestamp() })
          }
        } catch (e) {
          console.warn('Failed to persist face URL to advertiser profile', e)
        }
      })
    } catch (e) {
      console.error('Face upload error', e)
      toast.error('Face upload failed')
      setFaceUploading(false)
    }
  }

  const StepHeader = (
    <div className="max-w-3xl mx-auto text-center space-y-2">
      <Button
        onClick={() => router.back()}
        className="flex gap-2 mb-4 bg-stone-700 hover:bg-stone-800 text-white"
        size="sm"
      >
        <ArrowLeft size={16} /> Back
      </Button>
  <h1 className="text-2xl md:text-3xl font-bold text-stone-800">Create a Task</h1>
      <p className="text-sm text-stone-600">Fill in the details. You will only pay & submit after review.</p>
    </div>
  )

  // ✅ helper to embed YouTube/Vimeo links
const getEmbeddedVideo = (url: string) => {
  try {
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)

    if (ytMatch) {
      return `https://www.youtube.com/embed/${ytMatch[1]}`
    }
    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}`
    }
    return null
  } catch {
    return null
  }
}


  // Render step content
  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <Card>
            <CardContent className="space-y-4 p-6">
              <label className="text-sm font-medium text-stone-700">
                Task title
              </label>
              <Input
                placeholder="Write a short, clear title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <label className="text-sm font-medium text-stone-700">
                Description
              </label>
              <Textarea
                placeholder="Explain what you want participants to do"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <label className="text-sm font-medium text-stone-700">
                Category
              </label>
              <select
                className="w-full border rounded px-3 py-2 bg-white"
                value={category}
                onChange={(e) => setCategory(e.target.value as CampaignType)}
              >
                <option value="">Select category</option>
                {Object.keys(CPL_MAP).map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>

              {/* Thumbnail removed from initial Details step — it's auto-generated at Review */}
            </CardContent>
          </Card>
        )

      case 1:
        return (
          <Card>
            <CardContent className="space-y-4 p-6">
{
                // Video: keep the video link input
                category === "Video" && (
                  <Input
                    placeholder="Paste your video link (e.g. YouTube or hosted URL)"
                    value={videoLink}
                    onChange={(e) => setVideoLink(e.target.value)}
                  />
                )
              }

              {category === "Share my Product" && faceUploading && (
                <div className="mt-3 text-sm text-amber-600">Uploading face image{uploadProgress ? ` — ${uploadProgress}%` : '...'}</div>
              )}
              {category === "Share my Product" && faceImageUrl && (
                <div className="mt-2 text-sm text-stone-600">Face image uploaded and attached to campaign</div>
              )}
              {category === "Share my Product" && (
                <div>
                  <label className="text-sm font-medium text-stone-700 block mb-2">
                    Product Link
                  </label>
                  <Input
                    placeholder="Enter product URL (https://...)"
                    value={productLink}
                    onChange={(e) => setProductLink(e.target.value)}
                  />
                  <p className="text-xs text-stone-500 mt-1">
                    Enter the URL for your product
                  </p>
                </div>
              )}

              {(category === "Survey" || category === "other website tasks" || category === "App Download") && (
                <Input
                  placeholder="Enter link (https://...)"
                  value={externalLink}
                  onChange={(e) => setExternalLink(e.target.value)}
                />
              )}

              {/* For social tasks and simple link-based tasks show a generic task link / handle input */}
              {[
                'Instagram Follow','Instagram Like','Instagram Share',
                'Twitter Follow','Twitter Retweet',
                'Facebook Like','Facebook Share',
                'TikTok Follow','TikTok Like','TikTok Share',
                'YouTube Subscribe','YouTube Like','YouTube Comment',
              ].includes(category as string) && (
                <div>
                  <label className="text-sm font-medium text-stone-700 block mb-2">Task link or social handle</label>
                  <Input
                    placeholder="Enter a link (https://...) or social handle (@username)"
                    value={externalLink}
                    onChange={(e) => setExternalLink(e.target.value)}
                  />
                  <p className="text-xs text-stone-500 mt-1">Provide the URL or handle needed to verify the task.</p>
                </div>
              )}

              {uploadProgress !== null && (
                <div className="mt-3 w-full bg-stone-200 rounded h-2">
                  <div
                    className="h-2 bg-amber-500 rounded"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )

      case 2:
        return (
          <Card>
            <CardContent className="space-y-4 p-6">
              <div>
                <label className="text-sm font-medium text-stone-700">Budget (₦)</label>
                <Input
                  type="number"
                  placeholder="Enter budget in NGN"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value === "" ? "" : Number(e.target.value))}
                />
                <p className="text-xs text-stone-500 mt-1">
                  Cost-per-lead for <b>{category || "selected type"}</b> is ₦{currentCPL}. Estimated leads: <span className="font-semibold">{estimatedLeads}</span>
                </p>
              </div>

              <div className="p-4 bg-amber-50 rounded">
                <div className="flex items-center gap-3">
                  <FileText size={18} />
                  <div>
                    <div className="font-medium">Summary</div>
                    <div className="text-sm text-stone-600">Budget: ₦{numericBudget.toLocaleString() || 0} • Estimated leads: {estimatedLeads}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )

      case 3:
        return (
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-stone-800">
                    {title}
                  </h3>
                  <p className="text-sm text-stone-600">
                    {category} • ₦{numericBudget.toLocaleString() || 0}
                  </p>
                </div>
                <div className="text-right text-xs text-stone-500">
                  <div>Cost per lead: ₦{currentCPL}</div>
                  <div>Estimated leads: {estimatedLeads}</div>
                </div>
              </div>

              {bannerUrl && (
                <div className="w-full max-h-56 overflow-hidden rounded">
                  {bannerUrl.endsWith('.svg') ? (
                    // svg icons served from public/icons — use img for predictable rendering
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={bannerUrl} alt="banner" className="w-full object-cover" />
                  ) : (
                    <Image src={bannerUrl} alt="banner" width={1200} height={400} className="w-full object-cover" />
                  )}
                </div>
              )}

              <div className="text-sm text-stone-700 mt-2">{description}</div>

              {category === "Video" && videoLink && (() => {
  const embed = getEmbeddedVideo(videoLink)
  return embed ? (
    <iframe
      src={embed}
      className="w-full h-60 mt-3 rounded-lg"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  ) : (
    <a
      href={videoLink}
      target="_blank"
      rel="noreferrer"
      className="text-amber-600 underline mt-2 block"
    >
      Watch video
    </a>
  )
})()}

              {(category === "Survey" ||
                category === "other website tasks" ||
                category === "App Download") &&
                externalLink && (
                  <a
                    className="text-amber-600 underline mt-2 block"
                    href={externalLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open link
                  </a>
                )}
              {category === "Share my Product" && productLink && (
                <a
                  className="text-amber-600 underline mt-2 block"
                  href={productLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  View Product
                </a>
              )}

              {/* Product-specific: face verification + address before payment */}
              {category === "Share my Product" && (
                <div className="mt-4 p-4 bg-amber-50 rounded border border-amber-100 space-y-4">
                  <h4 className="font-medium text-stone-800">Advertiser identity verification</h4>
                  <p className="text-sm text-stone-700">Before paying, capture your face using your device camera (upload not allowed) and provide your business address.</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="mb-2">
                        <div className="w-full h-40 bg-stone-100 rounded overflow-hidden relative">
                          {cameraActive ? (
                            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                          ) : faceImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={faceImage} alt="Captured face" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-stone-500">No face captured</div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!cameraActive && !faceImage && (
                          <Button onClick={startCamera} size="sm">Open Camera</Button>
                        )}
                        {cameraActive && (
                          <>
                            <Button onClick={captureFace} size="sm">Capture</Button>
                            <Button variant="outline" onClick={stopCamera} size="sm">Cancel</Button>
                          </>
                        )}
                        {faceImage && (
                          <>
                            <Button onClick={() => { setFaceImage(null); setTimeout(() => startCamera(), 120) }} size="sm">Retake</Button>
                          </>
                        )}
                      </div>

                      <canvas ref={canvasRef} className="hidden" />
                    </div>

                    <div>
                      <h5 className="text-sm font-medium mb-2">Address</h5>
                      <Input placeholder="Street address" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} className="mb-2" />
                      <Input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} className="mb-2" />
                      <Input placeholder="State / Region" value={stateRegion} onChange={(e) => setStateRegion(e.target.value)} className="mb-2" />
                      <p className="text-xs text-stone-500 mt-2">Address is required for product-related campaigns.</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft size={16} /> Back to targeting
                </Button>
                <Button
                  className="bg-amber-600 text-white"
                  onClick={handlePay}
                  disabled={loading || (category === "Share my Product" && faceUploading)}
                >
                  <CreditCard size={16} />{" "}
                  {loading
                    ? "Processing..."
                    : `Pay ₦${numericBudget.toLocaleString() || 0}`}
                </Button>
              </div>
            </CardContent>
          </Card>
        )
    }
  }

  return (
    <div className="px-6 py-10 bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        {StepHeader}

        {showActivatePrompt && (
          <div className="col-span-full bg-amber-50 border border-amber-100 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-stone-800">Account Not Activated</div>
                <div className="text-sm text-stone-600">You must activate your advertiser account (₦2,000) before creating tasks.</div>
              </div>
              <div>
                <Button className="bg-amber-500 text-stone-900" onClick={() => triggerActivationPayment(pendingCampaign)}>Activate Now</Button>
              </div>
            </div>
          </div>
        )}

        {/* stepper */}
        <div className="flex items-center justify-center gap-4">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${
                  i < step
                    ? "bg-green-500 text-white"
                    : i === step
                    ? "bg-amber-500 text-white"
                    : "bg-stone-200 text-stone-600"
                }`}
              >
                {i < step ? "✓" : i + 1}
              </div>
              <div
                className={`text-xs ${
                  i === step ? "text-amber-700 font-medium" : "text-stone-500"
                }`}
              >
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* animated step content */}
        <div>
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* navigation */}
        <div className="flex items-center justify-between">
          <div>
            {step > 0 && (
              <Button
                variant="outline"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                <ArrowLeft size={14} /> Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step < STEPS.length - 1 && (
              <Button
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                disabled={!canGoNext}
                className="bg-amber-600 text-white"
              >
                Next <ArrowRight size={14} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
// removed stray helper

