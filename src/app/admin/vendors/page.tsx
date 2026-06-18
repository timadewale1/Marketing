"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { BadgeCheck, Package, ShieldCheck, Store, Wallet } from "lucide-react"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { AdminPageHeader, EmptyState, MetricCard, SectionCard, StatusBadge } from "@/app/admin/_components/admin-primitives"

type VendorRow = {
  id: string
  name: string
  email: string
  phone: string
  vendorVerificationStatus: string
  vendorPaymentStatus: string
  monthlyRentStatus: string
  storeStatus: string
  verified: boolean
  productsPublishedCount: number
}

type VendorProductRow = {
  id: string
  vendorName: string
  title: string
  description: string
  price: number
  category: string
  status: string
  visibleOnMarketplace: boolean
}

export default function AdminVendorsPage() {
  const [loading, setLoading] = useState(true)
  const [vendors, setVendors] = useState<VendorRow[]>([])
  const [products, setProducts] = useState<VendorProductRow[]>([])

  const load = async () => {
    setLoading(true)
    try {
      const [vendorsRes, productsRes] = await Promise.all([
        fetch("/api/admin/vendors", { cache: "no-store" }),
        fetch("/api/admin/vendor-products", { cache: "no-store" }),
      ])
      const vendorsData = await vendorsRes.json().catch(() => ({}))
      const productsData = await productsRes.json().catch(() => ({}))
      if (!vendorsRes.ok || !vendorsData.success) {
        throw new Error(vendorsData.message || "Failed to load vendors")
      }
      if (!productsRes.ok || !productsData.success) {
        throw new Error(productsData.message || "Failed to load vendor products")
      }
      setVendors(Array.isArray(vendorsData.vendors) ? vendorsData.vendors : [])
      setProducts(Array.isArray(productsData.products) ? productsData.products : [])
    } catch (error) {
      console.error("Admin vendors load error", error)
      toast.error("Could not load vendors")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const stats = useMemo(() => {
    const pending = vendors.filter((vendor) => String(vendor.vendorVerificationStatus).toLowerCase() === "pending").length
    const active = vendors.filter((vendor) => String(vendor.vendorVerificationStatus).toLowerCase() === "verified").length
    const rentOverdue = vendors.filter((vendor) => String(vendor.monthlyRentStatus).toLowerCase() !== "paid").length
    return { pending, active, products: products.length, rentOverdue }
  }, [vendors, products])

  const updateVendor = async (vendorId: string, payload: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/admin/vendors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, ...payload }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update vendor")
      }
      toast.success("Vendor updated")
      await load()
    } catch (error) {
      console.error("Admin vendor update error", error)
      toast.error(error instanceof Error ? error.message : "Could not update vendor")
    }
  }

  const updateProduct = async (productId: string, payload: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/admin/vendor-products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, ...payload }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update product")
      }
      toast.success("Product updated")
      await load()
    } catch (error) {
      console.error("Admin vendor product update error", error)
      toast.error(error instanceof Error ? error.message : "Could not update product")
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Vendor management"
        title="Pamba Vendors"
        description="Review vendor verification, rent status, and published products from one place."
        action={
          <Button asChild className="rounded-full">
            <Link href="/marketplace">Open marketplace</Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Pending verification" value={stats.pending} hint="Vendors waiting for approval" icon={ShieldCheck} />
        <MetricCard label="Active shops" value={stats.active} hint="Verified vendors with live products" icon={Store} tone="emerald" />
        <MetricCard label="Products listed" value={stats.products} hint="All published vendor products" icon={Package} tone="blue" />
        <MetricCard label="Rent overdue" value={stats.rentOverdue} hint="Vendors on hold for unpaid monthly rent" icon={Wallet} tone="rose" />
      </div>

      <SectionCard
        title="Verification queue"
        description="Approve a vendor after email, address, proof of address, NIN, and face verification are complete."
      >
        {loading ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50/80 px-6 py-10 text-center text-stone-600">
            Loading vendors...
          </div>
        ) : vendors.length === 0 ? (
          <EmptyState
            title="No vendors waiting right now"
            description="Once vendors start signing up, their verification requests will appear here with review actions."
          />
        ) : (
          <div className="space-y-3">
            {vendors.map((vendor) => (
              <div key={vendor.id} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-stone-900">{vendor.name}</p>
                      <StatusBadge label={vendor.vendorVerificationStatus || "pending"} tone={vendor.vendorVerificationStatus === "verified" ? "green" : vendor.vendorVerificationStatus === "rejected" ? "red" : "amber"} />
                      <StatusBadge label={vendor.monthlyRentStatus || "unpaid"} tone={vendor.monthlyRentStatus === "paid" ? "green" : "amber"} />
                    </div>
                    <p className="mt-2 text-sm text-stone-600">{vendor.email || "No email"} {vendor.phone ? `• ${vendor.phone}` : ""}</p>
                    <p className="mt-1 text-sm text-stone-600">Products: {vendor.productsPublishedCount.toLocaleString()}</p>
                    <p className="mt-1 text-sm text-stone-600">Store status: {vendor.storeStatus || "awaiting_verification"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button className="rounded-full bg-emerald-600 hover:bg-emerald-500" onClick={() => void updateVendor(vendor.id, { vendorVerificationStatus: "verified", storeStatus: "active" })}>
                      <BadgeCheck className="mr-2 h-4 w-4" />
                      Verify
                    </Button>
                    <Button variant="outline" className="rounded-full" onClick={() => void updateVendor(vendor.id, { vendorVerificationStatus: "pending" })}>
                      Hold
                    </Button>
                    <Button variant="outline" className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => void updateVendor(vendor.id, { vendorVerificationStatus: "rejected", storeStatus: "hidden" })}>
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Products" description="Product listings and storefront links will show up here once vendors begin publishing items.">
        {products.length === 0 ? (
          <EmptyState
            title="No product moderation queue yet"
            description="The marketplace is still onboarding vendors, so product moderation will appear here when the first shops go live."
          />
        ) : (
          <div className="space-y-3">
            {products.map((product) => (
              <div key={product.id} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-stone-900">{product.title}</p>
                      <StatusBadge label={product.status || "draft"} tone={product.status === "active" ? "green" : product.status === "hidden" ? "red" : "amber"} />
                      <StatusBadge label={product.visibleOnMarketplace ? "Visible" : "Hidden"} tone={product.visibleOnMarketplace ? "green" : "red"} />
                    </div>
                    <p className="mt-2 text-sm text-stone-600">{product.vendorName} • {product.category || "General"} • ₦{Number(product.price || 0).toLocaleString()}</p>
                    <p className="mt-1 text-sm text-stone-600 line-clamp-2">{product.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="rounded-full" onClick={() => void updateProduct(product.id, { status: "active", visibleOnMarketplace: true })}>
                      Approve
                    </Button>
                    <Button variant="outline" className="rounded-full border-amber-200 text-amber-700 hover:bg-amber-50" onClick={() => void updateProduct(product.id, { status: "draft", visibleOnMarketplace: false })}>
                      Hold
                    </Button>
                    <Button variant="outline" className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => void updateProduct(product.id, { status: "hidden", visibleOnMarketplace: false })}>
                      Hide
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Recent vendor updates" description="You will also see rent status, approval actions, and shop activity in this area.">
        <div className="flex flex-wrap gap-2">
          <StatusBadge label="Onboarding" tone="amber" />
          <StatusBadge label="Verification pending" tone="blue" />
          <StatusBadge label="Store hidden" tone="red" />
        </div>
      </SectionCard>
    </div>
  )
}
