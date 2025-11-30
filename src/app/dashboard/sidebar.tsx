"use client"

import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Briefcase, Users, Wallet, BarChart, Menu } from "lucide-react"
import { useUserRole } from "@/hooks/useUserRole"

const navItems = [
  { href: "/advertiser", label: "Tasks", icon: Briefcase, roles: ["advertiser"] },
  { href: "/earner", label: "Referrals", icon: Users, roles: ["earner"] },
  { href: "/marketer", label: "Leads", icon: Users, roles: ["marketer"] },
  { href: "/wallet", label: "Wallet", icon: Wallet, roles: ["advertiser", "earner", "marketer"] },
  { href: "/admin", label: "Admin Panel", icon: BarChart, roles: ["admin"] },
]

export default function Sidebar({
  collapsed,
  setCollapsed,
}: {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
}) {
  const pathname = usePathname()
  const { role, loading } = useUserRole()  // 🔥 real role detection

  if (loading) {
    return <div className="p-4 text-stone-400">Loading...</div>
  }

  if (!role) {
    return <div className="p-4 text-red-400">No role assigned</div>
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-stone-800">
        {!collapsed && <h1 className="text-xl font-bold text-amber-400">MyApp</h1>}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 rounded-lg hover:bg-stone-800"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-2">
        {navItems
          .filter((item) => item.roles.includes(role))
          .map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <a
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-all",
                  active
                    ? "bg-amber-500 text-stone-900 font-semibold"
                    : "text-stone-300 hover:bg-stone-800 hover:text-white"
                )}
              >
                <item.icon size={18} />
                {!collapsed && <span>{item.label}</span>}
              </a>
            )
          })}
      </nav>

      {/* Footer */}
      <div className="p-4 text-xs text-stone-500">
        {!collapsed && "© 2025 MyApp"}
      </div>
    </div>
  )
}
