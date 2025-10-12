"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import Dropzone from "@/components/ui/dropzone"
import { auth, storage } from "@/lib/firebase"
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage"
import { serverTimestamp } from "firebase/firestore"

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
  | "Picture"
  | "Third-Party Task"
  | "Survey"
  | "App Download"

const STEPS = ["Details", "Upload Media", "Targeting & Budget", "Review & Pay"] as const

// Different CPL values per category
const CPL_MAP: Record<CampaignType, number> = {
  Video: 500,
  Picture: 300,
  "Third-Party Task": 150,
  Survey: 200,
  "App Download": 400,
}

export default function CreateCampaignPage() {
  const router = useRouter()

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


  const [location, setLocation] = useState("")
  const [ageGroup, setAgeGroup] = useState("")
  const [gender, setGender] = useState<"Male" | "Female" | "All" | "">("")
  const [interests, setInterests] = useState("")

  const [budget, setBudget] = useState<number | "">("")

  // derived values
  const numericBudget = typeof budget === "number" ? budget : Number(budget || 0)
  const currentCPL = category ? CPL_MAP[category as CampaignType] : 200
  const estimatedLeads =
    numericBudget > 0 ? Math.floor(numericBudget / currentCPL) : 0

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
    } catch (err) {
      console.warn("Image compression failed:", err)
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

  // handle Dropzone file
  const handleFileSelected = async (file: File, type: "banner" | "media") => {
    const MAX_MB = 15
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`File must be less than ${MAX_MB}MB`)
      return
    }

    setLoading(true)
    try {
      let toUpload = file

      if (file.type.startsWith("image/")) {
        toUpload = await compressImage(file)
      }

      const filename = `${type}s/${Date.now()}-${file.name.replace(
        /\s+/g,
        "_"
      )}`
      uploadFile(toUpload, filename, (url) => {
        if (type === "banner") {
          setBannerUrl(url)
          toast.success("Banner uploaded")
        } else {
          setMediaUrl(url)
          toast.success("Media uploaded")
        }
      })
    } catch (err) {
      console.error(err)
      toast.error("Upload error")
      setLoading(false)
      setUploadProgress(null)
    }
  }

  // Step validation
  const isStepValid = () => {
    if (step === 0)
      return (
        title.trim().length >= 3 &&
        description.trim().length >= 10 &&
        category &&
        bannerUrl
      )
    if (step === 1) {
      if (category === "Video") return videoLink.trim().length > 5 // ✅ use link
      if (category === "Picture") return !!mediaUrl
      if (["Survey", "Third-Party Task", "App Download"].includes(category))
        return externalLink.trim().length > 5
      return true
    }
    if (step === 2)
      return (
        location.trim().length > 1 &&
        ageGroup.trim().length > 1 &&
        gender !== "" &&
        interests.trim().length > 1 &&
        numericBudget > 0
      )
    if (step === 3) return true
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
        toast.success("Payment confirmed — campaign submitted for review")
        router.push("/advertiser")
      } else {
        toast.error(data?.message || "Payment verification failed")
      }
    } catch (err) {
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

    if (!process.env.NEXT_PUBLIC_PAYSTACK_KEY) {
      toast.error("Paystack key not configured")
      return
    }

    if (!isStepValid()) {
      toast.error("Please complete all required fields")
      return
    }

const campaignData: Record<string, unknown> = {
      ownerId: user.uid,
      title: title.trim(),
      description: description.trim(),
      category,
      bannerUrl,
      mediaUrl: category === "Video" ? videoLink : mediaUrl, // ✅ use link
      externalLink: externalLink || "",
      target: { location, ageGroup, gender, interests },
      budget: numericBudget,
      estimatedLeads,
      costPerLead: currentCPL,
      status: "Active",
createdAt: serverTimestamp(),
    }

    try {
      const paystackLib = (window as unknown as { PaystackPop?: PaystackPopInterface }).PaystackPop;
      if (!paystackLib || typeof paystackLib.setup !== "function") {
        toast.error("Payment library not ready — try again shortly")
        return
      }

// Define PaystackPop interface outside component
interface PaystackPopInterface {
  setup: (config: Record<string, unknown>) => { openIframe: () => void };
}

const handler = paystackLib.setup({
        key: process.env.NEXT_PUBLIC_PAYSTACK_KEY,
        email: user.email,
        amount: numericBudget * 100,
        currency: "NGN",
        label: `Campaign payment: ${title}`,
        onClose: () => toast.error("Payment canceled"),
        callback: (resp: { reference: string }) => {
          verifyPayment(resp.reference, campaignData)
        }
      })

      handler.openIframe()
    } catch (err) {
      console.error("Payment error:", err)
      toast.error("Payment initiation failed")
    }
  }

  // helpers
  const canGoNext = isStepValid()

  const StepHeader = useMemo(
    () => (
      <div className="max-w-3xl mx-auto text-center space-y-2">
        {/* Back button */}
              <Button
                onClick={() => router.back()}
                className="flex gap-2 mb-4 bg-stone-700 hover:bg-stone-800 text-white"
                size="sm"
              >
                <ArrowLeft size={16} /> Back
              </Button>
        <h1 className="text-2xl md:text-3xl font-bold text-stone-800">
          Create a Campaign
        </h1>
        <p className="text-sm text-stone-600">
          Fill in the details. You will only pay & submit after review.
        </p>
      </div>
    ),
    []
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
                Campaign title
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
                <option value="Video">🎥 Video</option>
                <option value="Picture">🖼️ Picture</option>
                <option value="Third-Party Task">🌐 Third-Party Task</option>
                <option value="Survey">📊 Survey</option>
                <option value="App Download">📱 App Download</option>
              </select>

              <div>
                <label className="text-sm font-medium text-stone-700 block mb-2">
                  Campaign cover image (banner) — required
                </label>
                <Dropzone
                  label="Drop or choose image (max 15MB)"
                  accept="image/*"
                  previewUrl={bannerUrl}
                  onFileSelected={(f) => handleFileSelected(f, "banner")}
                />
                {uploadProgress !== null && (
                  <div className="mt-3 w-full bg-stone-200 rounded h-2">
                    <div
                      className="h-2 bg-amber-500 rounded"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )

      case 1:
        return (
          <Card>
            <CardContent className="space-y-4 p-6">
{category === "Video" && (
                <Input
                  placeholder="Paste your video link (e.g. YouTube or hosted URL)"
                  value={videoLink}
                  onChange={(e) => setVideoLink(e.target.value)}
                />
              )}
              {category === "Picture" && (
                <Dropzone
                  label="Upload image"
                  accept="image/*"
                  previewUrl={mediaUrl}
                  onFileSelected={(f) => handleFileSelected(f, "media")}
                />
              )}
              {(category === "Survey" ||
                category === "Third-Party Task" ||
                category === "App Download") && (
                <Input
                  placeholder="Enter link (https://...)"
                  value={externalLink}
                  onChange={(e) => setExternalLink(e.target.value)}
                />
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-stone-700">
                    Location
                  </label>
                  <Input
                    placeholder="e.g. Lagos, Nigeria"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-stone-700">
                    Age group
                  </label>
                  <Input
                    placeholder="e.g. 18-35"
                    value={ageGroup}
                    onChange={(e) => setAgeGroup(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-stone-700">
                    Gender
                  </label>
                  <select
                    className="w-full border rounded px-3 py-2 bg-white"
                    value={gender}
onChange={(e) => setGender(e.target.value as "Male" | "Female" | "All" | "")}
                  >
                    <option value="">Select</option>
                    <option value="All">All</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-stone-700">
                    Interests
                  </label>
                  <Input
                    placeholder="Comma separated"
                    value={interests}
                    onChange={(e) => setInterests(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-stone-700">
                  Budget (₦)
                </label>
                <Input
                  type="number"
                  placeholder="Enter budget in NGN"
                  value={budget}
                  onChange={(e) =>
                    setBudget(e.target.value === "" ? "" : Number(e.target.value))
                  }
                />
                <p className="text-xs text-stone-500 mt-1">
                  Cost-per-lead for <b>{category || "selected type"}</b> is ₦
                  {currentCPL}. Estimated leads:{" "}
                  <span className="font-semibold">{estimatedLeads}</span>
                </p>
              </div>

              <div className="p-4 bg-amber-50 rounded">
                <div className="flex items-center gap-3">
                  <FileText size={18} />
                  <div>
                    <div className="font-medium">Summary</div>
                    <div className="text-sm text-stone-600">
                      Budget: ₦{numericBudget.toLocaleString() || 0} • Estimated
                      leads: {estimatedLeads}
                    </div>
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
                <img
                  src={bannerUrl}
                  alt="banner"
                  className="w-full max-h-56 object-cover rounded"
                />
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

              {category === "Picture" && mediaUrl && (
                <img
                  src={mediaUrl}
                  alt="media"
                  className="w-full mt-3 rounded object-cover"
                />
              )}
              {(category === "Survey" ||
                category === "Third-Party Task" ||
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

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft size={16} /> Back to targeting
                </Button>
                <Button
                  className="bg-amber-600 text-white"
                  onClick={handlePay}
                  disabled={loading}
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
