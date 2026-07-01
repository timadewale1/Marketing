"use client"

import { useEffect, useState } from "react"
import { onAuthStateChanged } from "firebase/auth"
import { auth } from "@/lib/firebase"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import toast from "react-hot-toast"
import VendorPulseLoader from "@/components/vendor/VendorPulseLoader"

type VendorProfile = {
  name?: string
  email?: string
  storefrontSlug?: string
  storefrontLink?: string
  vendorVerificationStatus?: string
  vendorPaymentStatus?: string
  monthlyRentStatus?: string
  storeStatus?: string
}

export default function VendorProfilePage() {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<VendorProfile | null>(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setProfile(null)
        setLoading(false)
        return
      }
      try {
        const idToken = await user.getIdToken()
        const res = await fetch("/api/vendor/profile", {
          headers: { Authorization: `Bearer ${idToken}` },
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.success) {
          setProfile(data.profile || null)
        }
      } finally {
        setLoading(false)
      }
    })
    return () => unsub()
  }, [])

  if (loading) return <VendorPulseLoader label="Loading vendor profile..." />

  return (
    <div className="space-y-6">
      <Card className="rounded-[30px] border-cyan-100 bg-white shadow-[0_24px_80px_-60px_rgba(8,145,178,0.55)]">
        <CardContent className="p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-700">Vendor profile</p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-900">{profile?.name || "Vendor"}</h1>
          <p className="mt-2 text-sm text-stone-600">{profile?.email || "No email found"}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge className="rounded-full border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-700">
              Verification: {String(profile?.vendorVerificationStatus || "pending")}
            </Badge>
            <Badge className="rounded-full border-stone-200 bg-stone-50 px-3 py-1 text-stone-700">
              Setup fee: {String(profile?.vendorPaymentStatus || "unpaid")}
            </Badge>
            <Badge className="rounded-full border-stone-200 bg-stone-50 px-3 py-1 text-stone-700">
              Rent: {String(profile?.monthlyRentStatus || "unpaid")}
            </Badge>
            <Badge className="rounded-full border-stone-200 bg-stone-50 px-3 py-1 text-stone-700">
              Store: {String(profile?.storeStatus || "awaiting_verification")}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-stone-200 bg-white">
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold text-stone-900">Public shop details</h2>
          <p className="mt-2 text-sm text-stone-600">
            Shop link name: {profile?.storefrontSlug ? `/marketplace/shop/${profile.storefrontSlug}` : "Not set yet"}
          </p>
          <p className="mt-1 break-all text-sm text-stone-600">
            Customer contact link: {profile?.storefrontLink || "Not set yet"}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button asChild className="rounded-full bg-cyan-700 hover:bg-cyan-600">
              <Link href="/vendor">Edit profile and shop settings</Link>
            </Button>
            {profile?.storefrontSlug ? (
              <>
                <Button asChild variant="outline" className="rounded-full">
                  <Link href={`/marketplace/shop/${profile.storefrontSlug}`}>Open my shop</Link>
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => {
                    const shopUrl = `${window.location.origin}/marketplace/shop/${profile.storefrontSlug}`
                    navigator.clipboard.writeText(shopUrl).then(() => toast.success("Shop link copied")).catch(() => toast.error("Could not copy link"))
                  }}
                >
                  Copy shop link
                </Button>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
