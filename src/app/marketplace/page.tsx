"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { BadgePercent, ChevronLeft, ChevronRight, Search, Store } from "lucide-react"
import { Button } from "@/components/ui/button"

const MARKETPLACE_CACHE_KEY = "marketplace:overview:v2"
const PRODUCTS_PER_PAGE = 15

type MarketplaceProduct = {
  id: string
  vendorId: string
  title: string
  description: string
  price: number
  category: string
  vendorName: string
  shopLink: string
  images: string[]
}

type MarketplaceVendor = {
  id: string
  name: string
  storefrontSlug?: string
  storefrontLink?: string
  storeCoverUrl?: string
  shopTheme?: string
  shopLayout?: string
  vendorVerificationStatus?: string
  monthlyRentStatus?: string
  productsCount?: number
}

export default function MarketplacePage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("All")
  const [vendorFilter, setVendorFilter] = useState("All")
  const [productPage, setProductPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [hasLiveProducts, setHasLiveProducts] = useState(false)
  const [products, setProducts] = useState<MarketplaceProduct[]>([])
  const [vendors, setVendors] = useState<MarketplaceVendor[]>([])

  useEffect(() => {
    if (typeof window === "undefined") return
    const cached = window.sessionStorage.getItem(MARKETPLACE_CACHE_KEY)
    if (!cached) return
    try {
      const parsed = JSON.parse(cached) as {
        hasLiveProducts?: boolean
        products?: MarketplaceProduct[]
        vendors?: MarketplaceVendor[]
      }
      setHasLiveProducts(Boolean(parsed.hasLiveProducts))
      setProducts(Array.isArray(parsed.products) ? parsed.products : [])
      setVendors(Array.isArray(parsed.vendors) ? parsed.vendors : [])
      setLoading(false)
    } catch {
      window.sessionStorage.removeItem(MARKETPLACE_CACHE_KEY)
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/marketplace/overview", { cache: "no-store" })
        const payload = (await res.json().catch(() => ({}))) as {
          success?: boolean
          hasLiveProducts?: boolean
          products?: Array<Record<string, unknown>>
          vendors?: Array<Record<string, unknown>>
        }

        if (!res.ok || !payload.success) {
          throw new Error("Failed to load marketplace")
        }

        const nextProducts = Array.isArray(payload.products)
          ? payload.products.map((item) => ({
              id: String(item.id || ""),
              vendorId: String(item.vendorId || ""),
              title: String(item.title || ""),
              description: String(item.description || ""),
              price: Number(item.price || 0),
              category: String(item.category || "General"),
              vendorName: String(item.vendorName || "Vendor"),
              shopLink: String(item.shopLink || ""),
              images: Array.isArray(item.images) ? item.images.map((value) => String(value || "")).filter(Boolean) : [],
            }))
          : []

        const nextVendors = Array.isArray(payload.vendors)
          ? payload.vendors.map((item) => ({
              id: String(item.id || ""),
              name: String(item.name || "Vendor"),
              storefrontSlug: String(item.storefrontSlug || ""),
              storefrontLink: String(item.storefrontLink || ""),
              storeCoverUrl: String(item.storeCoverUrl || ""),
              shopTheme: String(item.shopTheme || "classic"),
              shopLayout: String(item.shopLayout || "cards"),
              vendorVerificationStatus: String(item.vendorVerificationStatus || ""),
              monthlyRentStatus: String(item.monthlyRentStatus || ""),
              productsCount: Number(item.productsCount || 0),
            }))
          : []

        setHasLiveProducts(Boolean(payload.hasLiveProducts))
        setProducts(nextProducts)
        setVendors(nextVendors)

        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            MARKETPLACE_CACHE_KEY,
            JSON.stringify({ hasLiveProducts: Boolean(payload.hasLiveProducts), products: nextProducts, vendors: nextVendors })
          )
        }
      } catch (error) {
        console.error("Marketplace load error", error)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const q = searchQuery.toLowerCase()
  const categories = useMemo(() => ["All", ...Array.from(new Set(products.map((product) => product.category).filter(Boolean)))], [products])
  const vendorNames = useMemo(() => ["All", ...Array.from(new Set(vendors.map((vendor) => vendor.name).filter(Boolean)))], [vendors])
  const visibleProducts = products.filter((product) => {
    const searchMatch = [product.title, product.description, product.category, product.vendorName].join(" ").toLowerCase().includes(q)
    const categoryMatch = categoryFilter === "All" || product.category === categoryFilter
    const vendorMatch = vendorFilter === "All" || product.vendorName === vendorFilter
    return searchMatch && categoryMatch && vendorMatch
  })
  const visibleVendors = vendors.filter((vendor) =>
    [vendor.name, vendor.vendorVerificationStatus, vendor.monthlyRentStatus].join(" ").toLowerCase().includes(q)
  )
  const totalProductPages = Math.max(1, Math.ceil(visibleProducts.length / PRODUCTS_PER_PAGE))
  const paginatedProducts = visibleProducts.slice((productPage - 1) * PRODUCTS_PER_PAGE, productPage * PRODUCTS_PER_PAGE)

  useEffect(() => {
    setProductPage(1)
  }, [searchQuery, categoryFilter, vendorFilter])

  useEffect(() => {
    if (productPage > totalProductPages) setProductPage(totalProductPages)
  }, [productPage, totalProductPages])

  const onboardingText = hasLiveProducts
    ? "No shops or products matched your filters."
    : "We are still onboarding vendors. Check back soon for live shops and products."

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
            <div className="flex flex-wrap gap-2">
              <Button asChild className="rounded-full bg-stone-900 text-white shadow-lg shadow-stone-900/10 hover:bg-stone-800">
                <Link href="/marketplace/auth/sign-up?role=vendor">Become a Seller</Link>
              </Button>
              <Button asChild className="rounded-full bg-cyan-600 text-white shadow-lg shadow-cyan-700/10 hover:bg-cyan-700">
                <Link href="/marketplace/auth/sign-up?role=customer">Become a Buyer</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full border-stone-300 bg-white/90 shadow-sm">
                <Link href="/marketplace/auth/sign-in">Login to Marketplace</Link>
              </Button>
            </div>
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
              <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Category filter</label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="mt-2 w-full bg-transparent text-sm outline-none">
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
              <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Vendor filter</label>
              <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className="mt-2 w-full bg-transparent text-sm outline-none">
                {vendorNames.map((vendorName) => (
                  <option key={vendorName} value={vendorName}>
                    {vendorName}
                  </option>
                ))}
              </select>
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
            <p className="relative mx-auto mt-3 max-w-2xl text-sm leading-6 text-stone-600">
              We are checking for live vendor products and storefronts.
            </p>
          </div>
        ) : hasLiveProducts && (visibleVendors.length > 0 || paginatedProducts.length > 0) ? (
          <>
            <div className="rounded-[32px] border border-stone-200 bg-white/90 p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-stone-900">Shops</h2>
                  <p className="text-sm text-stone-600">Swipe through live storefronts.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => document.getElementById("shops-row")?.scrollBy({ left: -340, behavior: "smooth" })}
                    className="rounded-full border border-stone-300 bg-white p-2 text-stone-700"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => document.getElementById("shops-row")?.scrollBy({ left: 340, behavior: "smooth" })}
                    className="rounded-full border border-stone-300 bg-white p-2 text-stone-700"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div id="shops-row" className="mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
                {visibleVendors.map((vendor) => (
                  <Link
                    key={vendor.id}
                    href={vendor.storefrontSlug ? `/marketplace/shop/${vendor.storefrontSlug}` : `/marketplace/vendor/${vendor.id}`}
                    className="min-w-[260px] snap-start overflow-hidden rounded-3xl border border-stone-200 bg-stone-50 shadow-sm transition hover:-translate-y-0.5"
                  >
                    {vendor.storeCoverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={vendor.storeCoverUrl} alt={`${vendor.name} cover`} className="h-40 w-full object-cover" />
                    ) : (
                      <div className="h-40 bg-gradient-to-br from-amber-100 to-stone-100" />
                    )}
                    <div className="p-4">
                      <p className="font-semibold text-stone-900">{vendor.name}</p>
                      <p className="mt-1 text-sm text-stone-600">Open the shop and view live products.</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-[32px] border border-stone-200 bg-white/90 p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-stone-900">Products</h2>
                  <p className="text-sm text-stone-600">Showing 15 products per page.</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-stone-600">
                  <button className="rounded-full border border-stone-300 px-3 py-1 disabled:opacity-50" disabled={productPage === 1} onClick={() => setProductPage((page) => Math.max(1, page - 1))}>
                    <ChevronLeft className="inline h-4 w-4" /> Prev
                  </button>
                  <span>
                    {productPage} / {totalProductPages}
                  </span>
                  <button className="rounded-full border border-stone-300 px-3 py-1 disabled:opacity-50" disabled={productPage >= totalProductPages} onClick={() => setProductPage((page) => Math.min(totalProductPages, page + 1))}>
                    Next <ChevronRight className="inline h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {paginatedProducts.map((product) => (
                  <Link
                    key={product.id}
                    href={`/marketplace/product/${product.id}`}
                    className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-[0_20px_50px_-42px_rgba(28,25,23,0.4)] transition hover:-translate-y-1"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">{product.category}</p>
                        <h3 className="mt-1 text-xl font-semibold text-stone-900">{product.title}</h3>
                        <p className="mt-1 text-sm text-stone-500">{product.vendorName}</p>
                      </div>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">Live</span>
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
            </div>
          </>
        ) : (
          <div className="relative overflow-hidden rounded-[32px] border border-dashed border-amber-200 bg-white/80 p-10 text-center shadow-[0_24px_80px_-55px_rgba(120,53,15,0.35)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.12),_transparent_58%)]" />
            <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-700 shadow-inner">
              <Store className="h-10 w-10 animate-pulse" />
            </div>
            <h2 className="relative mt-5 text-2xl font-semibold text-stone-900">The marketplace is being prepared</h2>
            <p className="relative mx-auto mt-3 max-w-2xl text-sm leading-6 text-stone-600">{onboardingText}</p>
            <div className="relative mt-6 grid gap-3 text-left md:grid-cols-2">
              <div className="rounded-2xl border border-stone-200 bg-white/95 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                  <BadgePercent className="h-4 w-4 text-amber-600" /> Live shops
                </p>
                <p className="mt-1 text-sm text-stone-600">Vendors will soon publish storefronts and shareable product pages.</p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white/95 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                  <Store className="h-4 w-4 text-amber-600" /> Product discovery
                </p>
                <p className="mt-1 text-sm text-stone-600">Search and browse vendor listings from one clean marketplace view.</p>
              </div>
            </div>
            <div className="relative mt-6 flex flex-wrap items-center justify-center gap-2">
              <Button asChild className="rounded-full bg-stone-900 text-white shadow-lg shadow-stone-900/10 hover:bg-stone-800">
                <Link href="/marketplace/auth/sign-up?role=vendor">Become a Seller</Link>
              </Button>
              <Button asChild className="rounded-full bg-cyan-600 text-white shadow-lg shadow-cyan-700/10 hover:bg-cyan-700">
                <Link href="/marketplace/auth/sign-up?role=customer">Become a Buyer</Link>
              </Button>
            </div>
          </div>
        )}

        {hasLiveProducts && visibleVendors.length > 0 ? (
          <div className="rounded-[28px] border border-stone-200 bg-white/90 p-6">
            <h2 className="text-xl font-semibold text-stone-900">Vendors</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleVendors.map((vendor) => (
                <Link
                  key={vendor.id}
                  href={vendor.storefrontSlug ? `/marketplace/shop/${vendor.storefrontSlug}` : `/marketplace/vendor/${vendor.id}`}
                  className="rounded-2xl border border-stone-200 bg-stone-50 p-4 transition hover:-translate-y-0.5"
                >
                  {vendor.storeCoverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={vendor.storeCoverUrl} alt={`${vendor.name} cover`} className="mb-3 h-28 w-full rounded-xl object-cover ring-1 ring-stone-200" />
                  ) : null}
                  <p className="font-semibold text-stone-900">{vendor.name}</p>
                  <p className="mt-1 text-sm text-stone-600">Verification: {vendor.vendorVerificationStatus || "pending"}</p>
                  <p className="mt-1 text-sm text-stone-600">Products: {vendor.productsCount || 0}</p>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
