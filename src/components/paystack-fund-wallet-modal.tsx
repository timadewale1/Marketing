import React, { useState } from "react"
import { PaystackModal } from "@/components/paystack-modal"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import toast from "react-hot-toast"

export type PaystackFundWalletModalProps = {
  open: boolean
  email?: string
  onClose: () => void
  onSuccess?: () => void
}

export const PaystackFundWalletModal: React.FC<PaystackFundWalletModalProps> = ({ open, email, onClose, onSuccess }) => {
  const [amount, setAmount] = useState<number>(0)
  const [paystackOpen, setPaystackOpen] = useState(false)

  if (!open) return null

  const handleSubmit = () => {
    if (!email) {
      toast.error('Email address is required')
      return
    }
    if (!amount || amount < 100) {
      toast.error('Minimum amount is ₦100')
      return
    }
    setPaystackOpen(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">Fund Wallet</h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600"
          >
            &times;
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Amount (₦)
            </label>
            <Input
              type="number"
              min={100}
              value={amount || ""}
              onChange={e => setAmount(Number(e.target.value))}
              placeholder="Enter amount"
            />
            <p className="text-xs text-stone-500 mt-1">
              Minimum amount: ₦100
            </p>
          </div>

          <div className="pt-4">
            <Button
              className="w-full bg-amber-500 hover:bg-amber-600 text-white"
              disabled={!amount || amount < 100}
              onClick={handleSubmit}
            >
              Proceed to Payment
            </Button>
            <Button
              variant="outline"
              className="w-full mt-2"
              onClick={onClose}
            >
              Cancel
            </Button>
          </div>
        </div>

        {paystackOpen && (
          <PaystackModal
            amount={amount}
            email={email || ""}
            open={paystackOpen}
            onSuccess={() => {
              setPaystackOpen(false)
              if (onSuccess) onSuccess()
              onClose()
            }}
            onClose={() => {
              setPaystackOpen(false)
              onClose()
            }}
          />
        )}
      </div>
    </div>
  )
}
