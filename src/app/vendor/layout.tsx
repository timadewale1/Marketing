"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { doc, onSnapshot } from "firebase/firestore"
import {
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  UserCircle,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { auth, db } from "@/lib/firebase"

const VENDOR_NAV_SECTIONS = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", path: "/vendor", icon: LayoutDashboard },
      { label: "Products", path: "/vendor/products", icon: Package },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Profile", path: "/vendor/profile", icon: UserCircle },
      { label: "Settings", path: "/vendor", icon: Settings },
    ],
  },
]

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [name, setName] = useState("Vendor")
  const [profilePic, setProfilePic] = useState("")

  useEffect(() => {
    let unsubProfile: (() => void) | null = null
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/auth/sign-in")
        return
      }
      unsubProfile = onSnapshot(doc(db, "vendors", user.uid), (snap) => {
        if (!snap.exists()) return
        const data = snap.data() as Record<string, unknown>
        setName(String(data.name || "Vendor"))
        setProfilePic(String(data.profilePic || ""))
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
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-cyan-100 to-stone-300 flex flex-col">
      <header className="flex justify-between items-center px-6 py-4 bg-white/60 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="p-2 bg-white rounded-lg shadow"
          >
            <Menu size={20} />
          </button>
          <h1 className="font-semibold text-stone-800 text-lg">Vendor Dashboard</h1>
        </div>
        <div className="h-10 w-10 rounded-full overflow-hidden border-2 border-cyan-400">
          {profilePic ? (
            <Image src={profilePic} alt="profile" width={80} height={80} className="w-full h-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-cyan-300 font-bold text-stone-900">
              {name.charAt(0)}
            </div>
          )}
        </div>
      </header>

      <aside
        className={`fixed top-0 left-0 z-50 flex h-full w-80 flex-col border-r border-cyan-100 bg-[linear-gradient(180deg,_rgba(236,254,255,0.98),_rgba(255,255,255,0.96))] backdrop-blur-md shadow transform transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="shrink-0 p-4">
          <div className="rounded-3xl border border-cyan-200 bg-white/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-700">Vendor menu</p>
                <h2 className="mt-2 text-lg font-semibold text-stone-800">{name}</h2>
                <p className="mt-1 text-xs text-stone-500">Manage your store, products, and account details.</p>
              </div>
              <div className="h-12 w-12 overflow-hidden rounded-2xl border border-cyan-200 bg-cyan-100">
                {profilePic ? (
                  <Image src={profilePic} alt="profile" width={48} height={48} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-bold text-stone-900">
                    {name.charAt(0)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between px-4 pb-2">
          <h2 className="text-lg font-semibold text-stone-800">Navigation</h2>
          <button onClick={() => setSidebarOpen(false)} className="rounded-lg p-2 hover:bg-stone-100">
            <X size={18} />
          </button>
        </div>
        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          {VENDOR_NAV_SECTIONS.map((section) => (
            <div key={section.title} className="rounded-2xl border border-stone-200 bg-white/70 p-3">
              <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">{section.title}</p>
              <div className="mt-2 space-y-1">
                {section.items.map((item) => {
                  const active = pathname === item.path
                  return (
                    <button
                      key={item.path}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                        active ? "bg-cyan-700 text-white" : "text-stone-700 hover:bg-cyan-50 hover:text-stone-900"
                      }`}
                      onClick={() => {
                        setSidebarOpen(false)
                        router.push(item.path)
                      }}
                    >
                      <item.icon size={16} className={active ? "text-white" : "text-cyan-700"} />
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="shrink-0 border-t p-4">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 rounded-xl bg-white/80 text-sm"
            onClick={() => void logout()}
          >
            <LogOut size={16} className="mr-2" /> Logout
          </Button>
        </div>
      </aside>

      <main className="flex-1 px-6 py-8 max-w-6xl mx-auto w-full">{children}</main>
    </div>
  )
}
