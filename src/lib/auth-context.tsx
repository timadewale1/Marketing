"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { onAuthStateChanged, User } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import { auth, db } from "./firebase"

type AppUser = {
  uid: string
  email: string | null
  role: "advertiser" | "earner" | "marketer" | "admin"
} | null

const AuthContext = createContext<{ user: AppUser }>({ user: null })

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AppUser>(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (firebaseUser) {
        // fetch role from Firestore
        const ref = doc(db, "users", firebaseUser.uid)
        const snap = await getDoc(ref)
        const data = snap.data()
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          role: data?.role || "earner",
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
