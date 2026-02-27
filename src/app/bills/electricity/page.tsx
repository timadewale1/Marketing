"use client"

import React, { useEffect, useState } from 'react'
import { PaymentSelector } from '@/components/payment-selector'
import { buyUsufElectricity, validateElectricityMeter, USUF_DISCOS, type MeterType } from '@/services/usufElectricity'
import Link from 'next/link'
import { Hash, ArrowLeft, Zap, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { Card, CardContent } from '@/components/ui/card'

/* VTPASS IMPORTS - COMMENTED OUT FOR FUTURE RE-INTEGRATION */
// import { postBuyService } from '@/lib/postBuyService'
// import { formatVerifyResult, extractPhoneFromVerifyResult, filterVerifyResultByService } from '@/services/vtpass/utils'

export default function ElectricityPage() {
  const [meter, setMeter] = useState('')
  const [disco, setDisco] = useState(1 as 1 | 2 | 3 | 4 | 5 | 6 | 8 | 9 | 10 | 11 | 12 | 13)
  const [meterType, setMeterType] = useState<MeterType>(1)
  const [amount, setAmount] = useState('')
  const [verifyResult, setVerifyResult] = useState<{ name?: string; address?: string; invalid?: boolean | string } | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [showPaymentSelector, setShowPaymentSelector] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingWallet, setProcessingWallet] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)

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
    if (!meter) {
      toast.error('Please enter meter number')
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
    if (!meter) return toast.error('Please enter meter number')
    if (!amount || Number(amount) <= 0) return toast.error('Please enter amount')
    setProcessingWallet(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await buyUsufElectricity(disco, Number(amount), meter, meterType, { idToken, sellAmount: Number(amount) })
      if (!res.status) return toast.error(res.message)
      
      const transactionData = {
        serviceID: 'electricity',
        amount: Number(amount),
        response_description: res.message,
        transactionId: res.transactionId,
      }
      sessionStorage.setItem('lastTransaction', JSON.stringify(transactionData))
      toast.success('Electricity payment successful')
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
      const res = await buyUsufElectricity(disco, Number(amount), meter, meterType)
      if (!res.status) {
        toast.error(res.message)
        return
      }
      
      const transactionData = {
        serviceID: 'electricity',
        amount: Number(amount),
        response_description: res.message,
        transactionId: res.transactionId,
      }
      sessionStorage.setItem('lastTransaction', JSON.stringify(transactionData))
      toast.success('Electricity payment successful')
      window.location.href = '/bills/confirmation'
    } catch (e) {
      console.error(e)
      toast.error('Purchase failed')
    } finally {
      setProcessing(false)
    }
  }

  const handleVerify = async () => {
    if (!meter) {
      toast.error('Please enter meter number')
      return
    }
    setVerifying(true)
    try {
      const result = await validateElectricityMeter(disco, meter, meterType)
      setVerifyResult(result.data || null)
      
      if (!result.status) {
        toast.error(result.message || 'Meter validation failed')
        return
      }
      
      toast.success('Meter verified successfully')
    } catch (err) {
      console.error('verify error', err)
      toast.error('Verification error')
    } finally {
      setVerifying(false)
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
          <h1 className="text-xl font-bold text-stone-900">Pay Electricity</h1>
          <div className="w-[68px]" />
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card className="border border-stone-200 shadow-lg bg-white rounded-xl">
            <CardContent className="p-6 sm:p-8 space-y-6">
              {/* Meter Type Selection */}
              <div>
                <label className="block text-sm font-semibold text-stone-900 mb-3">Meter Type</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setMeterType(1)}
                    className={`flex-1 py-2 px-3 rounded border-2 transition-all font-medium ${
                      meterType === 1
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-stone-200 bg-white text-stone-900 hover:border-amber-300'
                    }`}
                  >
                    Prepaid
                  </button>
                  <button
                    onClick={() => setMeterType(2)}
                    className={`flex-1 py-2 px-3 rounded border-2 transition-all font-medium ${
                      meterType === 2
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-stone-200 bg-white text-stone-900 hover:border-amber-300'
                    }`}
                  >
                    Postpaid
                  </button>
                </div>
              </div>

              {/* Disco Selection */}
              <div>
                <label className="block text-sm font-semibold text-stone-900 mb-2">Select Distribution Company</label>
                <select
                  value={disco}
                  onChange={(e) => setDisco(Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6 | 8 | 9 | 10 | 11 | 12 | 13)}
                  className="w-full px-4 py-2.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  {USUF_DISCOS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Meter Number Input */}
              <div>
                <label className="block text-sm font-semibold text-stone-900 mb-2">Meter Number</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-3 w-5 h-5 text-stone-400" />
                  <input
                    placeholder="1234567890"
                    value={meter}
                    onChange={(e) => setMeter(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Verify Button */}
              <Button
                onClick={handleVerify}
                disabled={!meter || verifying}
                className="w-full bg-stone-900 hover:bg-stone-800 text-white rounded-lg h-10"
              >
                {verifying ? 'Verifying...' : 'Verify Meter'}
              </Button>

              {/* Verification Result */}
              {verifyResult && (
                <div className={`rounded-lg p-4 space-y-3 border ${
                  verifyResult?.invalid === true || verifyResult?.invalid === 'true'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-green-50 border-green-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`w-5 h-5 ${
                      verifyResult?.invalid === true || verifyResult?.invalid === 'true'
                        ? 'text-red-600'
                        : 'text-green-600'
                    }`} />
                    <p className={`text-sm font-semibold ${
                      verifyResult?.invalid === true || verifyResult?.invalid === 'true'
                        ? 'text-red-900'
                        : 'text-green-900'
                    }`}>
                      {verifyResult?.invalid === true || verifyResult?.invalid === 'true'
                        ? 'Invalid Meter'
                        : 'Meter Verified'}
                    </p>
                  </div>
                  <div className={`space-y-2 text-sm ${
                    verifyResult?.invalid === true || verifyResult?.invalid === 'true'
                      ? 'text-red-800'
                      : 'text-green-800'
                  }`}>
                    {verifyResult?.name && (
                      <div className="flex justify-between items-start">
                        <span>Name:</span>
                        <span className="font-medium text-right ml-4">{verifyResult.name}</span>
                      </div>
                    )}
                    {verifyResult?.address && (
                      <div className="flex justify-between items-start">
                        <span>Address:</span>
                        <span className="font-medium text-right ml-4">{verifyResult.address}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Amount Input */}
              {verifyResult && (verifyResult?.invalid !== true && verifyResult?.invalid !== 'true') && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-stone-900 mb-2">Amount (₦)</label>
                    <div className="relative">
                      <Zap className="absolute left-3 top-3 w-5 h-5 text-stone-400" />
                      <input
                        type="number"
                        placeholder="5000"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    </div>
                    <p className="text-xs text-stone-600 mt-2">Minimum purchase: ₦1,000</p>
                  </div>

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

                  {/* Action Buttons */}
                  <div className="space-y-2">
                    {isLoggedIn ? (
                      <>
                        <Button
                          onClick={handleWalletPurchase}
                          disabled={processingWallet || (walletBalance !== null && Number(amount) > walletBalance)}
                          className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold rounded-lg transition-all"
                        >
                          {processingWallet ? 'Processing...' : (walletBalance !== null && Number(amount) > walletBalance ? 'Insufficient funds' : 'Pay from wallet')}
                        </Button>
                        <Button
                          onClick={handlePurchase}
                          disabled={processing || processingWallet}
                          variant="outline"
                          className="w-full"
                        >
                          Pay with Card
                        </Button>
                      </>
                    ) : (
                      <Button
                        onClick={handlePurchase}
                        disabled={processing}
                        className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold rounded-lg transition-all"
                      >
                        {processing ? 'Processing...' : 'Proceed to Payment'}
                      </Button>
                    )}
                  </div>

                  {/* Payment Selector Modal */}
                  <PaymentSelector
                    open={showPaymentSelector}
                    amount={displayPrice()}
                    email={auth.currentUser?.email || ''}
                    description={`Electricity Bill - ${displayPrice().toLocaleString()}`}
                    onClose={() => setShowPaymentSelector(false)}
                    onPaymentSuccess={onPaymentSuccess}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
