'use client'

import { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'

interface MonnifyResponse {
  status: string
  message: string
  data?: {
    transactionReference: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

interface MonnifySDK {
  initialize: (config: {
    amount: number
    currency: string
    reference: string
    customerFullName: string
    customerEmail: string
    customerPhoneNumber: string
    paymentDescription: string
    apiKey?: string
    contractCode?: string
    onComplete: (response: MonnifyResponse) => void
    onClose: () => void
  }) => void
}

declare global {
  interface Window {
    MonnifySDK: MonnifySDK
  }
}

// Global SDK loading flag to prevent duplicate script tags
let sdkLoadPromise: Promise<void> | null = null
let sdkScriptLoaded = false

const loadMonnifySDK = (): Promise<void> => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window not available'))
  }

  if (window.MonnifySDK && sdkScriptLoaded) {
    return Promise.resolve()
  }

  if (sdkLoadPromise) {
    return sdkLoadPromise
  }

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    // Check if script already exists
    const existingScript = document.querySelector('script[src*="sdk.monnify.com"]')
    if (existingScript && window.MonnifySDK) {
      sdkScriptLoaded = true
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://sdk.monnify.com/plugin/monnify.js'
    script.async = true
    script.onload = () => {
      sdkScriptLoaded = true
      resolve()
    }
    script.onerror = () => {
      reject(new Error('Failed to load Monnify SDK'))
    }
    document.body.appendChild(script)
  })

  return sdkLoadPromise
}

// Suppress the harmless DOM error from Monnify SDK cleanup
const originalError = window.addEventListener
if (typeof window !== 'undefined') {
  const originalErrorHandler = window.onerror
  window.onerror = function(msg: string | Event, url: string | undefined, lineNo: number | undefined, columnNo: number | undefined, error: Error | undefined) {
    // Suppress Monnify SDK's DOM removal errors - these are harmless
    if (msg && msg.toString().includes('removeChild') && msg.toString().includes('not a child')) {
      console.debug('Monnify SDK cleanup notice (harmless):', msg)
      return true // Suppress the error
    }
    // Call the original error handler if it exists
    if (originalErrorHandler) {
      return originalErrorHandler.apply(window, [msg, url, lineNo, columnNo, error])
    }
  }
}

interface MonnifyModalProps {
  amount: number
  email: string
  fullName: string
  phone?: string
  open: boolean
  onClose: () => void
  onSuccess: (response: MonnifyResponse) => void
}

export default function MonnifyModal({
  amount,
  email,
  fullName,
  phone,
  open,
  onClose,
  onSuccess,
}: MonnifyModalProps) {
  const paymentInitiatedRef = useRef(false)
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)

  useEffect(() => {
    return () => {
      // Cleanup timeout on unmount
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!open || paymentInitiatedRef.current) return

    const initializePayment = async () => {
      try {
        await loadMonnifySDK()

        if (!window.MonnifySDK) {
          console.error('Monnify SDK not available after loading')
          paymentInitiatedRef.current = false
          return
        }

        // Mark payment as initiated to prevent duplicate calls
        paymentInitiatedRef.current = true

        // Generate reference for the SDK request
        const txRef = `TX_${Date.now()}_${Math.floor(Math.random() * 100000)}`

        // Use initialize to open modal
        window.MonnifySDK.initialize({
          amount,
          currency: 'NGN',
          reference: txRef,
          customerFullName: fullName,
          customerEmail: email,
          customerPhoneNumber: phone ?? '',
          paymentDescription: 'Wallet Funding',
          apiKey: process.env.NEXT_PUBLIC_MONNIFY_API_KEY,
          contractCode: process.env.NEXT_PUBLIC_MONNIFY_CONTRACT_CODE,
          onComplete: (response: MonnifyResponse) => {
            // Reset the flag after payment completes
            paymentInitiatedRef.current = false
            // Pass the full response to onSuccess
            onSuccess(response)
          },
          onClose: () => {
            // Reset the flag when modal closes
            paymentInitiatedRef.current = false
            // Use a small timeout to let SDK finish cleanup before calling onClose
            timeoutRef.current = setTimeout(() => {
              onClose()
            }, 100)
          },
        })
      } catch (error) {
        console.error('Failed to initialize Monnify payment:', error)
        paymentInitiatedRef.current = false
      }
    }

    initializePayment()
  }, [open, amount, email, fullName, phone, onClose, onSuccess])

  return null
}