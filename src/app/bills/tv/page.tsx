"use client"

import React, { useEffect, useState } from 'react'
import { PaymentSelector } from '@/components/payment-selector'
import { buyUsufCable, getCablePlansByProvider, validateCableSmartCard, USUF_CABLES, type UsufCableId, type UsufCablePlanId } from '@/services/usufCable'
import Link from 'next/link'
import { Hash, ArrowLeft, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { Card, CardContent } from '@/components/ui/card'

/* VTPASS IMPORTS - COMMENTED OUT FOR FUTURE RE-INTEGRATION */
// import { postBuyService } from '@/lib/postBuyService'
// import { formatVerifyResult, extractPhoneFromVerifyResult, filterVerifyResultByService } from '@/services/vtpass/utils'

export default function TVPage() {
  const [cable, setCable] = useState<UsufCableId>(1)
  const [plan, setPlan] = useState<UsufCablePlanId>(2)
  const [smartcard, setSmartcard] = useState('')
  const [amount, setAmount] = useState('')
  const [availablePlans, setAvailablePlans] = useState<Array<{ id: UsufCablePlanId; cableName: string; planName: string; amount: number }>>([])
  
  const [verifyResult, setVerifyResult] = useState<Record<string, unknown> | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingWallet, setProcessingWallet] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [showPaymentSelector, setShowPaymentSelector] = useState(false)

  const displayPrice = () => Number(amount || 0)

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

  useEffect(() => {
    // Update available plans when cable changes
    const plans = getCablePlansByProvider(cable)
    setAvailablePlans(plans)
    // Set first available plan
    if (plans.length > 0) {
      setPlan(plans[0].id as UsufCablePlanId)
      setAmount(String(plans[0].amount))
    }
  }, [cable])

  const handlePurchase = async () => {
    if (!smartcard) {
      toast.error('Please enter smart card number')
      return
    }
    if (!plan || !amount) {
      toast.error('Please select a plan')
      return
    }
    setShowPaymentSelector(true)
  }

  const handleWalletPurchase = async () => {
    if (!auth.currentUser) return toast.error('Please sign in to pay from wallet')
    if (!smartcard) return toast.error('Please enter smart card number')
    if (!plan) return toast.error('Please select a plan')
    setProcessingWallet(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await buyUsufCable(cable, plan, smartcard, { idToken, sellAmount: Number(amount) })
      if (!res.status) return toast.error(res.message)
      
      const selectedPlan = availablePlans.find(p => p.id === plan)
      const transactionData = {
        serviceID: 'cable',
        amount: Number(amount),
        response_description: res.message,
        transactionId: res.transactionId,
        planName: selectedPlan?.planName || 'Cable Subscription',
      }
      sessionStorage.setItem('lastTransaction', JSON.stringify(transactionData))
      toast.success('Cable subscription successful')
      window.location.href = '/bills/confirmation'
    } catch (e) {
      console.error(e)
      toast.error('Purchase failed')
    } finally {
      setProcessingWallet(false)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onPaymentSuccess = async (_reference: string, _provider: 'paystack' | 'monnify') => {
    setShowPaymentSelector(false)
    setProcessing(true)
    try {
      const res = await buyUsufCable(cable, plan, smartcard)
      if (!res.status) {
        toast.error(res.message)
        return
      }
      
      const selectedPlan = availablePlans.find(p => p.id === plan)
      const transactionData = {
        serviceID: 'cable',
        amount: Number(amount),
        response_description: res.message,
        transactionId: res.transactionId,
        planName: selectedPlan?.planName || 'Cable Subscription',
      }
      sessionStorage.setItem('lastTransaction', JSON.stringify(transactionData))
      toast.success('Cable subscription successful')
      window.location.href = '/bills/confirmation'
    } catch (e) {
      console.error(e)
      toast.error('Purchase failed')
    } finally {
      setProcessing(false)
    }
  }

  const handleVerify = async () => {
    if (!smartcard) {
      toast.error('Please enter smart card number')
      return
    }
    setVerifying(true)
    try {
      const result = await validateCableSmartCard(cable, smartcard)
      setVerifyResult(result.data || null)
      
      if (!result.status) {
        toast.error(result.message || 'Smart card validation failed')
        return
      }
      
      toast.success('Smart card verified successfully')
    } catch (err) {
      console.error('verify error', err)
      toast.error('Verification error')
    } finally {
      setVerifying(false)
    }
  }

  /* VTPASS OLD FUNCTIONS - COMMENTED OUT FOR FUTURE RE-INTEGRATION */
  // const handleWalletPurchase = async () => {
  //   if (!auth.currentUser) return toast.error('Please sign in to pay from wallet')
  //   if (!smartcard) return toast.error('Enter smartcard number')
  //   if (!amount) return toast.error('Choose a bouquet or amount')
  //   setProcessingWallet(true)
  //   try {
  //     const idToken = await auth.currentUser.getIdToken()
  //     const payload: Record<string, unknown> = { serviceID: provider, billersCode: smartcard }
  //     const matched = bouquets.find(b => b.code === amount || String(b.amount) === amount)
  //     if (matched) {
  //       payload.variation_code = matched.code
  //       payload.amount = String(matched.amount)
  //     } else {
  //       payload.amount = String(amount)
  //     }
  //     let phoneToUse = phone || ''
  //     if (!phoneToUse && verifyResult) {
  //       try { const p = extractPhoneFromVerifyResult(verifyResult); if (p) phoneToUse = p } catch {}
  //     }
  //     if (!phoneToUse) return toast.error('Enter a phone number for this purchase')
  //     const phoneRegex = /^(?:\+234|0)\d{10}$/
  //     if (!phoneRegex.test(phoneToUse)) return toast.error('Enter a valid phone number (0XXXXXXXXXX or +234XXXXXXXXXX)')
  //     payload.phone = phoneToUse
  //     const res = await postBuyService(payload, { idToken })
  //     if (!res.ok) return toast.error('Purchase failed: ' + (res.body?.message || JSON.stringify(res.body)))
  //     const j = res.body
  //     const transactionId = j.result?.content?.transactions?.transactionId || j.result?.transactionId || j.result?.content?.transactionId
  //     const transactionData = {
  //       serviceID: provider,
  //       amount: Number(amount),
  //       response_description: j.result?.response_description || 'SUCCESS',
  //       transactionId: transactionId,
  //     }
  //     sessionStorage.setItem('lastTransaction', JSON.stringify(transactionData))
  //     toast.success('Subscription successful')
  //     window.location.href = '/bills/confirmation'
  //   } catch (e) { console.error(e); toast.error('Error') } finally { setProcessingWallet(false) }
  // }

  // const onPaymentSuccess_VTPass = async (reference: string, provider: 'paystack' | 'monnify') => {
  //   setShowPaymentSelector(false)
  //   setProcessing(true)
  //   try {
  //     const payload: Record<string, unknown> = { serviceID: provider, billersCode: smartcard, paystackReference: reference, provider }
  //     const matched = bouquets.find(b => b.code === amount || String(b.amount) === amount)
  //     if (matched) {
  //       payload.variation_code = matched.code
  //       payload.amount = String(matched.amount)
  //     } else {
  //       payload.amount = String(amount)
  //     }
  //     let phoneToUse = phone || ''
  //     if (!phoneToUse && verifyResult) {
  //       try { const p = extractPhoneFromVerifyResult(verifyResult); if (p) phoneToUse = p } catch {}
  //     }
  //     if (!phoneToUse) {
  //       toast.error('Enter a phone number for this purchase')
  //       setProcessing(false)
  //       return
  //     }
  //     const phoneRegex = /^(?:\+234|0)\d{10}$/
  //     if (!phoneRegex.test(phoneToUse)) {
  //       toast.error('Enter a valid phone number (0XXXXXXXXXX or +234XXXXXXXXXX)')
  //       setProcessing(false)
  //       return
  //     }
  //     payload.phone = phoneToUse
  //     const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : undefined
  //     const res = await postBuyService(payload, { idToken })
  //     const j = res.body
  //     if (!res.ok) {
  //       toast.error('Purchase failed: ' + (j?.message || JSON.stringify(j)))
  //       return
  //     }
  //     const transactionId = j.result?.content?.transactions?.transactionId || j.result?.transactionId || j.result?.content?.transactionId
  //     const transactionData = {
  //       serviceID: provider,
  //       amount: Number(amount),
  //       response_description: j.result?.response_description || 'SUCCESS',
  //       transactionId: transactionId,
  //     }
  //     sessionStorage.setItem('lastTransaction', JSON.stringify(transactionData))
  //     toast.success('Subscription successful')
  //     window.location.href = '/bills/confirmation'
  //   } catch (e) { console.error(e); toast.error('Error') } finally { setProcessing(false) }
  // }

  // const handleVerify_VTPass = async () => {
  //   if (!smartcard) return toast.error('Enter smartcard number')
  //   setVerifying(true)
  //   try {
  //     const res = await fetch('/api/bills/merchant-verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ billersCode: smartcard, serviceID: provider }) })
  //     const j = await res.json()
  //     if (!res.ok || !j?.ok) {
  //       const msg = j?.message || 'Verification failed'
  //       toast.error(String(msg))
  //       setVerifying(false)
  //       return
  //     }
  //     const resObj = j.result?.content || j.result || j
  //     setVerifyResult(resObj)
  //     try {
  //       const p = extractPhoneFromVerifyResult(resObj)
  //       if (p) setPhone(p)
  //     } catch {}
  //     toast.success('Verified')
  //   } catch (err) {
  //     console.error('verify error', err)
  //     toast.error('Verification error')
  //   }
  //   setVerifying(false)
  // }
  /* END VTPASS COMMENTED CODE */

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
          <h1 className="text-xl font-bold text-stone-900">TV Subscription</h1>
          <div className="w-[68px]" />
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card className="border border-stone-200 shadow-lg bg-white rounded-xl">
            <CardContent className="p-6 sm:p-8 space-y-6">
              {/* Cable Provider Selection */}
              <div>
                <label className="block text-sm font-semibold text-stone-900 mb-3">Select TV Provider</label>
                <div className="grid grid-cols-3 gap-2">
                  {USUF_CABLES.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setCable(c.id)}
                      className={`p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                        cable === c.id
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-stone-200 bg-white text-stone-900 hover:border-amber-300'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Smartcard Input */}
              <div>
                <label className="block text-sm font-semibold text-stone-900 mb-2">Smartcard Number</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-3 w-5 h-5 text-stone-400" />
                  <input
                    placeholder="1234567890"
                    value={smartcard}
                    onChange={(e) => setSmartcard(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Verify Button */}
              <Button
                onClick={handleVerify}
                disabled={!smartcard || verifying}
                className="w-full bg-stone-900 hover:bg-stone-800 text-white rounded-lg h-10"
              >
                {verifying ? 'Verifying...' : 'Verify Smartcard'}
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
                        ? 'Invalid Smart Card'
                        : 'Smart Card Verified'}
                    </p>
                  </div>
                  <div className={`space-y-2 text-sm ${
                    verifyResult?.invalid === true || verifyResult?.invalid === 'true'
                      ? 'text-red-800'
                      : 'text-green-800'
                  }`}>
                    {verifyResult?.name ? <div className="flex justify-between"><span>Name/Status:</span><span className="font-medium">{String(verifyResult.name)}</span></div> : null}
                    {verifyResult?.address ? <div className="flex justify-between"><span>Address:</span><span className="font-medium">{String(verifyResult.address)}</span></div> : null}
                    {verifyResult?.customer_name ? <div className="flex justify-between"><span>Customer:</span><span className="font-medium">{String(verifyResult.customer_name)}</span></div> : null}
                    {verifyResult?.phone ? <div className="flex justify-between"><span>Phone:</span><span className="font-medium">{String(verifyResult.phone)}</span></div> : null}
                  </div>
                </div>
              )}

              {/* Plans Selection */}
              {verifyResult && (verifyResult?.invalid !== true && verifyResult?.invalid !== 'true') && (
                <div>
                  <label className="block text-sm font-semibold text-stone-900 mb-3">Select Plan</label>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {availablePlans.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setPlan(p.id)
                          setAmount(String(p.amount))
                        }}
                        className={`w-full p-3 border-2 rounded-lg text-left transition-all ${
                          plan === p.id
                            ? 'border-amber-500 bg-amber-50'
                            : 'border-stone-200 bg-white hover:border-amber-300'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <p className="font-medium text-stone-900">{p.planName}</p>
                          <p className="font-semibold text-amber-600">₦{p.amount.toLocaleString()}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Price Summary */}
              {amount && verifyResult && (verifyResult?.invalid !== true && verifyResult?.invalid !== 'true') && (
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
              {verifyResult && amount && plan && (
                <>
                  <div className="space-y-2">
                    {isLoggedIn ? (
                      <>
                        <Button onClick={handleWalletPurchase} disabled={processing || processingWallet} className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold rounded-lg transition-all">{processingWallet ? 'Processing...' : 'Pay from wallet'}</Button>
                        <Button onClick={handlePurchase} disabled={processing || processingWallet} variant="outline" className="w-full">Pay with Card/Transfer</Button>
                      </>
                    ) : (
                      <>
                        <Button onClick={handlePurchase} disabled={processing} className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold rounded-lg transition-all">{processing ? 'Processing...' : 'Proceed to Payment'}</Button>
                      </>
                    )}
                    <PaymentSelector
                      open={showPaymentSelector}
                      amount={displayPrice()}
                      email={auth.currentUser?.email || ''}
                      description={`TV Subscription - ₦${displayPrice().toLocaleString()}`}
                      onClose={() => setShowPaymentSelector(false)}
                      onPaymentSuccess={onPaymentSuccess}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

