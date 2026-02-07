"use client"

import { useEffect, useState } from "react"
import toast from 'react-hot-toast'
import Link from "next/link"
import Image from "next/image"
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
      const evt = e as BeforeInstallPromptEvent
      // don't show the install prompt UI repeatedly if user already dismissed or installed
      try {
        const installed = localStorage.getItem('pwa_installed')
        const dismissed = localStorage.getItem('pwa_install_dismissed')
        if (installed === '1' || dismissed === '1') return
      } catch {
        /* ignore */
      }
      // attempt to show the install prompt immediately (browsers may still require user gesture)
      try {
        evt.prompt && evt.prompt()
      } catch (err) {
        // if prompt fails, save it for later use via button
        setDeferredPrompt(evt)
        setShowInstall(true)
      }
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
    if (!deferredPrompt) {
      toast('To install the app: open your browser menu and choose "Install" or "Add to Home screen"', { icon: '📥' })
      return
    }

    try {
      deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice

      setShowInstall(false)
      setDeferredPrompt(null)

      try {
        const userChoice = choice as { outcome: string; platform?: string } | undefined

        if (userChoice?.outcome === 'dismissed') {
          localStorage.setItem('pwa_install_dismissed', '1')
        }
      } catch {
        /* ignore */
      }

      console.log("PWA install choice:", choice)
    } catch (err) {
      console.warn('Install prompt failed', err)
      toast('To install the app: open your browser menu and choose "Install" or "Add to Home screen"', { icon: '📥' })
    }
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-white border-b border-stone-200 shadow-sm">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-3">
          <Image src="/Pamba.png" alt="PAMBA" width={120} height={50} className="rounded-md" />
          <span className="sr-only">PAMBA</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <a href="#howitworks" className="text-stone-900 hover:text-amber-500">How it works</a>
          <a href="#about" className="text-stone-900 hover:text-amber-500">About us</a>
          <a href="#features" className="text-stone-900 hover:text-amber-500">Features</a>
          <a href="#cta" className="text-stone-900 hover:text-amber-500">Get started</a>
        </nav>

        <div className="flex items-center gap-3">
          {/* desktop/tablet button */}
          <button onClick={handleInstall} className="hidden md:inline-flex items-center gap-2 bg-amber-500 text-stone-900 px-3 py-1 rounded-md text-sm">
            <Smartphone className="w-4 h-4" /> Add to home
          </button>

          {/* mobile button (visible on small screens) */}
          <button onClick={handleInstall} className="md:hidden p-2 rounded-md bg-amber-500 text-stone-900">
            <Smartphone className="w-5 h-5" />
          </button>

          <div className="md:hidden">
            <button onClick={() => setOpen(!open)} className="p-2 rounded-md text-stone-900 hover:bg-stone-100">
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="md:hidden bg-white border-t border-stone-100">
          <div className="px-4 py-4 space-y-3">
            <a href="#howitworks" onClick={() => setOpen(false)} className="block">How it works</a>
            <a href="#about" onClick={() => setOpen(false)} className="block">About us</a>
            <a href="#features" onClick={() => setOpen(false)} className="block">Features</a>
            <a href="#cta" onClick={() => setOpen(false)} className="block">Get started</a>
            <button onClick={() => { handleInstall(); setOpen(false); }} className="w-full text-left mt-2 inline-flex items-center gap-2 bg-amber-500 text-stone-900 px-3 py-2 rounded-md text-sm">
              <Smartphone className="w-4 h-4" /> Install App
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
