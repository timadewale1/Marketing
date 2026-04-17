"use client"

import React, { useState } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { toast } from "react-hot-toast"
import Link from "next/link"
import { useRouter } from "next/navigation"

export default function AdvertiseDirectlyPage() {
  const router = useRouter()
  const [businessName, setBusinessName] = useState("")
  const [contactName, setContactName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [advertType, setAdvertType] = useState("")
  const [duration, setDuration] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!businessName || !contactName || !phone || !email) {
      toast.error("Please complete required fields")
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch("/api/direct-ad-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          businessName,
          contactName,
          email,
          phone,
          advertType,
          duration,
          message,
        }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        toast.error(result.message || "Failed to submit request")
        return
      }

      toast.success("Thanks, your request has been submitted")
      router.push("/advertise-directly/thank-you")
    } catch (error) {
      console.error(error)
      toast.error("Failed to submit, please try again")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 via-amber-100 to-stone-200 py-12">
      <div className="container mx-auto max-w-5xl px-4">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="overflow-hidden border-none bg-stone-900 text-stone-50 shadow-xl">
            <div className="bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.35),_transparent_45%),linear-gradient(135deg,_rgba(41,37,36,0.98),_rgba(17,24,39,0.95))] p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Homepage advert placement</p>
              <h1 className="mt-3 text-3xl font-semibold leading-tight md:text-4xl">
                Advertise directly on the Pamba homepage
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-200">
                This page is only for businesses that want our team to place a banner, feature, or promotional advert directly on the homepage. It is not for creating earner tasks or campaign jobs inside the platform.
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <h2 className="text-sm font-semibold text-amber-200">Use this form if you want to</h2>
                  <ul className="mt-3 space-y-2 text-sm text-stone-200">
                    <li>Place a homepage banner or featured promotion</li>
                    <li>Run a direct brand visibility placement</li>
                    <li>Work with our team on a homepage advert slot</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-amber-400/30 bg-amber-300/10 p-4">
                  <h2 className="text-sm font-semibold text-amber-200">Do not use this form for tasks</h2>
                  <p className="mt-3 text-sm leading-6 text-stone-100">
                    If you want people to carry out tasks for your business, sign up as an advertiser and create tasks normally from your advertiser dashboard.
                  </p>
                  <Button asChild className="mt-4 bg-amber-400 text-stone-900 hover:bg-amber-300">
                    <Link href="/auth/sign-up">Sign up as an advertiser</Link>
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <Card className="border-none bg-white/85 p-6 shadow-lg backdrop-blur">
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-amber-950">
                This request is for direct homepage adverts only.
              </p>
              <p className="mt-1 text-sm text-stone-700">
                If you need normal task creation instead, please create a regular advertiser account and post tasks from there.
              </p>
            </div>

            <h2 className="text-xl font-semibold text-stone-900">Send a homepage advert request</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Fill this form and our team will reach out to confirm placement options, pricing, and the best homepage slot for your advert.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-stone-500">Business name *</label>
                <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-stone-500">Contact person *</label>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-stone-500">Phone *</label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-stone-500">Email *</label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-stone-500">Homepage advert type</label>
                  <Input
                    value={advertType}
                    onChange={(e) => setAdvertType(e.target.value)}
                    placeholder="e.g., banner, featured brand, homepage video"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-stone-500">Preferred duration</label>
                  <Input
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="e.g., 3 days, 1 week, 1 month"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-stone-500">Advert details / requirements</label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us what you want displayed on the homepage, your brand goal, preferred dates, and any materials you already have."
                />
              </div>

              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                Need task-based promotion instead? Use the normal advertiser flow after signing up, then create a task from your dashboard.
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-amber-500 text-stone-900 hover:bg-amber-600"
                >
                  {submitting ? "Submitting..." : "Send homepage advert request"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  )
}
