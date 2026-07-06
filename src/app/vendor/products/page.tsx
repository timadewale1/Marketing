"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import Link from "next/link"
import { onAuthStateChanged } from "firebase/auth"
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage"
import { doc, onSnapshot } from "firebase/firestore"
import { ArrowLeft, ImagePlus, Lock, Package, PencilLine, Store, Trash2, UploadCloud, X } from "lucide-react"
import toast from "react-hot-toast"
import { auth, db, storage } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import VendorPulseLoader from "@/components/vendor/VendorPulseLoader"

type Product = {
  id: string
  title: string
  description: string
  price: number
  category: string
  images: string[]
  variations?: string[]
  contactMethod: string
  contactDetails: string
  shopLink: string
  status: string
  visibleOnMarketplace: boolean
}

type VendorProfileSummary = {
  vendorVerificationStatus?: string
  vendorPaymentStatus?: string
  monthlyRentStatus?: string
  monthlyRentDueAt?: { seconds?: number }
}

function toMillis(value: unknown) {
  if (!value || typeof value !== "object" || !("seconds" in value)) return 0
  return Number((value as { seconds?: number }).seconds || 0) * 1000
}

export default function VendorProductsPage() {
  const [userId, setUserId] = useState<string | null>(auth.currentUser?.uid ?? null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [editingImages, setEditingImages] = useState<string[]>([])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("")
  const [category, setCategory] = useState("")
  const [shopLink, setShopLink] = useState("")
  const [contactMethod, setContactMethod] = useState("whatsapp")
  const [contactDetails, setContactDetails] = useState("")
  const [variations, setVariations] = useState("")
  const [files, setFiles] = useState<FileList | null>(null)
  const [lockedReason, setLockedReason] = useState("")
  const [profile, setProfile] = useState<VendorProfileSummary | null>(null)

  const canPublish = useMemo(() => title.trim() && description.trim() && Number(price) > 0, [title, description, price])

  const loadProfile = async (idToken: string) => {
    const res = await fetch("/api/vendor/profile", {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) throw new Error(data.message || "Failed to load profile")
    setProfile(data.profile || null)
  }

  const loadProducts = async (idToken: string) => {
    const res = await fetch("/api/vendor/products", {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    const data = await res.json().catch(() => ({}))
    if (res.status === 403) {
      setLockedReason(String(data.message || "Your store is not yet eligible to publish products."))
      setProducts([])
      return
    }
    if (!res.ok || !data.success) throw new Error(data.message || "Failed to load vendor products")
    setLockedReason("")
    setProducts(Array.isArray(data.products) ? data.products : [])
  }

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsubscribeProfile?.()
      unsubscribeProfile = null
      setUserId(user?.uid ?? null)
      if (!user) {
        setProducts([])
        setLoading(false)
        return
      }
      try {
        const idToken = await user.getIdToken()
        unsubscribeProfile = onSnapshot(doc(db, "vendors", user.uid), (snap) => {
          if (!snap.exists()) return
          const nextProfile = snap.data() as VendorProfileSummary
          setProfile(nextProfile)
          const setupPaid = String(nextProfile.vendorPaymentStatus || "").toLowerCase() === "paid"
          const verified = String(nextProfile.vendorVerificationStatus || "").toLowerCase() === "verified" || String(nextProfile.vendorVerificationStatus || "").toLowerCase() === "approved"
          const rentDue = setupPaid && toMillis(nextProfile.monthlyRentDueAt) > 0 && Date.now() >= toMillis(nextProfile.monthlyRentDueAt)
          const canPublishNow = verified && setupPaid && !rentDue
          if (canPublishNow) {
            void loadProducts(idToken).catch((error) => console.error("Failed to refresh products after vendor update", error))
          }
        })
        await Promise.all([loadProfile(idToken), loadProducts(idToken)])
      } catch (error) {
        console.error(error)
        toast.error("Could not load products")
      } finally {
        setLoading(false)
      }
    })
    return () => {
      unsubscribeProfile?.()
      unsub()
    }
  }, [])

  const resetForm = () => {
    setEditingProductId(null)
    setEditingImages([])
    setTitle("")
    setDescription("")
    setPrice("")
    setCategory("")
    setShopLink("")
    setContactMethod("whatsapp")
    setContactDetails("")
    setVariations("")
    setFiles(null)
  }

  const beginEdit = (product: Product) => {
    if (lockedReason) return
    setEditingProductId(product.id)
    setEditingImages(product.images || [])
    setTitle(product.title)
    setDescription(product.description)
    setPrice(String(product.price))
    setCategory(product.category || "")
    setShopLink(product.shopLink || "")
    setContactMethod(product.contactMethod || "whatsapp")
    setContactDetails(product.contactDetails || "")
    setVariations((product.variations || []).join(", "))
    setFiles(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const removeEditingImage = (url: string) => {
    setEditingImages((current) => current.filter((entry) => entry !== url))
  }

  const uploadImages = async (uid: string) => {
    if (!files || files.length === 0) return [] as string[]
    setUploading(true)
    try {
      const results: string[] = []
      for (const file of Array.from(files).slice(0, 6)) {
        const safe = file.name.replace(/[^a-zA-Z0-9_.-]/g, "-")
        const storageRef = ref(storage, `vendorProducts/${uid}/${Date.now()}-${safe}`)
        await new Promise<void>((resolve, reject) => {
          const task = uploadBytesResumable(storageRef, file)
          task.on("state_changed", undefined, reject, async () => {
            results.push(await getDownloadURL(task.snapshot.ref))
            resolve()
          })
        })
      }
      return results
    } finally {
      setUploading(false)
    }
  }

  const deleteProduct = async (productId: string) => {
    if (!auth.currentUser || lockedReason) return
    if (!confirm("Delete this product?")) return
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch(`/api/vendor/products/${productId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.message || "Could not delete product")
      toast.success("Product deleted")
      await loadProducts(idToken)
      if (editingProductId === productId) resetForm()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Could not delete product")
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!auth.currentUser || lockedReason) return
    setSaving(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const newImages = await uploadImages(auth.currentUser.uid)
      const images = [...editingImages, ...newImages]

      const res = await fetch(editingProductId ? `/api/vendor/products/${editingProductId}` : "/api/vendor/products", {
        method: editingProductId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          title,
          description,
          price: Number(price),
          category,
          shopLink,
          contactMethod,
          contactDetails,
          images,
          variations: variations.split(",").map((value) => value.trim()).filter(Boolean),
          status: editingProductId ? "active" : undefined,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.message || "Could not save product")

      toast.success(editingProductId ? "Product updated" : "Product published")
      resetForm()
      await loadProducts(idToken)
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Could not save product")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <VendorPulseLoader label="Loading your products..." />

  if (!userId) {
    return (
      <Card className="rounded-3xl border-dashed border-stone-300 bg-white">
        <CardContent className="p-8 text-center">
          <Store className="mx-auto h-10 w-10 text-cyan-600" />
          <h1 className="mt-4 text-2xl font-semibold text-stone-900">Vendor products</h1>
          <p className="mt-2 text-stone-600">Sign in as a vendor to publish products.</p>
          <Button asChild className="mt-6 rounded-full bg-cyan-700 hover:bg-cyan-600">
            <Link href="/auth/sign-in">Sign in</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const setupPaid = String(profile?.vendorPaymentStatus || "").toLowerCase() === "paid"
  const verificationStatus = String(profile?.vendorVerificationStatus || "").toLowerCase()
  const isVerified = verificationStatus === "verified" || verificationStatus === "approved"
  const rentDue = setupPaid && toMillis(profile?.monthlyRentDueAt) > 0 && Date.now() >= toMillis(profile?.monthlyRentDueAt)
  const isLocked = Boolean(lockedReason || !isVerified || !setupPaid || rentDue)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/vendor">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
        <Badge className="rounded-full border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-700">
          {products.length} products
        </Badge>
      </div>

      {isLocked ? (
        <Card className="rounded-3xl border-amber-200 bg-amber-50/70">
          <CardContent className="p-6">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-amber-900">
              <Lock className="h-4 w-4" />
              Product publishing is currently locked.
            </p>
            <p className="mt-2 text-sm text-amber-900">
              {lockedReason || "Your account must be verified and setup fee completed before listing products."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="rounded-[28px] border-cyan-100 bg-white shadow-[0_24px_80px_-55px_rgba(8,145,178,0.35)]">
        <CardContent className="p-6 md:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-700">
            <Package className="h-4 w-4" />
            {editingProductId ? "Edit product" : "Publish product"}
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-stone-900">
            {editingProductId ? "Update your product" : "Add a product to your store"}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
            Add your product details and how customers should contact you to buy.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 grid gap-4 md:grid-cols-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Product title" className="rounded-2xl" disabled={isLocked} />
            <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price (₦)" type="number" className="rounded-2xl" disabled={isLocked} />
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className="rounded-2xl" disabled={isLocked} />
            <Input value={shopLink} onChange={(e) => setShopLink(e.target.value)} placeholder="Contact link for this product" className="rounded-2xl" disabled={isLocked} />
            <Input value={contactMethod} onChange={(e) => setContactMethod(e.target.value)} placeholder="Contact method (e.g. WhatsApp)" className="rounded-2xl" disabled={isLocked} />
            <Input value={contactDetails} onChange={(e) => setContactDetails(e.target.value)} placeholder="Contact details (number/username)" className="rounded-2xl" disabled={isLocked} />
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Product description" className="min-h-[140px] rounded-2xl md:col-span-2" disabled={isLocked} />
            <Input value={variations} onChange={(e) => setVariations(e.target.value)} placeholder="Variations (comma separated)" className="rounded-2xl md:col-span-2" disabled={isLocked} />

            {editingImages.length > 0 ? (
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 md:col-span-2">
                <p className="text-sm font-medium text-stone-900">Saved images</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {editingImages.map((url) => (
                    <div key={url} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="Uploaded product" className="h-20 w-20 rounded-xl object-cover ring-1 ring-stone-200" />
                      {!isLocked ? (
                        <button
                          type="button"
                          onClick={() => removeEditingImage(url)}
                          className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white shadow"
                          aria-label="Remove saved image"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <label className={`md:col-span-2 flex cursor-pointer flex-col gap-2 rounded-2xl border border-dashed p-4 text-sm ${isLocked ? "border-stone-200 bg-stone-100 text-stone-500" : "border-cyan-200 bg-cyan-50/50 text-stone-600"}`}>
              <span className="inline-flex items-center gap-2 font-medium text-stone-900">
                <ImagePlus className="h-4 w-4 text-cyan-600" />
                Upload product photos
              </span>
              <span>Pick one or more images for your listing.</span>
              <input type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)} className="hidden" disabled={isLocked} />
            </label>

            <div className="md:col-span-2 flex flex-wrap gap-3">
              <Button type="submit" disabled={!canPublish || saving || uploading || isLocked} className="rounded-full bg-cyan-700 hover:bg-cyan-600">
                <UploadCloud className="mr-2 h-4 w-4" />
                {saving || uploading ? "Saving..." : editingProductId ? "Save changes" : "Publish product"}
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/vendor">Back to dashboard</Link>
              </Button>
              {editingProductId ? (
                <Button type="button" variant="outline" onClick={resetForm} className="rounded-full" disabled={isLocked}>
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => (
          <Card key={product.id} className="rounded-[24px] border-stone-200 bg-white">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-stone-500">{product.category || "General"}</p>
                  <h2 className="mt-1 text-xl font-semibold text-stone-900">{product.title}</h2>
                </div>
                <Badge className={product.visibleOnMarketplace ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"}>
                  {product.status}
                </Badge>
              </div>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-stone-600">{product.description}</p>
              <p className="mt-3 text-lg font-semibold text-stone-900">₦{Number(product.price).toLocaleString()}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {product.images.slice(0, 3).map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt={product.title} className="h-16 w-16 rounded-xl object-cover" />
                ))}
              </div>
              <div className="mt-4 text-sm text-stone-600">
                <p><span className="font-medium text-stone-900">Contact:</span> {product.contactMethod} {product.contactDetails}</p>
                <p className="mt-1 break-all"><span className="font-medium text-stone-900">Link:</span> {product.shopLink || "Not set"}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => beginEdit(product)} disabled={isLocked}>
                  <PencilLine className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50"
                  onClick={() => void deleteProduct(product.id)}
                  disabled={isLocked}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {products.length === 0 ? (
          <Card className="rounded-[24px] border-dashed border-stone-300 bg-white/70">
            <CardContent className="p-8 text-center">
              <Package className="mx-auto h-10 w-10 text-cyan-500" />
              <h3 className="mt-4 text-xl font-semibold text-stone-900">No products yet</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Publish your first product after your store is fully eligible.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
