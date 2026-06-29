"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { AdminPageHeader, EmptyState, SectionCard, StatusBadge } from "@/app/admin/_components/admin-primitives"

type ProductDetail = {
  id: string
  vendorId: string
  vendorName: string
  title: string
  description: string
  price: number
  category: string
  status: string
  visibleOnMarketplace: boolean
  images: string[]
  shopLink: string
  contactMethod: string
  contactDetails: string
}

type VendorMini = {
  id: string
  name: string
  email: string
  phone: string
}

export default function AdminVendorProductDetailPage() {
  const params = useParams<{ id: string }>()
  const productId = String(params?.id || "")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [vendor, setVendor] = useState<VendorMini | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError("")
      try {
        const res = await fetch(`/api/admin/vendor-products/${productId}`, { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.success) throw new Error(data.message || "Failed to load product")
        setProduct(data.product || null)
        setVendor(data.vendor || null)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load product")
      } finally {
        setLoading(false)
      }
    }
    if (productId) void load()
  }, [productId])

  if (loading) return <div className="h-56 animate-pulse rounded-3xl bg-stone-100" />
  if (!product) {
    return (
      <EmptyState
        title="Product not found"
        description={error || "This vendor product is not available."}
        href="/admin/vendors"
        cta="Back to vendors"
      />
    )
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Vendor product"
        title={product.title}
        description={`${product.category} • ₦${Number(product.price || 0).toLocaleString()}`}
      />

      <div className="flex flex-wrap gap-2">
        <StatusBadge label={product.status || "draft"} tone={product.status === "active" ? "green" : "amber"} />
        <StatusBadge label={product.visibleOnMarketplace ? "Visible on marketplace" : "Hidden on marketplace"} tone={product.visibleOnMarketplace ? "green" : "red"} />
      </div>

      {vendor ? (
        <SectionCard title="Vendor" description="Owner of this product.">
          <p className="text-sm text-stone-700">{vendor.name}</p>
          <p className="text-sm text-stone-600">{vendor.email || "No email"} {vendor.phone ? `• ${vendor.phone}` : ""}</p>
          <div className="mt-2">
            <Link href={`/admin/vendors/${vendor.id}`} className="text-sm text-blue-700 underline">
              Open vendor details
            </Link>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Product details" description="Full product information as listed by vendor.">
        <p className="text-sm text-stone-700 whitespace-pre-wrap">{product.description || "No description"}</p>
        <p className="mt-3 text-sm text-stone-700">Contact method: {product.contactMethod || "Not set"}</p>
        <p className="text-sm text-stone-700">Contact details: {product.contactDetails || "Not set"}</p>
        <p className="text-sm text-stone-700">
          Shop link:{" "}
          {product.shopLink ? <a href={product.shopLink} target="_blank" rel="noreferrer" className="text-blue-700 underline">Open</a> : "Not set"}
        </p>
      </SectionCard>
    </div>
  )
}

