"use client"

import React, { useEffect, useState } from 'react'
import { PaymentSelector } from '@/components/payment-selector'
import { buyUsufAirtime } from '@/services/usufAirtime'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, Smartphone, Zap } from 'lucide-react'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { USUF_NETWORKS } from '@/services/usufAirtime'

const NETWORKS = [
  { id: 1 as const, name: 'MTN' },
  { id: 2 as const, name: 'GLO' },
  { id: 3 as const, name: '9MOBILE' },
  { id: 4 as const, name: 'AIRTEL' },
  { id: 5 as const, name: 'SMILE' },
]

export default function AirtimePage() {
  const [network, setNetwork] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [processing, setProcessing] = useState(false)
  const [processingWallet, setProcessingWallet] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [showPaymentSelector, setShowPaymentSelector] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setIsLoggedIn(!!u))
    return () => unsub()
  }, [])

  useEffect(() => {
    let unsubBalance: (() => void) | null = null
    const setup = async (uid: string) => {
      try {
        const advRef = doc(db, 'advertisers', uid)
        const advSnap = await getDoc(advRef)
        if (advSnap.exists()) {
          setWalletBalance(Number(advSnap.data()?.balance || 0))
          unsubBalance = onSnapshot(advRef, (s) => setWalletBalance(Number(s.data()?.balance || 0)))
          return
        }
        const earRef = doc(db, 'earners', uid)
        const earSnap = await getDoc(earRef)
        if (earSnap.exists()) {
          setWalletBalance(Number(earSnap.data()?.balance || 0))
          unsubBalance = onSnapshot(earRef, (s) => setWalletBalance(Number(s.data()?.balance || 0)))
          return
        }
        setWalletBalance(null)
      } catch (e) {
        console.warn('wallet balance fetch error', e)
      }
    }

    const authUnsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setWalletBalance(null)
        return
      }
      setup(u.uid)
    })

    return () => {
      authUnsub()
      if (unsubBalance) try { unsubBalance() } catch {}
    }
  }, [])

  const displayPrice = () => Number(amount || 0)

  const handlePurchase = async () => {
    if (!phone) {
      toast.error('Please enter phone number')
      return
    }
    if (!amount || Number(amount) <= 0) {
      toast.error('Please enter amount')
      return
    }
    setShowPaymentSelector(true)
  }

  const handleWalletPurchase = async () => {
    if (!auth.currentUser) return toast.error('Please sign in to pay from wallet')
    if (!phone) return toast.error('Please enter phone number')
    if (!amount || Number(amount) <= 0) return toast.error('Please enter amount')
    setProcessingWallet(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await buyUsufAirtime(network, Number(amount), phone, true, { idToken })
      if (!res.status) return toast.error(res.message)
      
      const transactionData = {
        serviceID: USUF_NETWORKS[network],
        amount: Number(amount),
        response_description: res.message,
        transactionId: res.transactionId,
      }
      sessionStorage.setItem('lastTransaction', JSON.stringify(transactionData))
      toast.success('Airtime purchased successfully')
      window.location.href = '/bills/confirmation'
    } catch (e) {
      console.error(e)
      toast.error('Purchase failed')
    } finally {
      setProcessingWallet(false)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onPaymentSuccess = async (reference: string, provider: 'paystack' | 'monnify') => {
    setShowPaymentSelector(false)
    setProcessing(true)
    try {
      const res = await buyUsufAirtime(network, Number(amount), phone, true)
      if (!res.status) {
        toast.error(res.message)
        return
      }
      
      const transactionData = {
        serviceID: USUF_NETWORKS[network],
        amount: Number(amount),
        response_description: res.message,
        transactionId: res.transactionId,
      }
      sessionStorage.setItem('lastTransaction', JSON.stringify(transactionData))
      toast.success('Airtime purchased successfully')
      window.location.href = '/bills/confirmation'
    } catch (e) {
      console.error(e)
      toast.error('Purchase failed')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-white to-stone-100">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-stone-200">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/bills">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-stone-900">Buy Airtime</h1>
          <div className="w-[68px]" />
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card className="border border-stone-200 shadow-lg bg-white rounded-xl">
            <CardContent className="p-6 sm:p-8 space-y-6">
              {/* Network Selection */}
              <div>
                <label className="block text-sm font-semibold text-stone-900 mb-3">Select Network</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {NETWORKS.map(n => (
                    <button
                      key={n.id}
                      onClick={() => setNetwork(n.id)}
                      className={`p-3 rounded-lg border-2 transition-all font-medium ${
                        network === n.id
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-stone-200 bg-white text-stone-900 hover:border-amber-300'
                      }`}
                    >
                      {n.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Phone Input */}
              <div>
                <label className="block text-sm font-semibold text-stone-900 mb-2">Phone Number</label>
                <div className="relative">
                  <Smartphone className="absolute left-3 top-3 w-5 h-5 text-stone-400" />
                  <input
                    placeholder="08012345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <label className="block text-sm font-semibold text-stone-900 mb-2">Amount (₦)</label>
                <div className="relative">
                  <Zap className="absolute left-3 top-3 w-5 h-5 text-stone-400" />
                  <input
                    type="number"
                    placeholder="500"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Email Input */}
              {/* <div>
                <label className="block text-sm font-semibold text-stone-900 mb-2">Email (for receipt)</label>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div> */}

              {/* Price Summary */}
              {amount && (
                <div className="bg-gradient-to-r from-amber-50 to-stone-50 p-4 rounded-lg border border-amber-200">
                  <div className="space-y-2">
                    <div className="border-t border-amber-200 pt-2 flex justify-between">
                      <span className="font-semibold text-stone-900">Total:</span>
                      <span className="text-lg font-bold text-amber-600">₦{displayPrice().toLocaleString()}</span>
                    </div>
                    {isLoggedIn && walletBalance !== null && (
                      <div className="flex justify-between text-sm text-stone-600">
                        <span>Wallet balance:</span>
                        <span className="font-medium">₦{Number(walletBalance).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Button */}
              <>
                <div className="space-y-2">
                  {isLoggedIn ? (
                    <>
                      <Button onClick={handleWalletPurchase} disabled={processing || processingWallet || (walletBalance !== null && Number(amount) > walletBalance)} className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold rounded-lg transition-all">{processingWallet ? 'Processing...' : (walletBalance !== null && Number(amount) > walletBalance ? 'Insufficient funds' : 'Pay from wallet')}</Button>
                      <Button onClick={handlePurchase} disabled={processing || processingWallet} variant="outline" className="w-full">Pay with Card</Button>
                    </>
                  ) : (
                    <Button onClick={handlePurchase} disabled={processing} className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold rounded-lg transition-all">{processing ? 'Processing...' : 'Proceed to Payment'}</Button>
                  )}
                </div>
              </>

              {/* Payment Selector Modal */}
              <PaymentSelector
                open={showPaymentSelector}
                amount={Number(amount) || 0}
                email={auth.currentUser?.email || ''}
                description={`${USUF_NETWORKS[network]} - ₦${displayPrice().toLocaleString()}`}
                onClose={() => setShowPaymentSelector(false)}
                onPaymentSuccess={onPaymentSuccess}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Paystack removed: payments go through server handler at /api/bills/buy-service */}
    </div>
  )
}
