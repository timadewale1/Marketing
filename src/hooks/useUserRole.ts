"use client"

import { useEffect, useState } from "react"
import { auth, db } from "@/lib/firebase"
import { doc, getDoc } from "firebase/firestore"
import { onAuthStateChanged } from "firebase/auth"

export function useUserRole() {
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setRole(null)
        setLoading(false)
        return
      }

      // Check across all collections
      const collections = ["advertisers", "earners", "marketers", "admins"]
      for (const coll of collections) {
        const ref = doc(db, coll, user.uid)
        const snap = await getDoc(ref)
        if (snap.exists()) {
          setRole(snap.data().role || coll.slice(0, -1)) // prefer Firestore role
          break
        }
      }
      setLoading(false)
    })

    return () => unsub()
  }, [])

  return { role, loading }
}
