"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Search, Store, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function MarketplacePage() {
  const [query, setQuery] = useState("")
  const hasProducts = false
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
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products, vendors, or categories"
                className="w-full bg-transparent text-sm outline-none placeholder:text-stone-400"
                disabled={!hasProducts}
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

        <div className="relative overflow-hidden rounded-[32px] border border-dashed border-amber-200 bg-white/80 p-10 text-center shadow-[0_24px_80px_-55px_rgba(120,53,15,0.35)]">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-700 shadow-inner">
            <Sparkles className="h-10 w-10 animate-pulse" />
          </div>
          <h2 className="mt-5 text-2xl font-semibold text-stone-900">Onboarding vendors right now</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-stone-600">{onboardingCopy}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm text-stone-500">
            <span className="rounded-full border border-stone-200 bg-stone-50 px-4 py-2">Shop links</span>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-4 py-2">Product pages</span>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-4 py-2">Vendor storefronts</span>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-4 py-2">Cashback rewards</span>
          </div>
        </div>
      </div>
    </div>
  )
}
