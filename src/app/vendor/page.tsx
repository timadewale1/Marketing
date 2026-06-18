"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { onAuthStateChanged } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { AlertCircle, Package, ShieldCheck, Store, Truck, Wallet } from "lucide-react"

type VendorProfile = {
  name?: string
  email?: string
  verified?: boolean
  vendorVerificationStatus?: string
  vendorPaymentStatus?: string
  monthlyRentStatus?: string
  storeStatus?: string
  productsPublishedCount?: number
}

export default function VendorDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(auth.currentUser?.uid ?? null)
  const [profile, setProfile] = useState<VendorProfile | null>(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setUserId(user?.uid ?? null)
      if (!user) {
        setProfile(null)
        setLoading(false)
        return
      }

      try {
        const snap = await getDoc(doc(db, "vendors", user.uid))
        setProfile((snap.data() as VendorProfile | undefined) || null)
      } finally {
        setLoading(false)
      }
    })

    return () => unsub()
  }, [])

  const verificationStatus = useMemo(() => {
    const raw = String(profile?.vendorVerificationStatus || "").toLowerCase()
    if (profile?.verified || raw === "verified" || raw === "approved") return "Verified"
    if (raw === "rejected") return "Needs attention"
    return "Waiting for verification"
  }, [profile])

  const rentStatus = useMemo(() => {
    const raw = String(profile?.monthlyRentStatus || "").toLowerCase()
    if (raw === "paid") return "Active"
    if (raw === "overdue") return "On hold"
    return "Pending"
  }, [profile])

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 p-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-stone-500">Loading vendor dashboard...</p>
        </div>
      </div>
    )
  }

  if (!userId) {
    return (
      <div className="min-h-screen bg-stone-50 p-6">
        <div className="mx-auto max-w-4xl rounded-3xl border border-dashed border-stone-300 bg-white p-8 text-center shadow-sm">
          <Store className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-4 text-2xl font-semibold text-stone-900">Vendor dashboard</h1>
          <p className="mt-2 text-stone-600">
            Please sign in as a Pamba Vendor to continue setting up your store.
          </p>
          <Button asChild className="mt-6 rounded-full">
            <Link href="/auth/sign-in">Go to sign in</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fffdf8_0%,#faf5ea_100%)] p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Card className="rounded-[32px] border-amber-100 bg-white/90 shadow-[0_24px_80px_-50px_rgba(120,53,15,0.45)]">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-700">
                  <Store className="h-4 w-4" />
                  Pamba Vendor
                </div>
                <h1 className="text-3xl font-semibold text-stone-900">
                  Welcome{profile?.name ? `, ${profile.name}` : ""}.
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-stone-600">
                  Your store is set up for product listings, storefront sharing, and external checkout links.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className="rounded-full border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
                  {verificationStatus}
                </Badge>
                <Badge className="rounded-full border-stone-200 bg-stone-50 px-3 py-1 text-stone-700">
                  Rent: {rentStatus}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="rounded-3xl border-stone-200 bg-white">
            <CardContent className="p-5">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <p className="mt-3 text-xs uppercase tracking-[0.28em] text-stone-500">Verification</p>
              <p className="mt-2 text-2xl font-semibold text-stone-900">{verificationStatus}</p>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border-stone-200 bg-white">
            <CardContent className="p-5">
              <Wallet className="h-5 w-5 text-amber-600" />
              <p className="mt-3 text-xs uppercase tracking-[0.28em] text-stone-500">Monthly rent</p>
              <p className="mt-2 text-2xl font-semibold text-stone-900">{rentStatus}</p>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border-stone-200 bg-white">
            <CardContent className="p-5">
              <Package className="h-5 w-5 text-sky-600" />
              <p className="mt-3 text-xs uppercase tracking-[0.28em] text-stone-500">Published products</p>
              <p className="mt-2 text-2xl font-semibold text-stone-900">{Number(profile?.productsPublishedCount || 0).toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border-stone-200 bg-white">
            <CardContent className="p-5">
              <Truck className="h-5 w-5 text-rose-600" />
              <p className="mt-3 text-xs uppercase tracking-[0.28em] text-stone-500">Store status</p>
              <p className="mt-2 text-2xl font-semibold text-stone-900">
                {String(profile?.storeStatus || "Awaiting verification").replace(/_/g, " ")}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-[28px] border-stone-200 bg-white">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-stone-900">Storefront setup checklist</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
                  Vendors will verify email, address, proof of address, NIN details, and face verification before the storefront goes live.
                </p>
              </div>
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/marketplace">Open Marketplace</Link>
              </Button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                "Email verification",
                "Address and proof of address",
                "NIN slip and face verification",
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 p-4">
                  <p className="font-medium text-stone-900">{item}</p>
                  <p className="mt-1 text-sm text-stone-600">This step is part of the vendor verification flow.</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-sm text-amber-900">
              <AlertCircle className="mr-2 inline-block h-4 w-4 align-[-2px]" />
              Your one-time setup fee and monthly rent tracking will appear here once the payment flow is enabled.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
