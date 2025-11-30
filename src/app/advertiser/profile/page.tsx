"use client"

import { useEffect, useState } from "react"
import { auth, db, storage } from "@/lib/firebase"
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "react-hot-toast"
import {
  Loader2,
  Camera,
  Wallet,
  StopCircle,
  PlayCircle,
  Image as ImageIcon,
  ArrowLeft,
  LogOut,
  Edit3,
} from "lucide-react"
import { useRouter } from "next/navigation"

type Advertiser = {
  id: string
  name?: string
  companyName?: string
  email?: string
  phone?: string
  companyBio?: string
  industry?: string
  website?: string
  logo?: string
}

type Campaign = {
  id: string
  title: string
  status: "Active" | "Paused" | "Stopped" | "Deleted" | "Pending"
  budget: number
}

export default function ProfilePage() {
  const router = useRouter()
  const [advertiser, setAdvertiser] = useState<Advertiser | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [campaignStats, setCampaignStats] = useState({
    total: 0,
    active: 0,
    stopped: 0,
  })

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    companyName: "",
    companyBio: "",
    industry: "",
    website: "",
    logo: "",
  })

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAdvertiser(null)
        setLoading(false)
        return
      }

      try {
        // ✅ Fetch advertiser by email instead of userId
        const q = query(collection(db, "advertisers"), where("email", "==", user.email))
        const snap = await getDocs(q)

        if (!snap.empty) {
          const advertiserData = snap.docs[0].data() as Advertiser
          const data = { ...advertiserData, id: snap.docs[0].id }
          setAdvertiser(data)
          setForm({
            name: data.name || "",
            email: data.email || user.email || "",
            phone: data.phone || "",
            companyName: data.companyName || "",
            companyBio: data.companyBio || "",
            industry: data.industry || "",
            website: data.website || "",
            logo: data.logo || "",
          })

          // ✅ Fetch campaign stats for this advertiser
          const cQ = query(collection(db, "campaigns"), where("ownerId", "==", user.uid))
          const cSnap = await getDocs(cQ)
          const campaigns = cSnap.docs.map((d) => d.data() as Campaign)
          const total = campaigns.length
          const active = campaigns.filter((c) => c.status === "Active").length
          const stopped = campaigns.filter((c) => c.status === "Stopped").length
          setCampaignStats({ total, active, stopped })
        } else {
          console.warn("No advertiser profile found for:", user.email)
        }
      } catch (err) {
        console.error("Error loading advertiser:", err)
      } finally {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const tempPreview = URL.createObjectURL(file)
    setPreviewImage(tempPreview)

    try {
      const user = auth.currentUser
      if (!user) return toast.error("Not authenticated")

      const storageRef = ref(storage, `advertisers/${user.uid}/logo.jpg`)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)

      if (advertiser?.id) {
        await updateDoc(doc(db, "advertisers", advertiser.id), { logo: url })
      }

      setForm((prev) => ({ ...prev, logo: url }))
      setPreviewImage(null)
      toast.success("Logo uploaded ✅")
    } catch (err) {
      console.error(err)
      toast.error("Image upload failed")
    }
  }

  const handleUpdate = async () => {
    if (!advertiser?.id) return toast.error("No advertiser profile found.")
    try {
      setUpdating(true)
      await updateDoc(doc(db, "advertisers", advertiser.id), {
        ...form,
      })
      toast.success("Profile updated successfully ✅")
      setEditing(false)
    } catch (err) {
      console.error(err)
      toast.error("Failed to update profile")
    } finally {
      setUpdating(false)
    }
  }

  const handleLogout = async () => {
    try {
      await signOut(auth)
      toast.success("Logged out successfully")
      router.push("/login")
    } catch (err) {
      console.error(err)
      toast.error("Logout failed")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-stone-600">
        <Loader2 className="animate-spin mr-2" /> Loading profile...
      </div>
    )
  }

  return (
    <div className="px-6 py-10 min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
      {/* Back button */}
      <Button
        onClick={() => router.back()}
        className="flex gap-2 mb-6 bg-stone-700 hover:bg-stone-800 text-white"
        size="sm"
      >
        <ArrowLeft size={16} /> Back
      </Button>

      <h1 className="text-2xl font-semibold text-stone-800 mb-6">My Profile</h1>

      {/* Campaign Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          <Card className="p-4 bg-white/90 flex items-center justify-between rounded-xl shadow">
          <div>
            <p className="text-sm text-stone-500">Total Tasks</p>
            <h3 className="text-xl font-bold text-stone-800">{campaignStats.total}</h3>
          </div>
          <Wallet className="text-amber-600" size={22} />
        </Card>
        <Card className="p-4 bg-white/90 flex items-center justify-between rounded-xl shadow">
          <div>
            <p className="text-sm text-stone-500">Active</p>
            <h3 className="text-xl font-bold text-stone-800">{campaignStats.active}</h3>
          </div>
          <PlayCircle className="text-green-600" size={22} />
        </Card>
        <Card className="p-4 bg-white/90 flex items-center justify-between rounded-xl shadow">
          <div>
            <p className="text-sm text-stone-500">Stopped</p>
            <h3 className="text-xl font-bold text-stone-800">{campaignStats.stopped}</h3>
          </div>
          <StopCircle className="text-red-600" size={22} />
        </Card>
      </div>

      {/* Profile Info */}
      <Card className="bg-white/90 p-6 rounded-xl shadow space-y-5 max-w-3xl mx-auto">
        <div className="flex flex-col items-center">
          <div className="relative">
            {form.logo ? (
              <img
                src={previewImage || form.logo}
                alt="Company Logo"
                className="w-28 h-28 rounded-full object-cover border border-stone-300"
              />
            ) : (
              <label className="w-28 h-28 rounded-full border border-dashed border-stone-400 flex flex-col items-center justify-center cursor-pointer bg-stone-50 hover:bg-stone-100">
                <ImageIcon className="text-stone-500 mb-1" size={20} />
                <span className="text-xs text-stone-600">Upload Logo</span>
                <input type="file" accept="image/*" hidden onChange={handleImageUpload} />
              </label>
            )}

            {editing && form.logo && (
              <label className="absolute bottom-0 right-0 bg-amber-500 p-2 rounded-full cursor-pointer">
                <Camera size={16} className="text-white" />
                <input type="file" accept="image/*" hidden onChange={handleImageUpload} />
              </label>
            )}
          </div>
          <h2 className="mt-3 font-semibold text-stone-800 text-lg">
            {form.companyName || "Your Company"}
          </h2>
          <p className="text-sm text-stone-600">{form.industry || "Industry"}</p>
        </div>

        <div className="space-y-3 mt-4">
          <Input
            placeholder="Full Name"
            value={form.name}
            disabled={!editing}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            placeholder="Email"
            type="email"
            value={form.email}
            disabled
          />
          <Input
            placeholder="Phone Number"
            value={form.phone}
            disabled={!editing}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            placeholder="Website"
            value={form.website}
            disabled={!editing}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
          />
          <textarea
            placeholder="Company Bio"
            className="w-full border rounded-md p-2 text-sm text-stone-700"
            rows={4}
            disabled={!editing}
            value={form.companyBio}
            onChange={(e) => setForm({ ...form, companyBio: e.target.value })}
          ></textarea>
        </div>

        {/* Buttons */}
        <div className="flex justify-between gap-3 pt-4">
          {editing ? (
            <>
              <Button
                variant="outline"
                onClick={() => setEditing(false)}
                className="border-stone-300 text-stone-700"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdate}
                disabled={updating}
                className="bg-amber-500 text-stone-900"
              >
                {updating ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" /> Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() => setEditing(true)}
                className="bg-amber-500 text-stone-900 flex-1"
              >
                <Edit3 size={16} />
                Edit Profile
              </Button>
              <Button
                onClick={handleLogout}
                className="bg-red-500 hover:bg-red-600 text-white flex-1"
              >
                <LogOut size={16} className="mr-2" /> Logout
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
