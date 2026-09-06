"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCircle2, X } from "lucide-react";

const DISMISSED_KEY = "pamba-platform-updates-2026-09";

export default function PlatformUpdatesPrompt() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(DISMISSED_KEY) !== "1");
    } catch {
      setOpen(true);
    }
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Ignore storage failures.
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-950/50 p-4">
      <div className="relative w-full max-w-lg rounded-3xl border border-amber-200 bg-white p-6 shadow-2xl sm:p-8">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close updates"
          className="absolute right-4 top-4 rounded-full p-2 text-stone-500 hover:bg-stone-100"
        >
          <X size={18} />
        </button>
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-700">
          <Bell size={22} />
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[.18em] text-amber-700">
          New on PAMBA
        </p>
        <h2 className="mt-2 text-2xl font-black text-stone-900">
          Your account just got better
        </h2>
        <div className="mt-5 space-y-3 text-sm leading-6 text-stone-600">
          <p className="flex gap-2">
            <CheckCircle2 className="mt-1 shrink-0 text-amber-600" size={16} />
            Referral bonuses now follow up to four levels with clearer payment
            records.
          </p>
          <p className="flex gap-2">
            <CheckCircle2 className="mt-1 shrink-0 text-amber-600" size={16} />
            The activation experience now uses the updated membership fee and
            shows clearer wallet activity.
          </p>
          <p className="flex gap-2">
            <CheckCircle2 className="mt-1 shrink-0 text-amber-600" size={16} />
            Skills & Services is now available for listing skills, finding
            professionals, and connecting with customers.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="mt-7 w-full rounded-xl bg-amber-500 px-5 py-3 font-bold text-stone-900 hover:bg-amber-400"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
