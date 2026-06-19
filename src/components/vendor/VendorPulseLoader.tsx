"use client"

import { Store } from "lucide-react"

export default function VendorPulseLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-[360px] items-center justify-center">
      <div className="relative flex w-full max-w-md flex-col items-center rounded-3xl border border-cyan-100 bg-white/80 p-8 text-center shadow-[0_30px_80px_-60px_rgba(8,145,178,0.55)]">
        <div className="absolute -top-8 h-20 w-20 rounded-full bg-cyan-100/80 blur-xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-100">
          <Store className="h-8 w-8 animate-pulse text-cyan-700" />
        </div>
        <p className="mt-5 text-sm font-semibold uppercase tracking-[0.24em] text-cyan-700">Pamba Store</p>
        <p className="mt-3 text-base text-stone-700">{label}</p>
        <div className="mt-5 flex items-center gap-2">
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-cyan-500 [animation-delay:-0.25s]" />
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-cyan-400 [animation-delay:-0.15s]" />
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-cyan-300" />
        </div>
      </div>
    </div>
  )
}
