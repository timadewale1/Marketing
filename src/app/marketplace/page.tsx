"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { BadgePercent, Search, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore"
import { db } from "@/lib/firebase"

export default function MarketplacePage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<Array<{
    id: string
    title: string
    description: string
    price: number
    category: string
    vendorName: string
    shopLink: string
    visibleOnMarketplace: boolean
    images: string[]
  }>>([])
  const [vendors, setVendors] = useState<Array<{ id: string; name: string; vendorVerificationStatus?: string; monthlyRentStatus?: string }>>([])

  useEffect(() => {
    const load = async () => {
      try {
        const [productsSnap, vendorsSnap] = await Promise.all([
          getDocs(query(collection(db, "vendorProducts"), orderBy("createdAt", "desc"), limit(48))),
          getDocs(query(collection(db, "vendors"), orderBy("updatedAt", "desc"), limit(24))),
        ])

        setProducts(productsSnap.docs.map((docItem) => {
          const data = docItem.data() as Record<string, unknown>
          return {
            id: docItem.id,
            title: String(data.title || ""),
            description: String(data.description || ""),
            price: Number(data.price || 0),
            category: String(data.category || "General"),
            vendorName: String(data.vendorName || "Vendor"),
            shopLink: String(data.shopLink || ""),
            visibleOnMarketplace: Boolean(data.visibleOnMarketplace),
            images: Array.isArray(data.images) ? data.images.map((value) => String(value || "")).filter(Boolean) : [],
          }
        }))
        setVendors(vendorsSnap.docs.map((docItem) => {
          const data = docItem.data() as Record<string, unknown>
          return {
            id: docItem.id,
            name: String(data.name || data.companyName || "Vendor"),
            vendorVerificationStatus: String(data.vendorVerificationStatus || ""),
            monthlyRentStatus: String(data.monthlyRentStatus || ""),
          }
        }))
      } finally {
        setLoading(false)
      }
    }

    load().catch((error) => {
      console.error("Marketplace load error", error)
      setLoading(false)
    })
  }, [])

  const visibleProducts = products.filter((product) => {
    const haystack = [product.title, product.description, product.category, product.vendorName].join(" ").toLowerCase()
    return haystack.includes(searchQuery.toLowerCase()) && product.visibleOnMarketplace
  })

  const visibleVendors = vendors.filter((vendor) => {
    const haystack = [vendor.name, vendor.vendorVerificationStatus, vendor.monthlyRentStatus].join(" ").toLowerCase()
    return haystack.includes(searchQuery.toLowerCase())
  })
  const onboardingCopy = useMemo(
    () => "We are still onboarding vendors. Check back soon for live shops, products, and storefront links.",
    []
  )

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.14),_transparent_32%),linear-gradient(180deg,#fffaf0_0%,#faf5ea_100%)] px-6 py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="rounded-[32px] border border-amber-100 bg-white/90 p-8 shadow-[0_24px_80px_-50px_rgba(120,53,15,0.4)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-700">
                <Store className="h-4 w-4" />
                Pamba Marketplace
              </div>
              <h1 className="text-3xl font-semibold text-stone-900">Discover vendors and products from Pamba</h1>
              <p className="max-w-3xl text-sm leading-6 text-stone-600">
                Search shops, browse products, and open vendor storefronts when the marketplace goes live.
              </p>
            </div>
            <Button asChild className="rounded-full">
              <Link href="/auth/sign-up">Become a Vendor</Link>
            </Button>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-[1.4fr_0.8fr_0.8fr]">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
              <Search className="mb-2 h-4 w-4 text-stone-500" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products, vendors, or categories"
                className="w-full bg-transparent text-sm outline-none placeholder:text-stone-400"
              />
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
              Category filter
              <p className="mt-1 text-xs text-stone-400">Coming soon</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
              Vendor filter
              <p className="mt-1 text-xs text-stone-400">Coming soon</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="relative overflow-hidden rounded-[32px] border border-dashed border-amber-200 bg-white/80 p-10 text-center shadow-[0_24px_80px_-55px_rgba(120,53,15,0.35)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.15),_transparent_55%)]" />
            <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-700 shadow-inner">
              <Store className="h-10 w-10 animate-pulse" />
            </div>
            <h2 className="relative mt-5 text-2xl font-semibold text-stone-900">Loading marketplace...</h2>
            <p className="relative mx-auto mt-3 max-w-2xl text-sm leading-6 text-stone-600">We are checking for live vendor products and storefronts.</p>
          </div>
        ) : visibleProducts.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibleProducts.map((product) => (
              <Link key={product.id} href={product.shopLink || "#"} className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-[0_20px_50px_-42px_rgba(28,25,23,0.4)] transition hover:-translate-y-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-stone-500">{product.category}</p>
                    <h3 className="mt-1 text-xl font-semibold text-stone-900">{product.title}</h3>
                    <p className="mt-1 text-sm text-stone-500">{product.vendorName}</p>
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    Live
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-stone-600">{product.description}</p>
                <p className="mt-3 text-lg font-semibold text-stone-900">₦{Number(product.price).toLocaleString()}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {product.images.slice(0, 3).map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={url} src={url} alt={product.title} className="h-14 w-14 rounded-xl object-cover" />
                  ))}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-[32px] border border-dashed border-amber-200 bg-white/80 p-10 text-center shadow-[0_24px_80px_-55px_rgba(120,53,15,0.35)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.12),_transparent_58%)]" />
            <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-700 shadow-inner">
              <Store className="h-10 w-10 animate-pulse" />
            </div>
            <h2 className="relative mt-5 text-2xl font-semibold text-stone-900">The marketplace is being prepared</h2>
            <p className="relative mx-auto mt-3 max-w-2xl text-sm leading-6 text-stone-600">{onboardingCopy}</p>
            <div className="relative mt-6 grid gap-3 text-left md:grid-cols-2">
              <div className="rounded-2xl border border-stone-200 bg-white/95 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-stone-900"><BadgePercent className="h-4 w-4 text-amber-600" /> Live shops</p>
                <p className="mt-1 text-sm text-stone-600">Vendors will soon publish storefronts and shareable product pages.</p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white/95 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-stone-900"><Store className="h-4 w-4 text-amber-600" /> Product discovery</p>
                <p className="mt-1 text-sm text-stone-600">Search and browse vendor listings from one clean marketplace view.</p>
              </div>
            </div>
          </div>
        )}

        {visibleVendors.length > 0 ? (
          <div className="rounded-[28px] border border-stone-200 bg-white/90 p-6">
            <h2 className="text-xl font-semibold text-stone-900">Vendors</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleVendors.map((vendor) => (
                <div key={vendor.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <p className="font-semibold text-stone-900">{vendor.name}</p>
                  <p className="mt-1 text-sm text-stone-600">Verification: {vendor.vendorVerificationStatus || "pending"}</p>
                  <p className="mt-1 text-sm text-stone-600">Rent: {vendor.monthlyRentStatus || "unpaid"}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
