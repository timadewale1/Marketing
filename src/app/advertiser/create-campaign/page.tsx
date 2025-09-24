"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import Dropzone from "@/components/ui/dropzone"
import { User } from "firebase/auth";
import { auth, storage } from "@/lib/firebase"
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage"
import { toast } from "react-hot-toast"
import imageCompression from "browser-image-compression"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"


type CampaignType =
  | "Video"
  | "Picture"
  | "Third-Party Task"
  | "Survey"
  | "App Download"

type PaystackResponse = { reference: string }

const steps = ["Details", "Upload Media", "Targeting & Budget", "Review & Pay"]

export default function CreateCampaignPage() {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)

  // Form Data
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<CampaignType | "">("")
  const [bannerUrl, setBannerUrl] = useState("")
  const [mediaUrl, setMediaUrl] = useState("")
  const [externalLink, setExternalLink] = useState("")

  const [location, setLocation] = useState("")
  const [ageGroup, setAgeGroup] = useState("")
  const [gender, setGender] = useState("")
  const [interests, setInterests] = useState("")

  const [budget, setBudget] = useState<number>(0)
  const CPL = 200
  const estimatedLeads = budget > 0 ? Math.floor(budget / CPL) : 0

  // Load Paystack script
  useEffect(() => {
    const script = document.createElement("script")
    script.src = "https://js.paystack.co/v1/inline.js"
    script.async = true
    document.body.appendChild(script)
  }, [])

  // File upload handler
  const handleFileUpload = async (file: File, type: "banner" | "media") => {
    try {
      if (file.size > 15 * 1024 * 1024) {
        toast.error("File size must be < 15MB")
        return
      }

      setLoading(true)

      let compressedFile = file
      if (file.type.startsWith("image/")) {
        compressedFile = await imageCompression(file, { maxSizeMB: 1 })
      }

      const storageRef = ref(storage, `${type}s/${Date.now()}-${file.name}`)
      const uploadTask = uploadBytesResumable(storageRef, compressedFile)

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress =
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          setUploadProgress(progress)
        },
        (error) => {
          console.error(error)
          toast.error("Upload failed")
          setLoading(false)
          setUploadProgress(null)
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref)
          if (type === "banner") setBannerUrl(downloadURL)
          if (type === "media") setMediaUrl(downloadURL)
          toast.success(`${type} uploaded successfully`)
          setUploadProgress(null)
          setLoading(false)
        }
      )
    } catch (err) {
      console.error(err)
      toast.error("Upload error")
      setLoading(false)
    }
  }

  // Paystack checkout
  const handlePaystack = () => {
  const user = auth.currentUser
  if (!user || !user.email) {
    toast.error("You must be logged in with a valid email")
    return
  }

interface PaystackOptions {
  key: string;
  email: string;
  amount: number;
  currency: string;
  callback: (response: PaystackResponse) => void;
  onClose: () => void;
}

interface PaystackPopup {
  setup: (options: PaystackOptions) => { openIframe: () => void };
}
const handler = ((window as unknown) as { PaystackPop: PaystackPopup }).PaystackPop.setup({
    key: process.env.NEXT_PUBLIC_PAYSTACK_KEY!,
    email: user.email!,
    amount: budget * 100,
    currency: "NGN",
    callback: (response: PaystackResponse) => {
      // Call an async function instead of making callback async
      verifyPayment(response, user)
    },
    onClose: () => toast.error("Payment cancelled"),
  })

  handler.openIframe()
}

const router = useRouter()

const verifyPayment = async (response: PaystackResponse, user: User) => {
  try {
    const res = await fetch("/api/verify-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference: response.reference,
        campaignData: {
    ownerId: user.uid || '',
          title,
          description,
          category,
          bannerUrl,
          mediaUrl,
          externalLink,
          target: { location, ageGroup, gender, interests },
          budget,
          estimatedLeads,
          costPerLead: CPL,
          paymentRef: response.reference,
          status: "Pending",
        },
      }),
    })

    const data = await res.json()

    if (data.success) {
      toast.success("Campaign submitted for review ✅")
      router.push("/advertiser") // 👈 redirect user back to dashboard
    } else {
      toast.error(data.message || "Payment verification failed ❌")
    }
  } catch (err) {
    console.error(err)
    toast.error("Error verifying payment")
  }
}



  // Validation
  const isStepValid = () => {
    if (step === 0) return title && description && category && bannerUrl
    if (step === 1) {
      if (category === "Video" || category === "Picture") return !!mediaUrl
      if (category === "Survey" || category === "Third-Party Task")
        return !!externalLink
      return true
    }
    if (step === 2)
      return location && ageGroup && gender && interests && budget > 0
    if (step === 3) return true
    return false
  }

  // Step renderer
  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <Card>
            <CardContent className="space-y-4 p-6">
              <Input
                placeholder="Enter campaign title"
                value={title ?? ""}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Textarea
                placeholder="Describe your campaign"
                value={description ?? ""}
                onChange={(e) => setDescription(e.target.value)}
              />
              <select
                value={category ?? ""}
                onChange={(e) =>
                  setCategory(e.target.value as CampaignType)
                }
                className="w-full border rounded p-2 bg-white"
              >
                <option value="">Select campaign category</option>
                <option value="Video">🎥 Video</option>
                <option value="Picture">🖼️ Picture</option>
                <option value="Third-Party Task">🌐 Third-Party Task</option>
                <option value="Survey">📊 Survey</option>
                <option value="App Download">📱 App Download</option>
              </select>
              <Dropzone
  label="Upload campaign cover image (banner) (Max 15MB)"
  accept="image/*"
  previewUrl={bannerUrl}
  onFileSelected={(file) => handleFileUpload(file, "banner")}
