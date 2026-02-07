/**
 * PAYMENT PROVIDER SELECTOR COMPONENT
 * 
 * Allows users to choose between Paystack and Monnify payment providers.
 * Routes to appropriate modal based on selection.
 * 
 * Usage:
 * <PaymentSelector
 *   amount={5000}
 *   email="user@example.com"
 *   open={isOpen}
 *   onClose={() => setOpen(false)}
 *   onPaymentComplete={(reference, provider) => handleSuccess(reference, provider)}
 * />
 */

import React, { useState } from 'react'
import { PaystackModal } from './3_PAYSTACK_MODAL_COMPONENT'
import { MonnifyModal, MonnifyPaymentResponse } from './4_MONNIFY_MODAL_COMPONENT'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import toast from 'react-hot-toast'

type PaymentProvider = 'paystack' | 'monnify'

export type PaymentSelectorProps = {
  amount: number
  email?: string
  open: boolean
  onClose: () => void
  onPaymentComplete: (reference: string, provider: PaymentProvider) => void
}

export const PaymentSelector: React.FC<PaymentSelectorProps> = ({
  amount,
  email,
  open,
  onClose,
  onPaymentComplete,
}) => {
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider | null>(null)
  const [showProviderModal, setShowProviderModal] = useState(false)

  const handleSelectProvider = (provider: PaymentProvider) => {
    setSelectedProvider(provider)
    setShowProviderModal(true)
  }

  const handlePaystackSuccess = (reference: string) => {
    console.log('Paystack payment successful:', reference)
    setShowProviderModal(false)
    setSelectedProvider(null)
    onPaymentComplete(reference, 'paystack')
    onClose()
  }

  const handleMonnifySuccess = (response: MonnifyPaymentResponse) => {
    console.log('Monnify payment successful:', response.transactionReference)
    const reference = response.transactionReference || response.paymentReference
    setShowProviderModal(false)
    setSelectedProvider(null)
    onPaymentComplete(reference, 'monnify')
    onClose()
  }

  const handleModalClose = () => {
    setShowProviderModal(false)
    setSelectedProvider(null)
  }

  return (
    <>
      {/* Provider Selection Dialog */}
      <Dialog open={open && !showProviderModal} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Payment Method</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Button
              onClick={() => handleSelectProvider('paystack')}
              className="w-full"
              variant="outline"
              size="lg">
              <span className="mr-2">💳</span>
              Paystack
            </Button>

            <Button
              onClick={() => handleSelectProvider('monnify')}
              className="w-full"
              variant="outline"
              size="lg">
              <span className="mr-2">💰</span>
              Monnify
            </Button>
          </div>

          <div className="text-xs text-gray-500 text-center mt-4">
            <p>Amount: ₦{amount?.toLocaleString('en-NG')}</p>
            {email && <p>Email: {email}</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Paystack Payment Modal */}
      {selectedProvider === 'paystack' && (
        <PaystackModal
          amount={amount}
          email={email}
          open={showProviderModal}
          onSuccess={handlePaystackSuccess}
          onClose={handleModalClose}
        />
      )}

      {/* Monnify Payment Modal */}
      {selectedProvider === 'monnify' && (
        <MonnifyModal
          amount={amount}
          email={email}
          contractCode={process.env.NEXT_PUBLIC_MONNIFY_CONTRACT_CODE}
          open={showProviderModal}
          onSuccess={handleMonnifySuccess}
          onClose={handleModalClose}
        />
      )}
    </>
  )
}

export default PaymentSelector
