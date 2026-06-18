"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import Link from "next/link"
import { onAuthStateChanged } from "firebase/auth"
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage"
import { auth, storage } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, ImagePlus, Package, Plus, Store, UploadCloud } from "lucide-react"
import toast from "react-hot-toast"

type Product = {
  id: string
  title: string
  description: string
  price: number
  category: string
  images: string[]
  contactMethod: string
  contactDetails: string
  shopLink: string
  status: string
  visibleOnMarketplace: boolean
}

export default function VendorProductsPage() {
  const [userId, setUserId] = useState<string | null>(auth.currentUser?.uid ?? null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("")
  const [category, setCategory] = useState("")
  const [shopLink, setShopLink] = useState("")
  const [contactMethod, setContactMethod] = useState("whatsapp")
  const [contactDetails, setContactDetails] = useState("")
  const [variations, setVariations] = useState("")
  const [files, setFiles] = useState<FileList | null>(null)
  const [uploading, setUploading] = useState(false)

  const canPublish = useMemo(() => title.trim() && description.trim() && Number(price) > 0, [title, description, price])

  const loadProducts = async (idToken: string) => {
    const res = await fetch("/api/vendor/products", {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      throw new Error(data.message || "Could not load products")
    }
    setProducts(Array.isArray(data.products) ? data.products : [])
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setUserId(user?.uid ?? null)
      if (!user) {
        setProducts([])
        setLoading(false)
        return
      }
      try {
        const idToken = await user.getIdToken()
        await loadProducts(idToken)
      } catch (error) {
        console.error(error)
        toast.error("Could not load your products")
      } finally {
        setLoading(false)
      }
    })
    return () => unsub()
  }, [])

  const uploadImages = async (uid: string) => {
    if (!files || files.length === 0) return [] as string[]
    setUploading(true)
    try {
      const results: string[] = []
      for (const file of Array.from(files).slice(0, 6)) {
        const storageRef = ref(storage, `vendorProducts/${uid}/${Date.now()}-${file.name}`)
        await new Promise<void>((resolve, reject) => {
          const task = uploadBytesResumable(storageRef, file)
          task.on(
            "state_changed",
            undefined,
            reject,
            async () => {
              const url = await getDownloadURL(task.snapshot.ref)
              results.push(url)
              resolve()
            }
          )
        })
      }
      return results
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!auth.currentUser) return
    setSaving(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const images = await uploadImages(auth.currentUser.uid)

      const res = await fetch("/api/vendor/products", {
        method: "POST",
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
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Could not save product")
      }

      toast.success("Product saved")
      setTitle("")
      setDescription("")
      setPrice("")
      setCategory("")
      setShopLink("")
      setContactDetails("")
      setVariations("")
      setFiles(null)
      await loadProducts(idToken)
    } catch (error) {
      console.error("Vendor product save error", error)
      toast.error(error instanceof Error ? error.message : "Could not save product")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-stone-50 p-6 text-stone-500">Loading products...</div>
  }

  if (!userId) {
    return (
      <div className="min-h-screen bg-stone-50 p-6">
        <Card className="mx-auto max-w-3xl rounded-3xl">
          <CardContent className="p-8 text-center">
            <Store className="mx-auto h-10 w-10 text-amber-500" />
            <h1 className="mt-4 text-2xl font-semibold text-stone-900">Vendor products</h1>
            <p className="mt-2 text-stone-600">Sign in as a vendor to publish your products.</p>
            <Button asChild className="mt-6 rounded-full">
              <Link href="/auth/sign-in">Sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fffdf8_0%,#faf5ea_100%)] p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/vendor">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to dashboard
            </Link>
          </Button>
          <Badge className="rounded-full border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
            {products.length} products
          </Badge>
        </div>

        <Card className="rounded-[28px] border-amber-100 bg-white/90 shadow-[0_24px_80px_-55px_rgba(120,53,15,0.35)]">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-700">
                  <Package className="h-4 w-4" />
                  Publish product
                </div>
                <h1 className="mt-3 text-3xl font-semibold text-stone-900">Add a product to your Pamba shop</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
                  Upload images, set your price, add your contact details, and share a storefront link buyers can copy.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 grid gap-4 md:grid-cols-2">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Product title" className="rounded-2xl" />
              <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" type="number" className="rounded-2xl" />
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className="rounded-2xl" />
              <Input value={shopLink} onChange={(e) => setShopLink(e.target.value)} placeholder="Shop link" className="rounded-2xl" />
              <Input value={contactMethod} onChange={(e) => setContactMethod(e.target.value)} placeholder="Contact method" className="rounded-2xl" />
              <Input value={contactDetails} onChange={(e) => setContactDetails(e.target.value)} placeholder="Contact details" className="rounded-2xl" />
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Product description" className="rounded-2xl md:col-span-2 min-h-[140px]" />
              <Input value={variations} onChange={(e) => setVariations(e.target.value)} placeholder="Variations, separated by commas" className="rounded-2xl md:col-span-2" />
              <label className="md:col-span-2 flex cursor-pointer flex-col gap-2 rounded-2xl border border-dashed border-amber-200 bg-amber-50/60 p-4 text-sm text-stone-600">
                <span className="inline-flex items-center gap-2 font-medium text-stone-900">
                  <ImagePlus className="h-4 w-4 text-amber-600" />
                  Upload product photos
                </span>
                <span>Pick one or more images for your listing.</span>
                <input type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)} className="hidden" />
              </label>

              <div className="md:col-span-2 flex flex-wrap gap-3">
                <Button type="submit" disabled={!canPublish || saving || uploading} className="rounded-full">
                  <UploadCloud className="mr-2 h-4 w-4" />
                  {saving || uploading ? "Publishing..." : "Publish product"}
                </Button>
                <Button asChild variant="outline" className="rounded-full">
                  <Link href="/marketplace">Preview marketplace</Link>
                </Button>
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
                <p className="mt-3 text-sm leading-6 text-stone-600 line-clamp-3">{product.description}</p>
                <p className="mt-3 text-lg font-semibold text-stone-900">₦{Number(product.price).toLocaleString()}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {product.images.slice(0, 3).map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={url} src={url} alt={product.title} className="h-16 w-16 rounded-xl object-cover" />
                  ))}
                </div>
                <div className="mt-4 text-sm text-stone-600">
                  <p><span className="font-medium text-stone-900">Contact:</span> {product.contactMethod} {product.contactDetails}</p>
                  <p className="mt-1 break-all"><span className="font-medium text-stone-900">Shop:</span> {product.shopLink || "Not set"}</p>
                </div>
              </CardContent>
            </Card>
          ))}

          {products.length === 0 ? (
            <Card className="rounded-[24px] border-dashed border-stone-300 bg-white/70">
              <CardContent className="p-8 text-center">
                <Package className="mx-auto h-10 w-10 text-amber-500" />
                <h3 className="mt-4 text-xl font-semibold text-stone-900">No products yet</h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Publish your first product to start building your storefront and marketplace presence.
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}
