"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { signInWithCustomToken } from "firebase/auth"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { auth } from "@/lib/firebase"

export default function SubmissionManagementLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/submissionmanagement/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.authenticated || !data?.customToken) {
        throw new Error(data?.message || "Login failed")
      }

      await signInWithCustomToken(auth, data.customToken)
      toast.success("Access granted")
      router.push("/submissionmanagement/campaigns")
      router.refresh()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-950 via-stone-900 to-amber-950 px-4 py-10">
      <div className="mx-auto flex min-h-[80vh] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[32px] border border-white/10 bg-white/6 p-8 text-white backdrop-blur">
            <p className="text-xs uppercase tracking-[0.34em] text-amber-300">Pamba</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight">Submission Management</h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-stone-300">
              A dedicated moderation space for reviewing campaigns and processing proof submissions without stepping into the rest of the admin dashboard.
            </p>
          </div>

          <Card className="rounded-[32px] border border-stone-200 bg-white shadow-[0_40px_120px_-60px_rgba(0,0,0,0.7)]">
            <CardContent className="space-y-5 p-8">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Secure access</p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-900">Sign in</h2>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-700">Email</label>
                  <Input value={email} onChange={(event) => setEmail(event.target.value)} className="h-12 rounded-2xl border-stone-200" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-700">Password</label>
                  <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 rounded-2xl border-stone-200" />
                </div>
              </div>
              <Button onClick={handleSubmit} disabled={loading} className="h-12 w-full rounded-2xl bg-stone-900 text-white hover:bg-stone-800">
                {loading ? "Signing in..." : "Open dashboard"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

