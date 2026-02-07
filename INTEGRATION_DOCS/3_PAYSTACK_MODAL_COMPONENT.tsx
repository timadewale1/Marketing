/**
 * PAYSTACK MODAL COMPONENT
 * 
 * This component handles the Paystack payment modal integration.
 * It loads the Paystack SDK, initializes payment, and handles callbacks.
 * 
 * Usage:
 * <PaystackModal
 *   amount={5000}
 *   email="user@example.com"
 *   open={isOpen}
 *   onSuccess={(reference) => handlePaymentSuccess(reference)}
 *   onClose={() => handleClose()}
 * />
 */

import React, { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'

export type PaystackModalProps = {
  amount: number // Amount in Naira (not kobo)
  email?: string
  onSuccess: (reference: string) => void
  onClose: () => void
  open: boolean
  onReady?: () => void
}

let scriptLoadingPromise: Promise<void> | null = null

/**
 * Load Paystack SDK script from CDN
 * Caches the promise to prevent multiple script loads
 */
function loadPaystackScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'))

  // If Paystack already loaded, resolve immediately
  if (typeof window !== 'undefined' && (window as unknown as { PaystackPop?: unknown }).PaystackPop) {
    return Promise.resolve()
  }

  if (scriptLoadingPromise) return scriptLoadingPromise

  scriptLoadingPromise = new Promise<void>((resolve, reject) => {
    const existingById = document.getElementById('paystack-script')
    const existingBySrc = document.querySelector('script[src*="paystack.co"]')
    const existing = existingById || existingBySrc

    if (existing) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.id = 'paystack-script'
    script.src = 'https://js.paystack.co/v1/inline.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Paystack script failed to load'))
    document.body.appendChild(script)
  })

  return scriptLoadingPromise
}

export const PaystackModal: React.FC<PaystackModalProps> = ({
  amount,
  email,
  onSuccess,
  onClose,
  open,
  onReady,
}) => {
  const mounted = useRef(true)

  useEffect(() => {
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!open) return

    const start = async () => {
      const amountN = Number(amount || 0)
      if (!amountN || Number.isNaN(amountN) || amountN <= 0) {
        toast.error('Invalid payment amount')
        if (mounted.current) onClose()
        return
      }

      // Convert Naira to Kobo (Paystack uses kobo)
      const amountKobo = Math.round(amountN * 100)

      try {
        await loadPaystackScript()
      } catch (err) {
        console.error('Failed to load Paystack script', err)
        toast.error('Failed to load payment provider')
        if (mounted.current) onClose()
        return
      }

      const PaystackPop = (
        window as unknown as {
          PaystackPop?: {
            setup: (opts: Record<string, unknown>) => {
              openIframe?: () => void
            }
            open?: () => void
          }
        }
      ).PaystackPop

      if (!PaystackPop) {
        console.error('PaystackPop not available')
        toast.error('Payment provider failed to load')
        if (mounted.current) onClose()
        return
      }

      try {
        console.debug('Paystack initialization with amount:', amountN)

        const handler = PaystackPop.setup({
          key: process.env.NEXT_PUBLIC_PAYSTACK_KEY || '',
          email: email || 'no-reply@example.com',
          amount: amountKobo,
          currency: 'NGN',
          callback: function (response: { reference: string }) {
            try {
              console.log('Paystack callback received reference:', response.reference)
              // Store reference for recovery if needed
              try {
                ;(window as Window & { __paystack_last_reference?: string }).__paystack_last_reference =
                  response.reference
              } catch (e) {
                // Ignore
              }
              // Call onSuccess regardless of mounted state so verification runs
              try {
                onSuccess(response.reference)
              } catch (cbErr) {
                console.error('Error invoking onSuccess callback', cbErr)
              }
            } catch (e) {
              console.error('Error in Paystack callback handler', e)
            }
          },
          onClose: function () {
            try {
              if (mounted.current) onClose()
            } catch (e) {
              console.error('Error in Paystack onClose', e)
            }
          },
        })

        if (handler && typeof handler.openIframe === 'function') {
          try {
            if (typeof onReady === 'function') onReady()
          } catch (e) {
            // Ignore
          }
          handler.openIframe()
        }
      } catch (err) {
        console.error('Failed to initialize Paystack payment', err)
        toast.error('Failed to initialize payment')
        if (mounted.current) onClose()
      }
    }

    start()
  }, [open, amount, email, onClose, onSuccess, onReady])

  return null
}

export default PaystackModal
