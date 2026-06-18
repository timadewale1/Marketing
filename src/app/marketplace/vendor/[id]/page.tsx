"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Store } from "lucide-react"

type VendorStorePayload = {
  success: boolean
  vendor?: {
    id: string
    name: string
    email: string
    storefrontLink: string
    storefrontSlug: string
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

export default function MarketplaceVendorPage() {
  const params = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<VendorStorePayload | null>(null)

  useEffect(() => {
    const id = String(params?.id || "")
    if (!id) {
      setLoading(false)
      return
    }

    fetch(`/api/marketplace/vendor/${id}`, { cache: "no-store" })
      .then(async (res) => {
        const payload = (await res.json().catch(() => ({}))) as VendorStorePayload
        setData(payload)
      })
      .finally(() => setLoading(false))
  }, [params])

  if (loading) return <div className="min-h-screen bg-stone-50 p-8 text-stone-600">Loading vendor shop...</div>
  if (!data?.success || !data.vendor) {
    return <div className="min-h-screen bg-stone-50 p-8 text-stone-700">{data?.message || "Vendor shop not available right now."}</div>
  }

  const products = Array.isArray(data.products) ? data.products : []
  return (
    <div className="min-h-screen bg-stone-50 px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-3xl border border-stone-200 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-500">Vendor shop</p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-900">{data.vendor.name}</h1>
          <p className="mt-2 text-sm text-stone-600">{[data.vendor.city, data.vendor.state].filter(Boolean).join(", ") || "Nigeria"}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/marketplace" className="rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700">
              Back to marketplace
            </Link>
            {data.vendor.storefrontLink ? (
              <a href={data.vendor.storefrontLink} target="_blank" rel="noopener noreferrer" className="rounded-full bg-stone-900 px-4 py-2 text-sm text-white">
                Contact vendor
              </a>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <Link key={product.id} href={`/marketplace/product/${product.id}`} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">{product.category || "General"}</p>
              <h2 className="mt-1 text-lg font-semibold text-stone-900">{product.title}</h2>
              <p className="mt-2 line-clamp-3 text-sm text-stone-600">{product.description}</p>
              <p className="mt-3 text-lg font-semibold text-stone-900">₦{Number(product.price || 0).toLocaleString()}</p>
            </Link>
          ))}
          {!products.length ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600 md:col-span-2 xl:col-span-3">
              <Store className="mx-auto mb-3 h-8 w-8 text-stone-400" />
              No products are live in this shop yet.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
