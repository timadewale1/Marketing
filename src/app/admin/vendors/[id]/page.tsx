"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Package, Wallet, TrendingUp, Store } from "lucide-react"
import { AdminPageHeader, EmptyState, MetricCard, SectionCard, StatusBadge } from "@/app/admin/_components/admin-primitives"

type VendorDetail = {
  id: string
  name: string
  email: string
  phone: string
  vendorVerificationStatus: string
  vendorPaymentStatus: string
  monthlyRentStatus: string
  storeStatus: string
  storefrontSlug: string
  storefrontLink: string
  storeCoverUrl: string
  verificationDetails?: Record<string, unknown>
  bank?: Record<string, unknown>
  productsPublishedCount: number
  balance: number
  totalEarned: number
}

type VendorProduct = {
  id: string
  title: string
  description: string
  price: number
  category: string
  status: string
  visibleOnMarketplace: boolean
}

export default function AdminVendorDetailPage() {
  const params = useParams<{ id: string }>()
  const vendorId = String(params?.id || "")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [vendor, setVendor] = useState<VendorDetail | null>(null)
  const [products, setProducts] = useState<VendorProduct[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError("")
      try {
        const res = await fetch(`/api/admin/vendors/${vendorId}`, { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.success) throw new Error(data.message || "Failed to load vendor")
        setVendor(data.vendor || null)
        setProducts(Array.isArray(data.products) ? data.products : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load vendor")
      } finally {
        setLoading(false)
      }
    }
    if (vendorId) void load()
  }, [vendorId])

  if (loading) return <div className="h-56 animate-pulse rounded-3xl bg-stone-100" />
  if (!vendor) {
    return (
      <EmptyState
        title="Vendor not found"
        description={error || "This vendor record is not available."}
        href="/admin/vendors"
        cta="Back to vendors"
      />
    )
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Vendor detail"
        title={vendor.name}
        description={`${vendor.email || "No email"}${vendor.phone ? ` • ${vendor.phone}` : ""}`}
      />

      <div className="flex flex-wrap gap-2">
        <StatusBadge label={vendor.vendorVerificationStatus || "pending"} tone={vendor.vendorVerificationStatus === "verified" ? "green" : "amber"} />
        <StatusBadge label={`Setup: ${vendor.vendorPaymentStatus || "unpaid"}`} tone={vendor.vendorPaymentStatus === "paid" ? "green" : "amber"} />
        <StatusBadge label={`Rent: ${vendor.monthlyRentStatus || "unpaid"}`} tone={vendor.monthlyRentStatus === "paid" ? "green" : "amber"} />
        <StatusBadge label={`Store: ${vendor.storeStatus || "awaiting_verification"}`} tone={vendor.storeStatus === "active" ? "green" : "amber"} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Products" value={products.length} hint="Total listings" icon={Package} />
        <MetricCard label="Wallet balance" value={`₦${Number(vendor.balance || 0).toLocaleString()}`} hint="Current wallet" tone="blue" icon={Wallet} />
        <MetricCard label="Total earned" value={`₦${Number(vendor.totalEarned || 0).toLocaleString()}`} hint="Lifetime earnings" tone="emerald" icon={TrendingUp} />
        <MetricCard label="Published count" value={vendor.productsPublishedCount || 0} hint="Profile summary" icon={Store} />
      </div>

      <SectionCard title="Vendor information" description="Verification, bank, and store settings.">
        <div className="space-y-2 text-sm text-stone-700">
          <p>Store slug: {vendor.storefrontSlug || "Not set"}</p>
          <p>
            Store link:{" "}
            {vendor.storefrontLink ? (
              <a className="text-blue-700 underline" href={vendor.storefrontLink} target="_blank" rel="noreferrer">Open storefront</a>
            ) : (
              "Not set"
            )}
          </p>
          <p>Verification details: {vendor.verificationDetails ? "Submitted" : "Not submitted"}</p>
          <p>Bank details: {vendor.bank ? "Submitted" : "Not submitted"}</p>
        </div>
      </SectionCard>

      <SectionCard title="Products" description="All products from this vendor.">
        {products.length === 0 ? (
          <EmptyState title="No products yet" description="This vendor has not listed products." />
        ) : (
          <div className="space-y-3">
            {products.map((product) => (
              <div key={product.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-stone-900">{product.title}</p>
                    <p className="text-sm text-stone-600">{product.category} • ₦{Number(product.price || 0).toLocaleString()}</p>
                    <p className="mt-1 text-sm text-stone-600 line-clamp-2">{product.description || "No description"}</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge label={product.status || "draft"} tone={product.status === "active" ? "green" : "amber"} />
                    <div className="mt-2">
                      <Link className="text-sm text-blue-700 underline" href={`/admin/vendor-products/${product.id}`}>
                        Open product
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
