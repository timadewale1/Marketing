"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { auth, db } from "@/lib/firebase"
import { doc, onSnapshot } from "firebase/firestore"
import { LayoutDashboard, LogOut, Menu, Package, Store, X } from "lucide-react"

const NAV_ITEMS = [
  { href: "/vendor", label: "Dashboard", icon: LayoutDashboard },
  { href: "/vendor/products", label: "Products", icon: Package },
]

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("Vendor")

  useEffect(() => {
    let unsubProfile: (() => void) | null = null
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/auth/sign-in")
        return
      }
      unsubProfile = onSnapshot(doc(db, "vendors", user.uid), (snap) => {
        if (!snap.exists()) return
        setName(String(snap.data().name || "Vendor"))
      })
    })
    return () => {
      unsub()
      if (unsubProfile) unsubProfile()
    }
  }, [router])

  const logout = async () => {
    await signOut(auth)
    router.push("/auth/sign-in")
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f0fdff_0%,#f8fafc_100%)]">
      <header className="sticky top-0 z-40 border-b border-cyan-100 bg-white/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className="rounded-xl border border-cyan-100 bg-cyan-50 p-2 text-cyan-800 lg:hidden"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-cyan-100 p-2">
                <Store className="h-5 w-5 text-cyan-800" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">Pamba Vendor</p>
                <p className="text-sm font-semibold text-stone-800">{name}</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => void logout()}
            className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className={`${open ? "block" : "hidden"} rounded-3xl border border-cyan-100 bg-white p-4 shadow-sm lg:block`}>
          <p className="px-3 text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Navigation</p>
          <div className="mt-2 space-y-2">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition ${
                    active ? "bg-cyan-700 text-white" : "text-stone-700 hover:bg-cyan-50"
                  }`}
                >
                  <item.icon size={16} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  )
}
