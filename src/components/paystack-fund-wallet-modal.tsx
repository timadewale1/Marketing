"use client"

import { useState, useRef } from "react"
import { toast } from "react-hot-toast"
import { auth } from "@/lib/firebase"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { PaystackModal } from "@/components/paystack-modal"


interface PaystackFundWalletModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  email?: string
}

export function PaystackFundWalletModal({
  open,
  onClose,
  onSuccess,
  email = "",
}: PaystackFundWalletModalProps) {
  const [amount, setAmount] = useState("")
  const [userEmail, setUserEmail] = useState(email)
  const [paystackOpen, setPaystackOpen] = useState(false)
  const mounted = useRef(true)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-white/95">
        <DialogTitle className="sr-only">Fund Wallet</DialogTitle>
        <div className="space-y-4">
          <div>
            <Label htmlFor="amount">Amount (₦)</Label>
            <Input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              className="mt-1"
              min="100"
            />
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder="Enter your email"
              className="mt-1"
            />
          </div>

          <div className="mt-4">
            {Number(amount) >= 100 && userEmail ? (
              <Button 
                className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900"
                onClick={() => setPaystackOpen(true)}
              >
                Pay Now
              </Button>
            ) : (
              <Button
                disabled
                className="w-full"
                variant="secondary"
              >
                Enter amount (min. ₦100) and email
              </Button>
            )}
          </div>
        </div>

        {paystackOpen && (
          <PaystackModal
            amount={Number(amount)}
            email={userEmail}
            open={paystackOpen}
            onSuccess={async (reference) => {
              // Verify the payment server-side and record the wallet funding
              try {
                const userId = auth.currentUser?.uid
                console.log('Verifying paystack reference', { reference, userId, amount })
                let res: Response | null = null
                try {
                  res = await fetch('/api/verify-payment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reference, type: 'wallet_funding', userId, amount: Number(amount) }),
                  })
                } catch (networkErr) {
                  console.error('Network error verifying payment', networkErr)
                  toast.error('Network error verifying payment')
                  if (mounted.current) {
                    setPaystackOpen(false)
                    onClose()
                  }
                  return
                }

                let data: { message?: string } = {}
                try { data = await res.json() } catch (e) { data = {} }
                console.log('Verify payment response', { status: res.status, data })
                if (!res.ok) {
                  console.error('Verify payment failed', data)
                  toast.error(data?.message || 'Failed to verify payment')
                  if (mounted.current) {
                    setPaystackOpen(false)
                    onClose()
                  }
                  return
                }

                // success
                console.log('Payment verified, calling onSuccess()')
                onSuccess()
                setAmount("")
                setPaystackOpen(false)
              } catch (err) {
                console.error('Error verifying payment', err)
                toast.error('Failed to process payment')
                if (mounted.current) {
                  setPaystackOpen(false)
                  onClose()
                }
              }
            }}
            onClose={() => {
              onClose()
              setAmount("")
              setPaystackOpen(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
