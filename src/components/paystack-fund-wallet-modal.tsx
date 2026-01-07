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
  const handledRef = useRef(false)

  const handlePaymentSuccess = async (reference: string) => {
  setPaystackOpen(false)

  try {
    const res = await fetch('/api/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference,
        type: 'wallet_funding',
        amount,
        userId: auth.currentUser?.uid,
      }),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.message)

    toast.success('Wallet funded successfully')
    onClose()
  } catch (err) {
    console.error(err)
    toast.error('Wallet funding verification failed')
  }
}


  return (
<Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
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
                onClick={() => {
                  try {
                    const pending = { type: 'wallet_funding', amount: Number(amount), email: userEmail, userId: auth.currentUser?.uid }
                    localStorage.setItem('pamba_pending_payment', JSON.stringify(pending))
                  } catch (e) {
                    console.warn('Failed saving pending payment', e)
                  }
                  setPaystackOpen(true)
                }}
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
  email={userEmail || ""}
  open={paystackOpen}
  onSuccess={handlePaymentSuccess}
  onClose={() => setPaystackOpen(false)}
/>

        )}
      </DialogContent>
    </Dialog>
  )
}
