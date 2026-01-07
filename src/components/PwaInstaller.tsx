'use client';

import { useEffect } from 'react';
import { toast } from 'react-hot-toast'
import { auth } from '@/lib/firebase'

// Define the BeforeInstallPromptEvent interface that browsers implement
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }
}

export default function PwaInstaller() {
  useEffect(() => {
    // register service worker if supported
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    }

    // We only register the service worker and listen for `appinstalled` here.
    // Do NOT call `prompt()` from this hook — that must happen as a result of
    // a user gesture (button click). The Navbar already listens for
    // `beforeinstallprompt` and will call prompt on user click.

    function handleAppInstalled() {
      localStorage.setItem('pwa_installed', '1');
    }

    window.addEventListener('appinstalled', handleAppInstalled);

    // If Paystack redirected back to our site with a reference, attempt to verify
    async function handlePaystackReturn() {
      try {
        const params = new URLSearchParams(window.location.search)
        const reference = params.get('reference') || params.get('trxref')
        if (!reference) return

        const pendingRaw = localStorage.getItem('pamba_pending_payment')
        if (!pendingRaw) return
        const pending = JSON.parse(pendingRaw)

        // enrich with userId if available
        const userId = auth.currentUser?.uid || pending.userId
        const body = { reference, ...pending, userId }
        console.log('Detected Paystack redirect, verifying payment', body)

        const res = await fetch('/api/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json().catch(() => ({}))
        console.log('verify-payment (redirect) response', res.status, data)
        if (res.ok) {
          toast.success('Payment verified')
          localStorage.removeItem('pamba_pending_payment')
        } else {
          toast.error(data?.message || 'Payment verification failed')
        }

        // remove query params so user doesn't re-trigger on refresh
        try {
          const url = new URL(window.location.href)
          url.search = ''
          window.history.replaceState({}, document.title, url.toString())
        } catch (e) {
          /* ignore */
        }
      } catch (err) {
        console.error('Error handling paystack return', err)
      }
    }

    handlePaystackReturn()

    return () => {
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  return null;
}