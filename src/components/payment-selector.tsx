"use client"

import React, { useState } from "react"
import Image from "next/image"
import { PaystackModal } from "@/components/paystack-modal"
import MonnifyModal from "@/components/monnify-modal"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import toast from "react-hot-toast"
import { auth } from '@/lib/firebase'

export type PaymentSelectorProps = {
  open: boolean
  amount: number
  email?: string
  fullName?: string
  phone?: string
  description?: string
  onClose: () => void
  onPaymentSuccess: (reference: string, provider: 'paystack' | 'monnify', monnifyResponse?: Record<string, unknown>) => Promise<void>
}

export const PaymentSelector: React.FC<PaymentSelectorProps> = ({
  open,
  amount,
  email,
  fullName,
  phone,
  description,
  onClose,
  onPaymentSuccess,
}) => {
  // Commented out Paystack - using Monnify only
  // const [selectedProvider, setSelectedProvider] = useState<'paystack' | 'monnify'>('paystack')
  const [selectedProvider, setSelectedProvider] = useState<'paystack' | 'monnify'>('monnify')
  const [paystackOpen, setPaystackOpen] = useState(false)
  const [monnifyOpen, setMonnifyOpen] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)

  if (!open) return null

  const handleProceed = () => {
    // Close the selection dialog when opening payment modals
    // This prevents the Dialog overlay from blocking the payment modals
    onClose()
    
    // Small delay to ensure Dialog closes before payment modal opens
    setTimeout(() => {
      if (selectedProvider === 'paystack') {
        setPaystackOpen(true)
      } else {
        setMonnifyOpen(true)
      }
    }, 50)
  }

  return (
    <>
      <Dialog open={open && !paystackOpen && !monnifyOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-sm bg-white rounded-lg shadow-lg p-6">
          <DialogHeader>
            <DialogTitle>Choose Payment Method</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm font-medium text-gray-700">
                Amount: <span className="text-lg font-bold">₦{amount.toLocaleString()}</span>
              </p>
              {description && <p className="text-xs text-gray-600 mt-1">{description}</p>}
            </div>

            {/* Paystack option disabled - using Monnify only */}
            <div className="p-4 bg-blue-50 rounded border border-blue-200 text-center">
              <p className="text-sm font-medium text-blue-900">💳 Payment via Monnify</p>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={onClose}
                disabled={isVerifying}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-stone-900"
                onClick={handleProceed}
                disabled={isVerifying || amount <= 0}
              >
                {isVerifying ? 'Processing...' : 'Proceed'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Paystack disabled - using Monnify only */}
      {/* {paystackOpen && (
        <PaystackModal
          amount={amount}
          email={email || auth.currentUser?.email || "no-reply@example.com"}
          open={paystackOpen}
          onSuccess={async (reference: string) => {
            setPaystackOpen(false)
            setIsVerifying(true)
            try {
              await onPaymentSuccess(reference, 'paystack')
            } catch (err) {
              console.error('Payment processing error:', err)
              toast.error('Payment verification failed')
            } finally {
              setIsVerifying(false)
            }
          }}
          onClose={() => {
            setPaystackOpen(false)
            setIsVerifying(false)
          }}
        />
      )} */}

      {monnifyOpen && (
        <MonnifyModal
          amount={amount}
          email={email || auth.currentUser?.email || "no-reply@example.com"}
          fullName={fullName || auth.currentUser?.displayName || 'Customer'}
          phone={phone}
          open={monnifyOpen}
          onSuccess={async (response) => {
            setMonnifyOpen(false)
            setIsVerifying(true)
            try {
              // Extract reference from the response object
              const reference = typeof response === 'string'
                ? response
                : (response?.transactionReference as string) || (response?.reference as string) || 'unknown';
              await onPaymentSuccess(reference, 'monnify', response as Record<string, unknown>)
            } catch (err) {
              console.error('Payment processing error:', err)
              toast.error('Payment verification failed')
            } finally {
              setIsVerifying(false)
            }
          }}
          onClose={() => {
            setMonnifyOpen(false)
            setIsVerifying(false)
          }}
        />
      )}
    </>
  )
}
