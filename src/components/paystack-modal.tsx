import React, { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'

export type PaystackModalProps = {
  amount: number // final amount in Naira (includes any markup)
  email?: string
  onSuccess: (reference: string) => void
  onClose: () => void
  open: boolean
}

let scriptLoadingPromise: Promise<void> | null = null

function loadPaystackScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'))
  // If Paystack already loaded, resolve immediately
  if (typeof window !== 'undefined' && (window as unknown as { PaystackPop?: unknown }).PaystackPop) return Promise.resolve()
  if (scriptLoadingPromise) return scriptLoadingPromise

  scriptLoadingPromise = new Promise<void>((resolve, reject) => {
    const existingById = document.getElementById('paystack-script')
    const existingBySrc = document.querySelector('script[src*="paystack.co"]')
    const existing = existingById || existingBySrc
    if (existing) {
      // give the browser a short tick to initialise
      setTimeout(() => resolve(), 50)
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

export const PaystackModal: React.FC<PaystackModalProps> = ({ amount, email, onSuccess, onClose, open }) => {
  const mounted = useRef(true)

  useEffect(() => {
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
  if (!open) return

  startPayment()
}, [open])


    const start = async () => {

      const key = process.env.NEXT_PUBLIC_PAYSTACK_KEY || ''
      if (!key) {
        console.error('Missing NEXT_PUBLIC_PAYSTACK_KEY')
        toast.error('Payment key not configured')
        if (mounted.current) onClose()
        return
      }

      const amountN = Number(amount || 0)
      if (!amountN || Number.isNaN(amountN) || amountN <= 0) {
        toast.error('Invalid payment amount')
        if (mounted.current) onClose()
        return
      }

      const amountKobo = Math.round(amountN * 100)

      try {
        await loadPaystackScript()
      } catch (err) {
        console.error('Failed to load Paystack script', err)
        toast.error('Failed to load payment provider')
        if (mounted.current) onClose()
        return
      }

      const PaystackPop = (window as unknown as { PaystackPop?: { setup: (opts: Record<string, unknown>) => { openIframe?: () => void }; open?: () => void } }).PaystackPop
      if (!PaystackPop) {
        console.error('PaystackPop not available')
        toast.error('Payment provider failed to load')
        if (mounted.current) onClose()
        return
      }

      try {
        console.debug('Paystack start: onSuccess type', typeof onSuccess, 'onClose type', typeof onClose)
        const handler = PaystackPop.setup({
          key,
          email: email || 'no-reply@example.com',
          amount: amountKobo,
          currency: 'NGN',
          callback: function (response: { reference: string }) {
            try {
              console.log('Paystack callback received reference:', response.reference)
              if (mounted.current) onSuccess(response.reference)
            } catch (e) { console.error('Error in Paystack callback handler', e) }
          },
          onClose: function () {
            try { if (mounted.current) onClose() } catch (e) { console.error('Error in Paystack onClose', e) }
          },
        })

        if (handler && typeof handler.openIframe === 'function') {
          handler.openIframe()
        } else if (typeof PaystackPop.open === 'function') {
          PaystackPop.open()
        } else {
          console.error('Paystack handler not usable')
          toast.error('Unable to open payment window')
        }
      } catch (err) {
        console.error('Error starting Paystack', err)
        toast.error('Payment initialization failed')
        if (mounted.current) onClose()
      }
    }

    start()

    return () => { /* cleanup */ }
  }, [open, amount, email, onSuccess, onClose])

  return null
}
const startPayment = async () => {
  await start()
}
function startPayment() {
  throw new Error('Function not implemented.')
}

