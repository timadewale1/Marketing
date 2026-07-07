"use client"

import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { onAuthStateChanged } from "firebase/auth"
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage"
import { auth, storage } from "@/lib/firebase"
import VendorPulseLoader from "@/components/vendor/VendorPulseLoader"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ImageIcon, LayoutGrid, Palette, Store } from "lucide-react"
import toast from "react-hot-toast"

type VendorProfile = {
  name?: string
  email?: string
  vendorVerificationStatus?: string
  vendorPaymentStatus?: string
  storefrontLink?: string
  storefrontSlug?: string
  storeCoverUrl?: string
  shopLayout?: string
  shopTheme?: string
}

export default function VendorSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [profile, setProfile] = useState<VendorProfile | null>(null)
  const [storefrontLink, setStorefrontLink] = useState("")
  const [storefrontSlug, setStorefrontSlug] = useState("")
  const [storeCoverUrl, setStoreCoverUrl] = useState("")
  const [shopLayout, setShopLayout] = useState("cards")
  const [shopTheme, setShopTheme] = useState("classic")

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setProfile(null)
        setLoading(false)
        return
      }
      try {
        const idToken = await user.getIdToken()
        const res = await fetch("/api/vendor/profile", { headers: { Authorization: `Bearer ${idToken}` } })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.success) throw new Error(data.message || "Failed to load vendor profile")
        const nextProfile = (data.profile || {}) as VendorProfile
        setProfile(nextProfile)
        setStorefrontLink(String(nextProfile.storefrontLink || ""))
        setStorefrontSlug(String(nextProfile.storefrontSlug || ""))
        setStoreCoverUrl(String(nextProfile.storeCoverUrl || ""))
        setShopLayout(String(nextProfile.shopLayout || "cards"))
        setShopTheme(String(nextProfile.shopTheme || "classic"))
      } catch (error) {
        console.error(error)
        toast.error("Could not load shop settings")
      } finally {
        setLoading(false)
      }
    })
    return () => unsub()
  }, [])

  const uploadCover = async (file: File) => {
    if (!auth.currentUser) return
    setUploadingCover(true)
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "-")
      const storageRef = ref(storage, `vendorShopCovers/${auth.currentUser.uid}/${Date.now()}-${safeName}`)
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, file)
        task.on("state_changed", undefined, reject, () => resolve())
      })
      const url = await getDownloadURL(storageRef)
      setStoreCoverUrl(url)
      toast.success("Cover image uploaded")
    } catch (error) {
      console.error(error)
      toast.error("Could not upload cover image")
    } finally {
      setUploadingCover(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!auth.currentUser) return
    setSaving(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch("/api/vendor/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          updateType: "storefront",
          storefrontLink,
          storefrontSlug,
          storeCoverUrl,
          shopLayout,
          shopTheme,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.message || "Could not save shop settings")
      toast.success("Shop settings updated")
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Could not save shop settings")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <VendorPulseLoader label="Loading shop settings..." />

  if (!auth.currentUser) {
    return (
      <Card className="rounded-3xl border-dashed border-stone-300 bg-white">
        <CardContent className="p-8 text-center">
          <Store className="mx-auto h-10 w-10 text-cyan-600" />
          <h1 className="mt-4 text-2xl font-semibold text-stone-900">Shop settings</h1>
          <p className="mt-2 text-stone-600">Please sign in to update your shop settings.</p>
          <Button asChild className="mt-6 rounded-full bg-cyan-700 hover:bg-cyan-600">
            <Link href="/auth/sign-in">Sign in</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-700">Vendor settings</p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-900">Edit your shop settings</h1>
        </div>
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/vendor/profile">Back to profile</Link>
        </Button>
      </div>

      <Card className="rounded-[28px] border-cyan-100 bg-white shadow-[0_24px_80px_-55px_rgba(8,145,178,0.35)]">
        <CardContent className="p-6 md:p-8">
          <p className="text-sm text-stone-600">
            Use this page to change the shop link, public slug, storefront cover image, layout, and shop mood shown on the marketplace.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Input required value={storefrontLink} onChange={(e) => setStorefrontLink(e.target.value)} placeholder="Your shop contact link" />
              <p className="text-xs text-stone-500">This is the link customers open to contact you about your shop.</p>
            </div>
            <div className="space-y-1">
              <Input required value={storefrontSlug} onChange={(e) => setStorefrontSlug(e.target.value)} placeholder="Your public shop name" />
              <p className="text-xs text-stone-500">This becomes your public shop link inside the marketplace.</p>
            </div>

            <div className="md:col-span-2 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm font-medium text-stone-900">Store cover image</p>
              <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-center">
                <div className="h-32 w-full max-w-sm overflow-hidden rounded-2xl border border-stone-200 bg-white">
                  {storeCoverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={storeCoverUrl} alt="Store cover" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-stone-500">No cover uploaded yet</div>
                  )}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-medium text-cyan-700">
                  <ImageIcon className="h-4 w-4" />
                  {uploadingCover ? "Uploading..." : "Upload cover"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && void uploadCover(e.target.files[0])}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-stone-900">
                <LayoutGrid className="h-4 w-4 text-cyan-700" />
                Layout
              </div>
              <div className="mt-3 grid gap-2">
                {["cards", "spotlight"].map((layout) => (
                  <button
                    key={layout}
                    type="button"
                    onClick={() => setShopLayout(layout)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm capitalize ${
                      shopLayout === layout ? "border-cyan-300 bg-cyan-50 text-cyan-700" : "border-stone-200 bg-white text-stone-700"
                    }`}
                  >
                    {layout}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-stone-900">
                <Palette className="h-4 w-4 text-cyan-700" />
                Shop mood
              </div>
              <div className="mt-3 grid gap-2">
                {["classic", "ocean", "sunset"].map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    onClick={() => setShopTheme(theme)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm capitalize ${
                      shopTheme === theme ? "border-cyan-300 bg-cyan-50 text-cyan-700" : "border-stone-200 bg-white text-stone-700"
                    }`}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-2 flex flex-wrap gap-3">
              <Button type="submit" disabled={saving} className="rounded-full bg-cyan-700 hover:bg-cyan-600">
                {saving ? "Saving..." : "Save shop settings"}
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link href={`/marketplace/shop/${storefrontSlug || profile?.storefrontSlug || ""}`}>Open public shop</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
