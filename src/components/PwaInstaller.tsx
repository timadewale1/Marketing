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
    // Paystack disabled - using Monnify only
    async function handlePaystackReturn() {
      try {
        // Paystack redirect handling disabled - using Monnify only
        console.log('Paystack redirect handling disabled - using Monnify only')
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