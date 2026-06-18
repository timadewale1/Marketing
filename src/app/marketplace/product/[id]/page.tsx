"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import toast from "react-hot-toast"

type ProductPayload = {
  success: boolean
  product?: {
    id: string
    vendorId: string
    vendorName: string
    title: string
    description: string
    price: number
    category: string
    contactMethod: string
    contactDetails: string
    shopLink: string
    images: string[]
  }
  vendor?: {
    id: string
    storefrontLink: string
    storefrontSlug: string
  }
  message?: string
}

export default function MarketplaceProductPage() {
  const params = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ProductPayload | null>(null)

  useEffect(() => {
    const id = String(params?.id || "")
    if (!id) {
      setLoading(false)
      return
    }
    fetch(`/api/marketplace/product/${id}`, { cache: "no-store" })
      .then(async (res) => {
        const payload = (await res.json().catch(() => ({}))) as ProductPayload
        setData(payload)
      })
      .finally(() => setLoading(false))
  }, [params])

  if (loading) return <div className="min-h-screen bg-stone-50 p-8 text-stone-600">Loading product...</div>
  if (!data?.success || !data.product) {
    return <div className="min-h-screen bg-stone-50 p-8 text-stone-700">{data?.message || "Product not found."}</div>
  }

  const product = data.product
  const contactLink = product.shopLink || data.vendor?.storefrontLink || ""

  const copyProductLink = async () => {
    if (typeof window === "undefined") return
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success("Product link copied")
    } catch {
      toast.error("Could not copy product link")
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/marketplace" className="inline-block rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700">
          Back to marketplace
        </Link>

        <div className="rounded-3xl border border-stone-200 bg-white p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">{product.category || "General"}</p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-900">{product.title}</h1>
          <p className="mt-2 text-sm text-stone-600">Vendor: {product.vendorName}</p>
          <p className="mt-4 whitespace-pre-line text-sm leading-7 text-stone-700">{product.description}</p>
          <p className="mt-5 text-2xl font-semibold text-stone-900">₦{Number(product.price || 0).toLocaleString()}</p>

          <div className="mt-6 flex flex-wrap gap-2">
            {data.vendor?.id ? (
              <Link href={`/marketplace/vendor/${data.vendor.id}`} className="rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700">
                Open vendor shop
              </Link>
            ) : null}
            {contactLink ? (
              <a href={contactLink} target="_blank" rel="noopener noreferrer" className="rounded-full bg-stone-900 px-4 py-2 text-sm text-white">
                Contact vendor to buy
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => void copyProductLink()}
              className="rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-700"
            >
              Copy product link
            </button>
          </div>
          <p className="mt-3 text-sm text-stone-700">
            How to buy: contact via{" "}
            <span className="font-medium capitalize">{product.contactMethod || "vendor link"}</span>
            {product.contactDetails ? ` (${product.contactDetails})` : ""}
          </p>
          <p className="mt-3 text-xs text-stone-500">
            Product ID: <span className="font-medium text-stone-700">{product.id}</span>
          </p>
        </div>

        {product.images.length ? (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {product.images.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt={product.title} className="h-48 w-full rounded-2xl object-cover ring-1 ring-stone-200" />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
