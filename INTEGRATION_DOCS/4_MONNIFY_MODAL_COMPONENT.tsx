/**
 * MONNIFY MODAL COMPONENT
 * 
 * This component handles the Monnify payment modal integration.
 * It loads the Monnify SDK from CDN and initializes payment flow.
 * 
 * Key Points:
 * - Monnify SDK onComplete callback is TRUSTED for payment confirmation
 * - No backend verification needed; SDK callback means payment succeeded
 * - Global script loading with flag to prevent duplicates
 * - Cleanup uses setTimeout to avoid DOM reference errors from SDK
 * 
 * Usage:
 * <MonnifyModal
 *   amount={5000}
 *   email="user@example.com"
 *   contractCode="CONTRACT_CODE"
 *   open={isOpen}
 *   onSuccess={(response) => handlePaymentSuccess(response)}
 *   onClose={() => handleClose()}
 * />
 */

import React, { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'

export type MonnifyPaymentResponse = {
  transactionReference: string
  paymentReference: string
  paidOn: string
  paymentDescription: string
  metaData: Record<string, unknown>
  paymentMethod: string
  // ... other SDK response fields
}

type MonnifyModalProps = {
  amount: number // Amount in Naira
  email?: string
  contractCode?: string
  open: boolean
  onSuccess: (response: MonnifyPaymentResponse) => void
  onClose: () => void
  onReady?: () => void
}

// Global state to prevent duplicate SDK loads
let globalMonnifyScriptLoaded = false
let globalMonnifyScriptLoading = false

/**
 * Load Monnify SDK script from global CDN
 * Uses global state to prevent multiple script tags
 */
function loadMonnifyScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'))

  // Already loaded
  if (globalMonnifyScriptLoaded) {
    return Promise.resolve()
  }

  // Already loading
  if (globalMonnifyScriptLoading) {
    return new Promise((resolve) => {
      const checkLoaded = setInterval(() => {
        if (globalMonnifyScriptLoaded) {
          clearInterval(checkLoaded)
          resolve()
        }
      }, 100)
    })
  }

  globalMonnifyScriptLoading = true

  return new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector('script[src*="monnify.com"]')

    if (existingScript) {
      globalMonnifyScriptLoaded = true
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://sdk.monnify.com/plugin/monnify.js'
    script.async = true

    script.onload = () => {
      globalMonnifyScriptLoaded = true
      resolve()
    }

    script.onerror = () => {
      globalMonnifyScriptLoading = false
      reject(new Error('Monnify script failed to load'))
    }

    document.body.appendChild(script)
  })
}

export const MonnifyModal: React.FC<MonnifyModalProps> = ({
  amount,
  email,
  contractCode,
  open,
  onSuccess,
  onClose,
  onReady,
}) => {
  const mounted = useRef(true)
  const PaymentInitiatedRef = useRef(false)

  useEffect(() => {
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!open) {
      PaymentInitiatedRef.current = false
      return
    }

    if (PaymentInitiatedRef.current) {
      return
    }

    const start = async () => {
      const amountN = Number(amount || 0)

      if (!amountN || Number.isNaN(amountN) || amountN <= 0) {
        toast.error('Invalid payment amount')
        if (mounted.current) onClose()
        return
      }

      if (!contractCode) {
        toast.error('Payment provider not configured')
        if (mounted.current) onClose()
        return
      }

      if (!email) {
        toast.error('Email address required')
        if (mounted.current) onClose()
        return
      }

      try {
        await loadMonnifyScript()
      } catch (err) {
        console.error('Failed to load Monnify script', err)
        toast.error('Failed to load payment provider')
        if (mounted.current) onClose()
        return
      }

      const MonnifySDK = (
        window as unknown as {
          MonnifySDK?: {
            initialize?: (config: Record<string, unknown>) => void
          }
        }
      ).MonnifySDK

      if (!MonnifySDK || !MonnifySDK.initialize) {
        console.error('MonnifySDK not available')
        toast.error('Payment provider failed to load')
        if (mounted.current) onClose()
        return
      }

      try {
        console.debug('Monnify initialization with amount:', amountN)
        PaymentInitiatedRef.current = true

        MonnifySDK.initialize({
          amount: amountN,
          currency: 'NGN',
          reference: `monnify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          customerName: email?.split('@')[0] || 'Customer',
          customerEmail: email,
          contractCode: contractCode,
          paymentDescription: 'Platform Payment',
          metadata: {
            email: email,
          },
          onComplete: async function (response: MonnifyPaymentResponse) {
            try {
              console.log('Monnify payment completed with response:', {
                transactionReference: response?.transactionReference,
                paymentReference: response?.paymentReference,
              })

              // Store response in window for recovery if needed
              try {
                ;(window as Window & { __monnify_last_response?: MonnifyPaymentResponse }).__monnify_last_response =
                  response
              } catch (e) {
                // Ignore
              }

              // TRUST the SDK callback - if we got here, payment succeeded
              // Call onSuccess regardless of mounted state so verification runs
              try {
                onSuccess(response)
              } catch (cbErr) {
                console.error('Error invoking onSuccess callback', cbErr)
              }

              // Close after small delay to allow callback to process
              setTimeout(() => {
                if (mounted.current) {
                  onClose()
                }
              }, 100)
            } catch (e) {
              console.error('Error in Monnify onComplete handler', e)
            }
          },
          onClose: function () {
            try {
              PaymentInitiatedRef.current = false
              // Use setTimeout to avoid DOM reference errors from Monnify SDK cleanup
              setTimeout(() => {
                if (mounted.current) {
                  onClose()
                }
              }, 100)
            } catch (e) {
              console.error('Error in Monnify onClose', e)
            }
          },
        })

        try {
          if (typeof onReady === 'function') onReady()
        } catch (e) {
          // Ignore
        }
      } catch (err) {
        console.error('Failed to initialize Monnify payment', err)
        toast.error('Failed to initialize payment')
        PaymentInitiatedRef.current = false
        if (mounted.current) onClose()
      }
    }

    start()
  }, [open, amount, email, contractCode, onClose, onSuccess, onReady])

  return null
}

export default MonnifyModal
