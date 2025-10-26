"use client"

import { useState } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
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
                className="w-full bg-gold-500 hover:bg-gold-600 text-white"
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
            onSuccess={(reference) => {
              onSuccess()
              setAmount("")
              setPaystackOpen(false)
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
