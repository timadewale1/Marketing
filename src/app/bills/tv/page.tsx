"use client"

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { ArrowLeft, CheckCircle2, Hash, Loader2, Phone } from 'lucide-react'
import { PaymentSelector } from '@/components/payment-selector'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { auth, db } from '@/lib/firebase'
import { postBuyService } from '@/lib/postBuyService'
import { extractPhoneFromVerifyResult, getVerifyPrimaryDetails } from '@/services/vtpass/utils'

type TVService = {
  id: string
  name: string
}

type TVPlan = {
  code: string
  name: string
  amount: number
}

type VerifyResult = Record<string, unknown> | null

export default function TVPage() {
  const [serviceID, setServiceID] = useState('')
  const [services, setServices] = useState<TVService[]>([])
  const [plans, setPlans] = useState<TVPlan[]>([])
  const [plan, setPlan] = useState('')
  const [smartcard, setSmartcard] = useState('')
  const [phone, setPhone] = useState('')
  const [verifyResult, setVerifyResult] = useState<VerifyResult>(null)
  const [loadingServices, setLoadingServices] = useState(true)
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingWallet, setProcessingWallet] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [showPaymentSelector, setShowPaymentSelector] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setIsLoggedIn(!!user))
    return () => unsub()
  }, [])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setLoadingServices(true)
      try {
        const response = await fetch('/api/bills/services?identifier=tv-subscription')
        const data = await response.json()
        if (!response.ok || !data?.ok || !Array.isArray(data.result)) {
          throw new Error()
        }

        const mapped = (data.result as Array<Record<string, unknown>>)
          .map((item) => ({
            id: String(item.serviceID || item.code || item.id || '').trim(),
            name: String(item.name || item.title || '').trim(),
          }))
          .filter((item) => item.id && item.name)

        if (!cancelled) {
          setServices(mapped)
          setServiceID((current) => current || mapped[0]?.id || '')
        }
      } catch (error) {
        console.error('Failed to load tv services', error)
        if (!cancelled) {
          toast.error('Unable to load TV providers right now. Please try again shortly.')
        }
      } finally {
        if (!cancelled) setLoadingServices(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!serviceID) return

    ;(async () => {
      setLoadingPlans(true)
      try {
        const response = await fetch(`/api/bills/variations?serviceID=${encodeURIComponent(serviceID)}`)
        const data = await response.json()
        if (!response.ok || !data?.ok || !Array.isArray(data.result)) {
          throw new Error()
        }

        const mapped = (data.result as Array<Record<string, unknown>>)
          .map((item) => ({
            code: String(item.variation_code || item.code || '').trim(),
            name: String(item.name || '').trim(),
            amount: Number(item.variation_amount || item.amount || 0),
          }))
          .filter((item) => item.code)

        if (!cancelled) {
          setPlans(mapped)
          setPlan((current) => current || mapped[0]?.code || '')
        }
      } catch (error) {
        console.error('Failed to load tv plans', error)
        if (!cancelled) {
          setPlans([])
          setPlan('')
          toast.error('Unable to load TV plans right now. Please try again shortly.')
        }
      } finally {
        if (!cancelled) setLoadingPlans(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [serviceID])

  useEffect(() => {
    let unsubBalance: (() => void) | null = null

    const setup = async (uid: string) => {
      try {
        const advertiserRef = doc(db, 'advertisers', uid)
        const advertiserSnap = await getDoc(advertiserRef)
        if (advertiserSnap.exists()) {
          setWalletBalance(Number(advertiserSnap.data()?.balance || 0))
          unsubBalance = onSnapshot(advertiserRef, (snapshot) => {
            setWalletBalance(Number(snapshot.data()?.balance || 0))
          })
          return
        }

        const earnerRef = doc(db, 'earners', uid)
        const earnerSnap = await getDoc(earnerRef)
        if (earnerSnap.exists()) {
          setWalletBalance(Number(earnerSnap.data()?.balance || 0))
          unsubBalance = onSnapshot(earnerRef, (snapshot) => {
            setWalletBalance(Number(snapshot.data()?.balance || 0))
          })
          return
        }

        setWalletBalance(null)
      } catch (error) {
        console.warn('wallet balance fetch error', error)
      }
    }

    const authUnsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setWalletBalance(null)
        return
      }
      setup(user.uid)
    })

    return () => {
      authUnsub()
      if (unsubBalance) {
        try {
          unsubBalance()
        } catch {}
      }
    }
  }, [])

  const selectedPlan = useMemo(
    () => plans.find((item) => item.code === plan) || null,
    [plan, plans]
  )
  const selectedServiceName = services.find((item) => item.id === serviceID)?.name || 'TV subscription'
  const displayPrice = selectedPlan?.amount || 0
  const { name: verifiedName, address: verifiedAddress } = getVerifyPrimaryDetails(verifyResult || undefined)

  const validateForm = (requireVerification = false) => {
    if (!serviceID) {
      toast.error('Please select a TV provider')
      return false
    }
    if (!smartcard.trim()) {
      toast.error('Please enter smartcard number')
      return false
    }
    if (requireVerification && !verifyResult) {
      toast.error('Please verify the smartcard first')
      return false
    }
    if (verifyResult?.invalid === true || verifyResult?.invalid === 'true') {
      toast.error('Please confirm the smartcard details before proceeding')
      return false
    }
    if (!selectedPlan) {
      toast.error('Please select a bouquet')
      return false
    }
    if (!phone.trim()) {
      toast.error('Please enter phone number')
      return false
    }
    return true
  }

  const handleVerify = async () => {
    if (!serviceID) return toast.error('Please select a TV provider')
    if (!smartcard.trim()) return toast.error('Please enter smartcard number')

    setVerifying(true)
    try {
      const response = await fetch('/api/bills/merchant-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billersCode: smartcard, serviceID }),
      })
      const data = await response.json()
      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || 'Verification failed')
      }

      const result = (data.result?.content || data.result || null) as VerifyResult
      setVerifyResult(result)
      try {
        const extractedPhone = extractPhoneFromVerifyResult(result)
        if (extractedPhone) setPhone(extractedPhone)
      } catch (error) {
        console.warn('Unable to extract phone from verify result', error)
      }

      if (result?.invalid === true || result?.invalid === 'true') {
        toast.error('Invalid smartcard details')
        return
      }

      toast.success('Smartcard verified successfully')
    } catch (error) {
      console.error('tv verify error', error)
      setVerifyResult(null)
      toast.error('Unable to verify this smartcard right now. Please try again shortly.')
    } finally {
      setVerifying(false)
    }
  }

  const completePurchase = async (payload: Record<string, unknown>, mode: 'wallet' | 'paystack' | 'monnify') => {
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : undefined
    const response = await postBuyService(payload, { idToken })
    if (!response.ok) {
      throw new Error(response.body?.message || 'Purchase failed')
    }

    const result = response.body?.result || {}
    const transactionData: Record<string, unknown> = {
      serviceID,
      amount: displayPrice,
      provider: selectedServiceName,
      planName: selectedPlan?.name || 'TV bouquet',
      smartcard,
      response_description: result?.response_description || 'SUCCESS',
      paymentChannel: mode,
    }

    const transactionId =
      result?.content?.transactions?.transactionId ||
      result?.transactionId ||
      result?.content?.transactionId

    if (transactionId) transactionData.transactionId = transactionId
    sessionStorage.setItem('lastTransaction', JSON.stringify(transactionData))
    toast.success('TV subscription successful')
    window.location.href = '/bills/confirmation'
  }

  const handleWalletPurchase = async () => {
    if (!auth.currentUser) return toast.error('Please sign in to pay from wallet')
    if (!validateForm(true)) return

    setProcessingWallet(true)
    try {
      await completePurchase(
        {
          serviceID,
          billersCode: smartcard,
          variation_code: selectedPlan?.code,
          amount: String(displayPrice),
          phone,
          payFromWallet: true,
        },
        'wallet'
      )
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Purchase failed')
    } finally {
      setProcessingWallet(false)
    }
  }

  const handleCardPurchase = () => {
    if (!validateForm(true)) return
    setShowPaymentSelector(true)
  }

  const onPaymentSuccess = async (reference: string, provider: 'paystack' | 'monnify') => {
    setShowPaymentSelector(false)
    setProcessing(true)
    try {
      await completePurchase(
        {
          serviceID,
          billersCode: smartcard,
          variation_code: selectedPlan?.code,
          amount: String(displayPrice),
          phone,
          paystackReference: reference,
          provider,
        },
        provider
      )
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Purchase failed')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-white to-stone-100">
      <div className="sticky top-0 z-10 border-b border-stone-200 bg-white/80 backdrop-blur-md">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Link href="/bills">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-stone-900">TV Subscription</h1>
          <div className="w-[68px]" />
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <Card className="rounded-xl border border-stone-200 bg-white shadow-lg">
            <CardContent className="space-y-6 p-6 sm:p-8">
              <div>
                <label className="mb-3 block text-sm font-semibold text-stone-900">Select TV Provider</label>
                {loadingServices ? (
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="h-12 animate-pulse rounded-lg bg-stone-100" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {services.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setServiceID(item.id)
                          setVerifyResult(null)
                        }}
                        className={`rounded-lg border-2 p-3 text-sm font-medium transition-all ${
                          serviceID === item.id
                            ? 'border-amber-500 bg-amber-50 text-amber-700'
                            : 'border-stone-200 bg-white text-stone-900 hover:border-amber-300'
                        }`}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-stone-900">Smartcard Number</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-3 h-5 w-5 text-stone-400" />
                  <input
                    placeholder="1234567890"
                    value={smartcard}
                    onChange={(event) => {
                      setSmartcard(event.target.value)
                      setVerifyResult(null)
                    }}
                    className="w-full rounded-lg border border-stone-200 py-2.5 pl-10 pr-4 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <Button
                onClick={handleVerify}
                disabled={!smartcard || !serviceID || verifying || loadingPlans}
                className="h-10 w-full rounded-lg bg-stone-900 text-white hover:bg-stone-800"
              >
                {verifying || loadingPlans ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {loadingPlans ? 'Loading bouquets...' : 'Verifying...'}
                  </span>
                ) : (
                  'Verify Smartcard'
                )}
              </Button>

              {verifyResult && (
                <div
                  className={`space-y-3 rounded-lg border p-4 ${
                    verifyResult?.invalid === true || verifyResult?.invalid === 'true'
                      ? 'border-red-200 bg-red-50'
                      : 'border-green-200 bg-green-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className={`h-5 w-5 ${
                        verifyResult?.invalid === true || verifyResult?.invalid === 'true'
                          ? 'text-red-600'
                          : 'text-green-600'
                      }`}
                    />
                    <div
                      className={`text-sm ${
                        verifyResult?.invalid === true || verifyResult?.invalid === 'true'
                          ? 'text-red-900'
                          : 'text-green-900'
                      }`}
                    >
                      <p className="font-semibold">
                        {verifyResult?.invalid === true || verifyResult?.invalid === 'true'
                          ? 'Invalid Smartcard'
                          : verifiedName
                            ? `Smartcard Verified: ${verifiedName}`
                            : 'Smartcard verified'}
                      </p>
                      {verifyResult?.invalid === true || verifyResult?.invalid === 'true' || !verifiedAddress ? null : (
                        <p className="mt-1 text-xs leading-5 text-green-800">{verifiedAddress}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {verifyResult && verifyResult?.invalid !== true && verifyResult?.invalid !== 'true' && (
                <>
                  <div>
                    <label className="mb-3 block text-sm font-semibold text-stone-900">Select Bouquet</label>
                    {loadingPlans ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, index) => (
                          <div key={index} className="h-16 animate-pulse rounded-lg bg-stone-100" />
                        ))}
                      </div>
                    ) : (
                      <div className="max-h-64 space-y-2 overflow-y-auto">
                        {plans.map((item) => (
                          <button
                            key={item.code}
                            onClick={() => setPlan(item.code)}
                            className={`w-full rounded-lg border-2 p-3 text-left transition-all ${
                              plan === item.code
                                ? 'border-amber-500 bg-amber-50'
                                : 'border-stone-200 bg-white hover:border-amber-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-medium text-stone-900">{item.name}</p>
                              <p className="font-semibold text-amber-600">N{item.amount.toLocaleString()}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-stone-900">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 h-5 w-5 text-stone-400" />
                      <input
                        placeholder="08012345678"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        className="w-full rounded-lg border border-stone-200 py-2.5 pl-10 pr-4 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  {selectedPlan && (
                    <div className="rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-stone-50 p-4">
                      <div className="space-y-2">
                        <div className="flex justify-between border-t border-amber-200 pt-2">
                          <span className="font-semibold text-stone-900">Total:</span>
                          <span className="text-lg font-bold text-amber-600">N{displayPrice.toLocaleString()}</span>
                        </div>
                        {isLoggedIn && walletBalance !== null && (
                          <div className="flex justify-between text-sm text-stone-600">
                            <span>Wallet balance:</span>
                            <span className="font-medium">N{Number(walletBalance).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedPlan && (
                    <div className="space-y-2">
                      {isLoggedIn ? (
                        <>
                          <Button
                            onClick={handleWalletPurchase}
                            disabled={processing || processingWallet || (walletBalance !== null && displayPrice > walletBalance)}
                            className="h-12 w-full rounded-lg bg-amber-500 font-semibold text-stone-900 transition-all hover:bg-amber-600"
                          >
                            {processingWallet
                              ? 'Processing...'
                              : walletBalance !== null && displayPrice > walletBalance
                                ? 'Insufficient funds'
                                : 'Pay from wallet'}
                          </Button>
                          <Button
                            onClick={handleCardPurchase}
                            disabled={processing || processingWallet}
                            variant="outline"
                            className="w-full"
                          >
                            Pay with Card
                          </Button>
                        </>
                      ) : (
                        <Button
                          onClick={handleCardPurchase}
                          disabled={processing}
                          className="h-12 w-full rounded-lg bg-amber-500 font-semibold text-stone-900 transition-all hover:bg-amber-600"
                        >
                          {processing ? 'Processing...' : 'Proceed to Payment'}
                        </Button>
                      )}
                    </div>
                  )}

                  <PaymentSelector
                    open={showPaymentSelector}
                    amount={displayPrice}
                    email={auth.currentUser?.email || ''}
                    description={`${selectedServiceName} - ${selectedPlan?.name || 'TV bouquet'}`}
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
