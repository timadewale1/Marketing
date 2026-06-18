"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"

export default function MarketplaceShopSlugPage() {
  const params = useParams<{ slug: string }>()
  const router = useRouter()

  useEffect(() => {
    const slug = String(params?.slug || "")
    if (!slug) {
      router.replace("/marketplace")
      return
    }

    fetch(`/api/marketplace/shop/${slug}`, { cache: "no-store" })
      .then(async (res) => {
        const payload = (await res.json().catch(() => ({}))) as { success?: boolean; vendorId?: string }
        if (payload?.success && payload.vendorId) {
          router.replace(`/marketplace/vendor/${payload.vendorId}`)
          return
        }
        router.replace("/marketplace")
      })
      .catch(() => {
        router.replace("/marketplace")
      })
  }, [params, router])

  return <div className="min-h-screen bg-stone-50 p-8 text-stone-600">Opening shop...</div>
}