/>

              {uploadProgress !== null && (
                <div className="w-full bg-stone-200 rounded h-2 mt-3">
                  <div
                    className="bg-amber-500 h-2 rounded"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )
      case 1:
        return (
          <Card>
            <CardContent className="space-y-4 p-6">
              {category === "Video" && (
                <Dropzone
  label="Upload campaign video (Max 15MB)"
  accept="video/*"
  previewUrl={mediaUrl}
  onFileSelected={(file) => handleFileUpload(file, "media")}
/>

              )}
              {category === "Picture" && (
                <Dropzone
                  label="Upload campaign image"
                  accept="image/*"
                  previewUrl={mediaUrl}
                  onFileSelected={(file) => handleFileUpload(file, "media")}
                />
              )}
              {category === "Survey" && (
                <Input
                  placeholder="Enter survey link"
                  value={externalLink ?? ""}
                  onChange={(e) => setExternalLink(e.target.value)}
                />
              )}
              {category === "Third-Party Task" && (
                <Input
                  placeholder="Enter website/app link"
                  value={externalLink ?? ""}
                  onChange={(e) => setExternalLink(e.target.value)}
                />
              )}
              {uploadProgress !== null && (
                <div className="w-full bg-stone-200 rounded h-2 mt-3">
                  <div
                    className="bg-amber-500 h-2 rounded"
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
              <Input
                placeholder="Enter target location"
                value={location ?? ""}
                onChange={(e) => setLocation(e.target.value)}
              />
              <Input
                placeholder="Enter target age group (e.g. 18-35)"
                value={ageGroup ?? ""}
                onChange={(e) => setAgeGroup(e.target.value)}
              />
              <Input
                placeholder="Enter target gender (Male/Female/All)"
                value={gender ?? ""}
                onChange={(e) => setGender(e.target.value)}
              />
              <Input
                placeholder="Enter interests (comma separated)"
                value={interests ?? ""}
                onChange={(e) => setInterests(e.target.value)}
              />
              <Input
                type="number"
                placeholder="Enter your budget in ₦"
                value={budget || ""}
                onChange={(e) => setBudget(Number(e.target.value))}
              />
              <div className="p-4 bg-amber-50 rounded">
                <p className="font-semibold">Summary</p>
                <p>Budget: ₦{budget}</p>
                <p>Cost per lead: ₦{CPL}</p>
                <p>Estimated leads: {estimatedLeads}</p>
              </div>
            </CardContent>
          </Card>
        )
      case 3:
        return (
          <Card>
            <CardContent className="space-y-4 p-6">
              <h3 className="font-bold text-lg">Review Campaign</h3>
              {bannerUrl && (
                <img
                  src={bannerUrl}
                  alt="Campaign banner"
                  className="rounded-lg w-full max-h-60 object-cover"
                />
              )}
              <div className="mt-4">
                <h4 className="text-xl font-semibold">{title}</h4>
                <p className="text-stone-600">{description}</p>
                <p className="mt-2 text-sm">Category: {category}</p>
                <p className="mt-1 text-sm">Budget: ₦{budget}</p>
                <p className="text-sm">Estimated Leads: {estimatedLeads}</p>
              </div>

              {/* Media/Link Preview */}
              {category === "Video" && mediaUrl && (
                <video
                  src={mediaUrl}
                  controls
                  className="w-full max-h-64 rounded mt-3"
                />
              )}
              {category === "Picture" && mediaUrl && (
                <img
                  src={mediaUrl}
                  alt="Campaign media"
                  className="rounded-lg w-full max-h-64 object-cover mt-3"
                />
              )}
              {category === "Survey" && externalLink && (
                <a
                  href={externalLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-600 underline mt-3 block"
                >
                  View Survey Link
                </a>
              )}
              {category === "Third-Party Task" && externalLink && (
                <a
                  href={externalLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-600 underline mt-3 block"
                >
                  Visit Task Link
                </a>
              )}

              <Button
                className="bg-amber-500 hover:bg-amber-600 text-stone-900 w-full"
                onClick={handlePaystack}
                disabled={loading}
              >
                Pay with Paystack
              </Button>
            </CardContent>
          </Card>
        )
    }
  }

  return (
    <div className="px-6 py-10 space-y-8 bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300 min-h-screen">
      {/* Intro Section */}
      <div className="max-w-3xl mx-auto text-center space-y-2">
        <h1 className="text-3xl font-bold text-stone-800">
          Create Your Campaign
        </h1>
        <p className="text-stone-600">
          Launch campaigns that engage your audience and drive real results.
          Upload media, set your budget, and reach your target audience with ease.
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-center max-w-3xl mx-auto mb-6">
        {steps.map((label, i) => (
          <div key={i} className="flex items-center">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full border-2 text-sm font-semibold
                ${
                  i < step
                    ? "bg-green-500 border-green-500 text-white"
                    : i === step
                    ? "bg-amber-500 border-amber-500 text-white"
                    : "bg-stone-200 border-stone-300 text-stone-500"
                }`}
            >
              {i < step ? "✓" : i + 1}
            </div>
            <div className="ml-2 mr-4 text-sm font-medium">
              <span
                className={`${i === step ? "text-amber-600" : "text-stone-600"}`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`w-12 h-0.5 ${i < step ? "bg-green-500" : "bg-stone-300"}`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content with animation */}
      <div className="max-w-3xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="flex justify-between max-w-3xl mx-auto">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        {step < steps.length - 1 && (
          <Button
            className="bg-amber-500 hover:bg-amber-600 text-stone-900"
            onClick={() => setStep(step + 1)}
            disabled={!isStepValid()}
          >
            Next
          </Button>
        )}
      </div>
    </div>
  )
}
