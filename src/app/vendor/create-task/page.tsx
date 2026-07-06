"use client"

import { useEffect, useState } from "react"
import { onAuthStateChanged } from "firebase/auth"
import { doc, onSnapshot } from "firebase/firestore"
import { useRouter } from "next/navigation"
import { auth, db } from "@/lib/firebase"

export default function VendorCreateTaskRedirectPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/auth/sign-in?marketplace=1")
        return
      }
      const unsubProfile = onSnapshot(doc(db, "vendors", user.uid), (snap) => {
        const data = snap.data() || {}
        const verificationStatus = String(data.vendorVerificationStatus || "").toLowerCase()
        const setupPaid = String(data.vendorPaymentStatus || "").toLowerCase() === "paid"
        const verified = verificationStatus === "verified" || verificationStatus === "approved"
        if (!verified || !setupPaid) {
          router.replace("/vendor")
          return
        }
        setReady(true)
        router.replace("/advertiser/create-campaign?owner=vendor")
      })
      return () => unsubProfile()
    })

    return () => unsubAuth()
  }, [router])

  return <div className="flex min-h-[40vh] items-center justify-center text-sm text-stone-600">{ready ? "Opening vendor task creation..." : "Checking vendor access..."}</div>
}
