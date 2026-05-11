"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { FileCheck, LayoutList, LogOut, Users } from "lucide-react"
import { signOut } from "firebase/auth"
import toast from "react-hot-toast"
import { auth } from "@/lib/firebase"
import { Button } from "@/components/ui/button"

const NAV_ITEMS = [
  { href: "/submissionmanagement/campaigns", label: "Campaigns", icon: LayoutList },
  { href: "/submissionmanagement/submissions", label: "Submissions", icon: FileCheck },
  { href: "/submissionmanagement/earners", label: "Earners", icon: Users },
]

export default function SubmissionManagementShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    try {
      await fetch("/api/submissionmanagement/logout", { method: "POST", credentials: "include" })
      await signOut(auth).catch(() => undefined)
      toast.success("Signed out")
      router.push("/submissionmanagement/login")
    } catch (error) {
      console.error(error)
      toast.error("Could not sign out")
    }
  }

  return (
    <div className="min-h-screen bg-stone-100">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-6 lg:px-6">
        <aside className="hidden w-72 shrink-0 rounded-[28px] border border-stone-200 bg-white p-5 shadow-[0_24px_60px_-40px_rgba(28,25,23,0.45)] lg:flex lg:flex-col">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-stone-500">Pamba</p>
            <h1 className="mt-2 text-2xl font-semibold text-stone-900">Submission Management</h1>
            <p className="mt-2 text-sm leading-6 text-stone-500">A focused dashboard for campaign review and submission moderation.</p>
          </div>
          <nav className="mt-8 space-y-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    active ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="mt-auto">
            <Button onClick={handleLogout} variant="outline" className="w-full rounded-2xl border-stone-300">
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <div className="mb-4 flex items-center justify-between rounded-[24px] border border-stone-200 bg-white px-4 py-3 shadow-sm lg:hidden">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Pamba</p>
              <p className="text-sm font-semibold text-stone-900">Submission Management</p>
            </div>
            <Button onClick={handleLogout} variant="outline" size="sm" className="rounded-full border-stone-300">
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
          <main className="flex-1 rounded-[28px] border border-stone-200 bg-white p-4 shadow-[0_24px_60px_-40px_rgba(28,25,23,0.45)] sm:p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
