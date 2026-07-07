"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { onAuthStateChanged } from "firebase/auth"
import { Store, Plus } from "lucide-react"
import { auth } from "@/lib/firebase"

type VendorStorePayload = {
  success: boolean
  vendor?: {
    id: string
    name: string
    email: string
    storefrontLink: string
    storefrontSlug: string
    storeCoverUrl: string
    shopTheme: string
    shopLayout: string
    city: string
    state: string
  }
  products?: Array<{
    id: string
    title: string
    description: string
    price: number
    category: string
    images: string[]
    shopLink: string
  }>
  message?: string
}

export default function VendorShopPreviewPage() {
  const params = useParams<{ slug: string }>()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<VendorStorePayload | null>(null)
  const [isOwnVendor, setIsOwnVendor] = useState(false)

  useEffect(() => {
    const slug = String(params?.slug || "")
    if (!slug) {
      setLoading(false)
      return
    }

    fetch(`/api/marketplace/shop/${slug}`, { cache: "no-store" })
      .then(async (res) => {
        const payload = (await res.json().catch(() => ({}))) as VendorStorePayload
        setData(payload)
      })
      .finally(() => setLoading(false))
  }, [params])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsOwnVendor(Boolean(user && data?.vendor?.id && user.uid === data.vendor.id))
    })
    return () => unsub()
  }, [data?.vendor?.id])

  if (loading) return <div className="min-h-screen bg-stone-50 p-8 text-stone-600">Loading your shop preview...</div>
  if (!data?.success || !data.vendor) {
    return <div className="min-h-screen bg-stone-50 p-8 text-stone-700">{data?.message || "Shop preview not available right now."}</div>
  }

  const themeClass =
    data.vendor.shopTheme === "ocean"
      ? "bg-[linear-gradient(180deg,#e0f2fe_0%,#f0f9ff_100%)] border-sky-200"
      : data.vendor.shopTheme === "sunset"
        ? "bg-[linear-gradient(180deg,#fff7ed_0%,#fff1f2_100%)] border-orange-200"
        : "bg-[linear-gradient(180deg,#fffaf0_0%,#faf5ea_100%)] border-stone-200"

  const cardTone =
    data.vendor.shopTheme === "ocean"
      ? "border-sky-200 bg-white/95 shadow-[0_20px_50px_-40px_rgba(14,165,233,0.35)]"
      : data.vendor.shopTheme === "sunset"
        ? "border-orange-200 bg-white/95 shadow-[0_20px_50px_-40px_rgba(249,115,22,0.25)]"
        : "border-stone-200 bg-white/95 shadow-sm"

  const products = Array.isArray(data.products) ? data.products : []

  return (
    <div className={`min-h-screen px-6 py-10 ${themeClass}`}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className={`rounded-[32px] border p-6 ${cardTone}`}>
          {data.vendor.storeCoverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.vendor.storeCoverUrl} alt={`${data.vendor.name} cover`} className="mb-5 h-52 w-full rounded-2xl object-cover ring-1 ring-stone-200" />
          ) : null}
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-500">Shop preview</p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-900">{data.vendor.name}</h1>
          <p className="mt-2 text-sm text-stone-600">{[data.vendor.city, data.vendor.state].filter(Boolean).join(", ") || "Nigeria"}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/vendor" className="rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700">
              Back to dashboard
            </Link>
            <Link href="/vendor/products" className="rounded-full bg-stone-900 px-4 py-2 text-sm text-white shadow-sm">
              <Plus className="mr-2 inline h-4 w-4" />
              Add products
            </Link>
            {isOwnVendor ? (
              <Link href="/vendor/settings" className="rounded-full border border-cyan-300 bg-cyan-50 px-4 py-2 text-sm text-cyan-800">
                Edit shop settings
              </Link>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <Link key={product.id} href={`/marketplace/product/${product.id}`} className={`overflow-hidden rounded-[24px] border transition hover:-translate-y-0.5 ${cardTone}`}>
              <div className="aspect-[4/3] w-full bg-stone-100">
                {product.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.images[0]} alt={product.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-stone-500">No product image yet</div>
                )}
              </div>
              <div className="p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-stone-500">{product.category || "General"}</p>
                <h2 className="mt-1 text-lg font-semibold text-stone-900">{product.title}</h2>
                <p className="mt-2 line-clamp-3 text-sm text-stone-600">{product.description}</p>
                <p className="mt-3 text-lg font-semibold text-stone-900">{`\u20A6`}{Number(product.price || 0).toLocaleString()}</p>
              </div>
            </Link>
          ))}
          {!products.length ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600 md:col-span-2 xl:col-span-3">
              <Store className="mx-auto mb-3 h-8 w-8 text-stone-400" />
              Your shop is live, but you have not added any products yet.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
