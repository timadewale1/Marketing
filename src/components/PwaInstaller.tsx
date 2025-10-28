'use client';

import { useEffect } from 'react';

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

    // Prompt handling
    let deferredPrompt: BeforeInstallPromptEvent | null = null;

    function handleBeforeInstall(e: BeforeInstallPromptEvent) {
      e.preventDefault();
      // Save the event so we can trigger it later.
      deferredPrompt = e;
      
      // Attempt to prompt immediately
      if (deferredPrompt) {
        try {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(({ outcome }) => {
            if (outcome === 'accepted') {
              localStorage.setItem('pwa_installed', '1');
            }
          });
          deferredPrompt = null;
        } catch (err) {
          // Some browsers may block if user previously dismissed; that's expected
          console.warn('PWA prompt blocked:', err);
        }
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // If app is installed, browsers fire 'appinstalled'
    window.addEventListener('appinstalled', () => {
      localStorage.setItem('pwa_installed', '1');
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  return null;
}