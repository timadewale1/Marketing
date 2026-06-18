"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { onAuthStateChanged, User } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import { auth, db } from "./firebase"

type AppRole = "advertiser" | "earner" | "marketer" | "vendor" | "admin"

type AppUser = {
  uid: string
  email: string | null
  role: AppRole
} | null

const AuthContext = createContext<{ user: AppUser }>({ user: null })

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AppUser>(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (firebaseUser) {
        const collections = ["vendors", "advertisers", "earners", "marketers", "admins", "users"]
        let resolvedRole: AppRole = "earner"

        for (const collectionName of collections) {
          const ref = doc(db, collectionName, firebaseUser.uid)
          const snap = await getDoc(ref)
          if (!snap.exists()) continue

          const data = snap.data()
          const roleValue = String(data?.role || "").trim().toLowerCase()
          resolvedRole =
            roleValue === "vendor"
              ? "vendor"
              : roleValue === "advertiser"
                ? "advertiser"
                : roleValue === "marketer"
                  ? "marketer"
                  : roleValue === "admin"
                    ? "admin"
                    : collectionName === "vendors"
                      ? "vendor"
                      : collectionName === "advertisers"
                        ? "advertiser"
                        : collectionName === "marketers"
                          ? "marketer"
                          : collectionName === "admins"
                            ? "admin"
                            : "earner"
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            role: resolvedRole,
          })
          return
        }

        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          role: "earner",
        })
      } else {
        setUser(null)
      }
    })
    return () => unsub()
  }, [])

  return (
    <AuthContext.Provider value={{ user }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
