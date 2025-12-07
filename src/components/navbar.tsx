"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Menu, X, Smartphone } from "lucide-react"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice?: { outcome: string; platform?: string }
}

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstall, setShowInstall] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      // Prevent automatic prompt
      e.preventDefault()
      const evt = e as BeforeInstallPromptEvent
      // don't show the install prompt UI repeatedly if user already dismissed or installed
      try {
        const installed = localStorage.getItem('pwa_installed')
        const dismissed = localStorage.getItem('pwa_install_dismissed')
        if (installed === '1' || dismissed === '1') return
      } catch {
        /* ignore */
      }
      setDeferredPrompt(evt)
      setShowInstall(true)
    }

    window.addEventListener("beforeinstallprompt", handler)

    return () => {
      window.removeEventListener("beforeinstallprompt", handler)
    }
  }, [])

  // Register the service worker (helps with PWA installability on HTTPS hosts)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(() => {
        // registration successful
      }).catch(() => {
        // registration failed (ignored)
      })
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    setShowInstall(false)
    setDeferredPrompt(null)
    try {
      if (choice && (choice as any).outcome === 'dismissed') {
        localStorage.setItem('pwa_install_dismissed', '1')
      }
    } catch {
      /* ignore */
    }
    console.log("PWA install choice:", choice)
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-white/60 backdrop-blur-md border-b border-stone-200">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-3">
          <span className="bg-amber-500 text-stone-900 px-3 py-1 rounded-md font-bold">ADJ</span>
          <span className="font-semibold text-stone-900 text-lg">AllDaysJoy</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <a href="#howitworks" className="text-stone-700 hover:text-amber-500">How it works</a>
          <a href="#why" className="text-stone-700 hover:text-amber-500">Why choose us</a>
          <a href="#features" className="text-stone-700 hover:text-amber-500">Features</a>
          <a href="#cta" className="text-stone-700 hover:text-amber-500">Get started</a>
        </nav>

        <div className="flex items-center gap-3">
          {showInstall && (
            // desktop/tablet button
            <button onClick={handleInstall} className="hidden md:inline-flex items-center gap-2 bg-amber-500 text-stone-900 px-3 py-1 rounded-md text-sm">
              <Smartphone className="w-4 h-4" /> Add to home
            </button>
          )}

          {showInstall && (
            // mobile button (visible on small screens)
            <button onClick={handleInstall} className="md:hidden p-2 rounded-md bg-amber-500 text-stone-900">
              <Smartphone className="w-5 h-5" />
            </button>
          )}

          <div className="md:hidden">
            <button onClick={() => setOpen(!open)} className="p-2 rounded-md text-stone-700 hover:bg-stone-100">
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="md:hidden bg-white border-t border-stone-100">
          <div className="px-4 py-4 space-y-3">
            <a href="#howitworks" onClick={() => setOpen(false)} className="block">How it works</a>
            <a href="#why" onClick={() => setOpen(false)} className="block">Why choose us</a>
            <a href="#features" onClick={() => setOpen(false)} className="block">Features</a>
            <a href="#cta" onClick={() => setOpen(false)} className="block">Get started</a>
            {showInstall && (
              <button onClick={() => { handleInstall(); setOpen(false); }} className="w-full text-left mt-2 inline-flex items-center gap-2 bg-amber-500 text-stone-900 px-3 py-2 rounded-md text-sm">
                <Smartphone className="w-4 h-4" /> Install App
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
