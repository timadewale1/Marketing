/**
 * FUND WALLET MODAL COMPONENT
 * 
 * Allows users to add funds to their wallet.
 * Supports both Paystack and Monnify payment providers.
 * 
 * Flow:
 * 1. User enters amount
 * 2. Selects payment provider
 * 3. Completes payment
 * 4. Backend verifies payment with provider API
 * 5. Wallet balance updated in Firestore
 * 6. User sees success message
 * 
 * Usage:
 * <FundWalletModal
 *   userId="user123"
 *   userEmail="user@example.com"
 *   open={isOpen}
 *   onClose={() => setOpen(false)}
 *   onSuccess={() => refreshWallet()}
 * />
 */

import React, { useState } from 'react'
import { PaymentSelector } from './5_PAYMENT_SELECTOR_COMPONENT'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

type FundWalletModalProps = {
  userId: string
  userEmail: string
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  userType?: 'advertiser' | 'earner' | 'admin'
}

export const FundWalletModal: React.FC<FundWalletModalProps> = ({
  userId,
  userEmail,
  open,
  onClose,
  onSuccess,
  userType = 'advertiser',
}) => {
  const [amount, setAmount] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPaymentSelector, setShowPaymentSelector] = useState(false)
  const [selectedPaymentRef, setSelectedPaymentRef] = useState<string>('')
  const [selectedProvider, setSelectedProvider] = useState<'paystack' | 'monnify'>('paystack')

  const amountNum = parseFloat(amount) || 0
  const isValidAmount = amountNum > 0

  const handleStartPayment = () => {
    if (!isValidAmount) {
      toast.error('Please enter a valid amount')
      return
    }
    setShowPaymentSelector(true)
  }

  const handlePaymentComplete = async (reference: string, provider: 'paystack' | 'monnify') => {
    console.log('Payment complete:', { reference, provider, amount: amountNum })

    setSelectedPaymentRef(reference)
    setSelectedProvider(provider)
    setShowPaymentSelector(false)

    // Verify payment with backend
    await verifyPayment(reference, provider, amountNum)
  }

  const verifyPayment = async (
    reference: string,
    provider: 'paystack' | 'monnify',
    paymentAmount: number
  ) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference,
          provider,
          amount: paymentAmount,
          userType,
          userId,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Payment verification failed')
      }

      const data = await response.json()
      console.log('Payment verified:', data)

      toast.success('Wallet funded successfully! 🎉')

      // Reset form
      setAmount('')
      setSelectedPaymentRef('')

      // Call callback
      if (onSuccess) {
        onSuccess()
      }

      // Close modal after success
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment verification failed'
      console.error('Payment verification error:', err)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      {/* Fund Amount Input Dialog */}
      <Dialog open={open && !showPaymentSelector} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Fund Your Wallet</DialogTitle>
            <DialogDescription>Enter the amount you want to add to your wallet</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="amount" className="text-base">
                Amount (₦)
              </Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₦</span>
                <Input
                  id="amount"
                  type="number"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isLoading}
                  className="pl-8"
                  min="1"
                  step="100"
                />
              </div>
            </div>

            {amountNum > 0 && (
              <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                You will add ₦{amountNum.toLocaleString('en-NG')} to your wallet
              </div>
            )}

            <Button
              onClick={handleStartPayment}
              disabled={!isValidAmount || isLoading}
              className="w-full"
              size="lg">
              {isLoading ? 'Processing...' : 'Continue to Payment'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Provider Selector */}
      {showPaymentSelector && (
        <PaymentSelector
          amount={amountNum}
          email={userEmail}
          open={showPaymentSelector}
          onClose={() => setShowPaymentSelector(false)}
          onPaymentComplete={handlePaymentComplete}
        />
      )}
    </>
  )
}

export default FundWalletModal

/**
 * BACKEND VERIFICATION FLOW
 * 
 * The verify-payment API endpoint receives:
 * - reference: Payment transaction reference from provider
 * - provider: 'paystack' or 'monnify'
 * - amount: Amount in Naira
 * - userType: 'advertiser', 'earner', or 'admin'
 * - userId: Firestore user document ID
 * 
 * Backend then:
 * 1. Verifies payment with provider API
 * 2. Checks amount matches
 * 3. Records transaction in Firestore
 * 4. Updates user wallet balance
 * 
 * Example Backend Response:
 * {
 *   success: true,
 *   message: "Payment verified and wallet updated",
 *   transaction: {
 *     id: "txn_abc123",
 *     reference: "paystack_ref_123",
 *     provider: "paystack",
 *     amount: 5000,
 *     status: "completed"
 *   },
 *   wallet: {
 *     balance: 15000,
 *     lastUpdated: "2024-01-01T12:00:00Z"
 *   }
 * }
 */
