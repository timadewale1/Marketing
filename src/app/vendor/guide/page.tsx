"use client"

import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { ArrowLeft, BellRing, BookOpen, ClipboardList, ShieldCheck, Store, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const STEPS = [
  {
    title: "Create your vendor account",
    body: "Sign up as Pamba Marketplace Seller from the marketplace signup route. This keeps your account separate from earners and advertisers.",
  },
  {
    title: "Fill the verification form",
    body: "Enter your business address, city, state, NIN number, proof of address, NIN slip, store cover image, bank details, and live facial capture. Every field is required before submission.",
  },
  {
    title: "Wait for admin review",
    body: "After you submit, the admin reviews your documents. You will get an email if your verification is approved or rejected, and the reason will be shown on your dashboard if it is rejected.",
  },
  {
    title: "Pay the setup fee",
    body: "Once verified, pay the one-time setup fee through the same Monnify payment flow already used elsewhere on the platform.",
  },
  {
    title: "Start your shop",
    body: "After setup is complete, your dashboard becomes your full vendor workspace where you can add products, upload images, add variations, manage shop details, and copy your shop link to share with customers.",
  },
  {
    title: "Keep your store active",
    body: "The first month is free after setup. Monthly rent starts the following month. If rent is overdue, the store is put on hold until payment is made.",
  },
]

const ALERTS = [
  "Verification submitted",
  "Verification approved or rejected",
  "Setup fee confirmed",
  "Monthly rent reminder",
  "Store status changes",
]

export default function VendorGuidePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-cyan-100 to-stone-300 px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="ghost">
            <Link href="/vendor">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to dashboard
            </Link>
          </Button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-700">Vendor guide</p>
            <h1 className="mt-1 text-3xl font-semibold text-stone-900">Everything a Pamba Store seller needs to know</h1>
          </div>
        </div>

        <Card className="rounded-[28px] border-cyan-100 bg-white shadow-[0_24px_80px_-60px_rgba(8,145,178,0.55)]">
          <CardContent className="grid gap-4 p-6 md:grid-cols-2 md:p-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">
                <BookOpen className="h-4 w-4" />
                Quick overview
              </div>
              <p className="mt-4 text-sm leading-7 text-stone-600">
                Your vendor account is a separate business workspace. You verify your details first, pay the setup fee through Monnify, then use your dashboard to manage products, shop settings, store visibility, referrals, transactions, wallet activity, and task creation.
              </p>
              <p className="mt-3 text-sm leading-7 text-stone-600">
                The marketplace side shows your public shop page. Customers can open your shop, copy your product link, and contact you using the method you choose inside your product or shop settings.
              </p>
            </div>
            <div className="rounded-3xl border border-cyan-100 bg-cyan-50/70 p-5">
              <p className="text-sm font-semibold text-cyan-900">Email alerts you will receive</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-cyan-950/80">
                {ALERTS.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <BellRing className="mt-1 h-4 w-4 flex-none text-cyan-700" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {STEPS.map((step, index) => (
            <Card key={step.title} className="rounded-[26px] border-stone-200 bg-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-50 text-sm font-semibold text-cyan-700">
                    {index + 1}
                  </div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500">Step {index + 1}</p>
                </div>
                <h2 className="mt-4 text-xl font-semibold text-stone-900">{step.title}</h2>
                <p className="mt-2 text-sm leading-7 text-stone-600">{step.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <InfoCard icon={Store} title="What you can do" body="Update your shop profile, copy your public shop link, publish products, create vendor tasks, and track your store performance." />
          <InfoCard icon={Upload} title="What you upload" body="Proof of address, NIN slip, facial capture, store cover image, product images, and any product variations or supporting media." />
          <InfoCard icon={ClipboardList} title="What customers see" body="Your public shop page, your products, your product links, and the contact method you choose for purchase follow-up." />
        </div>

        <Card className="rounded-[26px] border-stone-200 bg-white">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-cyan-700" />
              <h2 className="text-xl font-semibold text-stone-900">Important notes</h2>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <NoteCard title="Setup fee" body="The one-time setup fee is required after approval, and the payment uses the same Monnify payment flow already used elsewhere in the app." />
              <NoteCard title="Monthly rent" body="The first month starts after setup. After that, monthly rent keeps the storefront active and visible in the marketplace." />
              <NoteCard title="Verification" body="If admin rejects your verification, the rejection reason is shown on your dashboard so you can correct it and resubmit." />
              <NoteCard title="Need help?" body="Use this guide page anytime if you forget the steps. The one-time pop-up on login is just a quick reminder; this page stays available." />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function InfoCard({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <Card className="rounded-[26px] border-stone-200 bg-white">
      <CardContent className="p-6">
        <Icon className="h-6 w-6 text-cyan-700" />
        <h3 className="mt-4 text-lg font-semibold text-stone-900">{title}</h3>
        <p className="mt-2 text-sm leading-7 text-stone-600">{body}</p>
      </CardContent>
    </Card>
  )
}

function NoteCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-sm font-semibold text-stone-900">{title}</p>
      <p className="mt-1 text-sm leading-7 text-stone-600">{body}</p>
    </div>
  )
}
