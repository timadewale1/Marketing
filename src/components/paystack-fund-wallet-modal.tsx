"use client"

import React, { useState } from "react"
import { PaystackModal } from "@/components/paystack-modal"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import toast from "react-hot-toast"
import { auth } from '@/lib/firebase'

export type PaystackFundWalletModalProps = {
  open: boolean
  email?: string
  onClose: () => void
  onSuccess?: () => void
}

export const PaystackFundWalletModal: React.FC<PaystackFundWalletModalProps> = ({ open, email, onClose, onSuccess }) => {
  const [amount, setAmount] = useState<number>(0)
  const [paystackOpen, setPaystackOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

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
    try {
      const pending = { type: 'wallet_funding', amount: Number(amount), email: email, userId: auth.currentUser?.uid }
      localStorage.setItem('pamba_pending_payment', JSON.stringify(pending))
    } catch (e) {
      console.warn('Failed saving pending payment', e)
    }
    setIsLoading(true)
    setPaystackOpen(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">Fund Wallet</h2>
          <button
            onClick={onClose}
            className="text-primary-400 hover:text-primary-600"
          >
            &times;
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-primary-700 mb-1">
              Amount (₦)
            </label>
            <Input
              type="number"
              min={100}
              value={amount || ""}
              onChange={e => setAmount(Number(e.target.value))}
              placeholder="Enter amount"
            />
            <p className="text-xs text-primary-500 mt-1">
              Minimum amount: ₦100
            </p>
          </div>

          <div className="pt-4">
            <Button
              className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900"
              disabled={!amount || amount < 100 || isLoading}
              onClick={handleSubmit}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                  Loading...
                </span>
              ) : (
                'Proceed to Payment'
              )}
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
            onReady={() => setIsLoading(false)}
            onSuccess={async (reference: string) => {
              setPaystackOpen(false)
              setIsLoading(false)
              try {
                const verifyUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/verify-payment` : '/api/verify-payment'
                const res = await fetch(verifyUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ reference, type: 'wallet_funding', amount: Number(amount), userId: auth.currentUser?.uid }),
                })
                const text = await res.text().catch(() => '')
                let data: Record<string, unknown> = {}
                try { data = text ? JSON.parse(text) : {} } catch (e) { data = { raw: text } }
                if (!res.ok) throw new Error(String(data?.message || `Status ${res.status}`))
                toast.success('Wallet funded successfully')
                try { localStorage.removeItem('pamba_pending_payment') } catch (e) {}
                onClose()
                if (onSuccess) onSuccess()
              } catch (err) {
                console.error('verify-payment failed', err)
                toast.error('Wallet funding verification failed')
              }
            }}
            onClose={() => {
              setPaystackOpen(false)
              setIsLoading(false)
              onClose()
            }}
          />
        )}
      </div>
    </div>
  )
}
// "use client"

// import { useState, useRef, useEffect } from "react"
// import { toast } from "react-hot-toast"
// import { auth } from "@/lib/firebase"
// import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
// import { Label } from "@/components/ui/label"
// import { Input } from "@/components/ui/input"
// import { Button } from "@/components/ui/button"
// import { PaystackModal } from "@/components/paystack-modal"


// interface PaystackFundWalletModalProps {
//   open: boolean
//   onClose: () => void
//   onSuccess: () => void
//   email?: string
// }

// export function PaystackFundWalletModal({
//   open,
//   onClose,
//   onSuccess,
//   email = "",
// }: PaystackFundWalletModalProps) {
//   const [amount, setAmount] = useState("")
//   const [userEmail, setUserEmail] = useState(email)
//   const [paystackOpen, setPaystackOpen] = useState(false)
//   const mounted = useRef(true)
//   const handledRef = useRef(false)

//   // when Paystack inline overlay is active, add a class to body so global
//   // CSS can make the Radix dialog overlay non-interactive and let
//   // Paystack's iframe receive pointer events.
//   useEffect(() => {
//     if (typeof window === 'undefined') return
//     try {
//       if (paystackOpen) document.body.classList.add('paystack-active')
//       else document.body.classList.remove('paystack-active')
//     } catch (e) {
//       /* ignore */
//     }
//     return () => { try { document.body.classList.remove('paystack-active') } catch (e) {} }
//   }, [paystackOpen])

//   const handlePaymentSuccess = async (reference: string) => {
//     setPaystackOpen(false)

//     console.log('handlePaymentSuccess invoked with reference:', reference)
//     try {
//       // build absolute URL to avoid base-path issues
//       const verifyUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/verify-payment` : '/api/verify-payment'
//       console.log('Sending verify request to', verifyUrl)

//       const res = await fetch(verifyUrl, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({
//           reference,
//           type: 'wallet_funding',
//           amount: Number(amount),
//           userId: auth.currentUser?.uid,
//         }),
//       })

//       console.log('verify response status:', res.status)
//       const text = await res.text().catch(() => '')
//       let data: Record<string, unknown> = {}
//       try { data = text ? JSON.parse(text) : {} } catch (e) { data = { raw: text } }
//       console.log('verify response body:', data)
//       if (!res.ok) throw new Error(String(data?.message || `Status ${res.status}`))

//       toast.success('Wallet funded successfully')
//       try { localStorage.removeItem('pamba_pending_payment') } catch (e) { /* ignore */ }
//       onClose()
//       try { onSuccess() } catch (e) { /* ignore */ }
//     } catch (err) {
//       console.error('verify-payment call failed', err)
//       toast.error('Wallet funding verification failed')
//     }
//   }


//   return (
//     <Dialog open={open} onOpenChange={(isOpen) => {
//         if (!isOpen) {
//           // If the Paystack inline overlay is active, ignore the close
//           // event so the PaystackModal stays mounted and can invoke callbacks.
//           if (paystackOpen) {
//             return
//           }
//           onClose()
//         }
//       }}>
//       <DialogContent className="sm:max-w-md bg-white/95">
//         <DialogTitle className="sr-only">Fund Wallet</DialogTitle>
//         <div className="space-y-4">
//           <div>
//             <Label htmlFor="amount">Amount (₦)</Label>
//             <Input
//               id="amount"
//               type="number"
//               value={amount}
//               onChange={(e) => setAmount(e.target.value)}
//               placeholder="Enter amount"
//               className="mt-1"
//               min="100"
//             />
//           </div>

//           <div>
//             <Label htmlFor="email">Email</Label>
//             <Input
//               id="email"
//               type="email"
//               value={userEmail}
//               onChange={(e) => setUserEmail(e.target.value)}
//               placeholder="Enter your email"
//               className="mt-1"
//             />
//           </div>

//           <div className="mt-4">
//             {Number(amount) >= 100 && userEmail ? (
//               <Button 
//                 className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900"
//                 onClick={() => {
//                   try {
//                     const pending = { type: 'wallet_funding', amount: Number(amount), email: userEmail, userId: auth.currentUser?.uid }
//                     localStorage.setItem('pamba_pending_payment', JSON.stringify(pending))
//                   } catch (e) {
//                     console.warn('Failed saving pending payment', e)
//                   }
//                   setPaystackOpen(true)
//                 }}
//               >
//                 Pay Now
//               </Button>
//             ) : (
//               <Button
//                 disabled
//                 className="w-full"
//                 variant="secondary"
//               >
//                 Enter amount (min. ₦100) and email
//               </Button>
//             )}
//           </div>
//         </div>

//         {paystackOpen && (
//           <PaystackModal
//             amount={Number(amount)}
//             email={userEmail || ""}
//             open={paystackOpen}
//             onSuccess={handlePaymentSuccess}
//             onClose={() => setPaystackOpen(false)}
//           />
//         )}
//       </DialogContent>
//     </Dialog>
//   )
// }
