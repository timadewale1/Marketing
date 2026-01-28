"use client"

import React, { useState } from "react"
import { PaystackModal } from "@/components/paystack-modal"
import MonnifyModal from "@/components/monnify-modal"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import toast from "react-hot-toast"
import { auth } from '@/lib/firebase'
import Image from "next/image"

export type FundWalletModalProps = {
  open: boolean
  email?: string
  onClose: () => void
  onSuccess?: () => void
}

export const FundWalletModal: React.FC<FundWalletModalProps> = ({ open, email, onClose, onSuccess }) => {
  const [amount, setAmount] = useState<number>(0)
  const [provider, setProvider] = useState<'paystack' | 'monnify'>('paystack')
  const [paystackOpen, setPaystackOpen] = useState(false)
  const [monnifyOpen, setMonnifyOpen] = useState(false)
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
      const pending = { type: 'wallet_funding', amount: Number(amount), email: email, userId: auth.currentUser?.uid, provider }
      localStorage.setItem('pamba_pending_payment', JSON.stringify(pending))
    } catch (e) {
      console.warn('Failed saving pending payment', e)
    }
    setIsLoading(true)
    if (provider === 'monnify') {
      setMonnifyOpen(true)
    } else {
      setPaystackOpen(true)
    }
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

          <div>
            <label className="block text-sm font-medium text-primary-700 mb-2">
              Payment Provider
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setProvider('paystack')}
                className={`flex-1 py-2 px-3 rounded border-2 transition ${
                  provider === 'paystack'
                    ? 'border-amber-500 bg-amber-50 font-medium'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Image src="/paystack-logo.jpg" alt="Paystack" width={100} height={100} />
              </button>
              <button
                onClick={() => setProvider('monnify')}
                className={`flex-1 py-2 px-3 rounded border-2 transition ${
                  provider === 'monnify'
                    ? 'border-blue-500 bg-blue-50 font-medium'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Image src="/monnify-logo.png" alt="Monnify" width={100} height={100} />
              </button>
            </div>
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
                  body: JSON.stringify({ reference, type: 'wallet_funding', amount: Number(amount), userId: auth.currentUser?.uid, provider: 'paystack' }),
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

        {monnifyOpen && (
          <MonnifyModal
            amount={amount}
            email={email || ""}
            fullName={auth.currentUser?.displayName || 'Customer'}
            open={monnifyOpen}
            onSuccess={async (response: Record<string, unknown>) => {
              setMonnifyOpen(false)
              setIsLoading(false)
              try {
                // Extract reference from the response object
                const reference = response?.transactionReference || response?.reference || response
                const verifyUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/verify-payment` : '/api/verify-payment'
                const res = await fetch(verifyUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ reference, type: 'wallet_funding', amount: Number(amount), userId: auth.currentUser?.uid, provider: 'monnify', monnifyResponse: response }),
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
              setMonnifyOpen(false)
              setIsLoading(false)
              onClose()
            }}
          />
        )}
      </div>
    </div>
  )
}
