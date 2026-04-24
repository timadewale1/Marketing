"use client"

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { ArrowLeft, CheckCircle2, Hash, Lightbulb, Loader2 } from 'lucide-react'
import { PaymentSelector } from '@/components/payment-selector'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { auth, db } from '@/lib/firebase'
import { postBuyService } from '@/lib/postBuyService'
import { getVerifyPrimaryDetails } from '@/services/vtpass/utils'

type ElectricityService = {
  id: string
  name: string
}

type Variation = {
  code: string
  name: string
}

type VerifyResult = Record<string, unknown> | null

const METER_TYPES = [
  { id: 'prepaid', label: 'Prepaid' },
  { id: 'postpaid', label: 'Postpaid' },
] as const

const normalizeText = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '')

const findVariationForMeterType = (variations: Variation[], meterType: 'prepaid' | 'postpaid') => {
  const matcher = normalizeText(meterType)
  return (
    variations.find((item) => normalizeText(item.code) === matcher) ||
    variations.find((item) => normalizeText(item.name).includes(matcher)) ||
    null
  )
}

export default function ElectricityPage() {
  const [services, setServices] = useState<ElectricityService[]>([])
  const [serviceID, setServiceID] = useState('')
  const [variations, setVariations] = useState<Variation[]>([])
  const [meterType, setMeterType] = useState<'prepaid' | 'postpaid'>('prepaid')
  const [meter, setMeter] = useState('')
  const [amount, setAmount] = useState('')
  const [verifyResult, setVerifyResult] = useState<VerifyResult>(null)
  const [verifying, setVerifying] = useState(false)
  const [loadingServices, setLoadingServices] = useState(true)
  const [loadingVariations, setLoadingVariations] = useState(false)
  const [showPaymentSelector, setShowPaymentSelector] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingWallet, setProcessingWallet] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setIsLoggedIn(!!user))
    return () => unsub()
  }, [])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setLoadingServices(true)
      try {
        const response = await fetch('/api/bills/services?identifier=electricity-bill')
        const data = await response.json()
        if (!response.ok || !data?.ok || !Array.isArray(data.result)) {
          throw new Error(data?.message || 'Failed to load electricity providers')
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
        console.error('Failed to load electricity providers', error)
        toast.error('Failed to load electricity providers')
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
      setLoadingVariations(true)
      try {
        const response = await fetch(`/api/bills/variations?serviceID=${encodeURIComponent(serviceID)}`)
        const data = await response.json()
        if (!response.ok || !data?.ok || !Array.isArray(data.result)) {
          throw new Error(data?.message || 'Failed to load meter types')
        }

        const mapped = (data.result as Array<Record<string, unknown>>)
          .map((item) => ({
            code: String(item.variation_code || item.code || '').trim(),
            name: String(item.name || '').trim(),
          }))
          .filter((item) => item.code)

        if (!cancelled) {
          setVariations(mapped)
          setVerifyResult(null)
        }
      } catch (error) {
        console.error('Failed to load electricity variations', error)
        if (!cancelled) setVariations([])
      } finally {
        if (!cancelled) setLoadingVariations(false)
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

  const displayPrice = useMemo(() => Number(amount || 0), [amount])
  const selectedServiceName = services.find((item) => item.id === serviceID)?.name || 'Electricity'
  const matchedVariation = useMemo(
    () => findVariationForMeterType(variations, meterType),
    [meterType, variations]
  )

  const isInvalidMeter = verifyResult?.invalid === true || verifyResult?.invalid === 'true'
  const { name: verifiedName, address: verifiedAddress } = getVerifyPrimaryDetails(verifyResult || undefined)

  const validateForm = (requireVerifiedMeter = false) => {
    if (!serviceID) {
      toast.error('Please select a distribution company')
      return false
    }
    if (!meter.trim()) {
      toast.error('Please enter meter number')
      return false
    }
    if (!matchedVariation) {
      toast.error('Meter type is not available for this provider yet')
      return false
    }
    if (requireVerifiedMeter && !verifyResult) {
      toast.error('Please verify the meter first')
      return false
    }
    if (requireVerifiedMeter && isInvalidMeter) {
      toast.error('Please confirm the meter details before proceeding')
      return false
    }
    if (!amount || Number(amount) <= 0) {
      toast.error('Please enter amount')
      return false
    }
    return true
  }

  const handleVerify = async () => {
    if (!serviceID) {
      toast.error('Please select a distribution company')
      return
    }
    if (!meter.trim()) {
      toast.error('Please enter meter number')
      return
    }

    setVerifying(true)
    try {
      const response = await fetch('/api/bills/merchant-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceID,
          billersCode: meter,
          type: matchedVariation?.code || meterType,
          variation_code: matchedVariation?.code || meterType,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || 'Meter validation failed')
      }

      const result = (data.result?.content || data.result || null) as VerifyResult
      setVerifyResult(result)
      if (result?.invalid === true || result?.invalid === 'true') {
        toast.error('Invalid meter details')
        return
      }
      toast.success(
        result?.Customer_Name || result?.name
          ? `Meter verified for ${result.Customer_Name || result.name}`
          : 'Meter verified successfully'
      )
    } catch (error) {
      console.error('electricity verify error', error)
      setVerifyResult(null)
      toast.error(error instanceof Error ? error.message : 'Verification error')
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
      disco: selectedServiceName,
      meter,
      meterType,
      response_description: result?.response_description || 'SUCCESS',
      paymentChannel: mode,
    }

    const transactionId =
      result?.content?.transactions?.transactionId ||
      result?.transactionId ||
      result?.content?.transactionId

    if (transactionId) transactionData.transactionId = transactionId
    const token =
      result?.purchased_code ||
      result?.token ||
      result?.content?.token ||
      result?.content?.transactions?.token ||
      result?.content?.transactions?.purchased_code
    if (token) {
      transactionData.token = token
      transactionData.purchased_code = token
    }
    const requestReference = result?.requestId || result?.request_id || result?.content?.requestId || result?.content?.request_id
    if (requestReference) transactionData.requestId = requestReference

    sessionStorage.setItem('lastTransaction', JSON.stringify(transactionData))
    toast.success('Electricity payment successful')
    window.location.href = '/bills/confirmation'
  }

  const handleWalletPurchase = async () => {
    if (!auth.currentUser) {
      toast.error('Please sign in to pay from wallet')
      return
    }
    if (!validateForm(true)) return

    setProcessingWallet(true)
    try {
      await completePurchase(
        {
          serviceID,
          billersCode: meter,
          variation_code: matchedVariation?.code,
          amount: String(displayPrice),
          phone: auth.currentUser.phoneNumber || auth.currentUser.email || meter,
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
          billersCode: meter,
          variation_code: matchedVariation?.code,
          amount: String(displayPrice),
          phone: auth.currentUser?.phoneNumber || auth.currentUser?.email || meter,
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
          <h1 className="text-xl font-bold text-stone-900">Pay Electricity</h1>
          <div className="w-[68px]" />
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <Card className="rounded-xl border border-stone-200 bg-white shadow-lg">
            <CardContent className="space-y-6 p-6 sm:p-8">
              <div>
                <label className="mb-3 block text-sm font-semibold text-stone-900">Meter Type</label>
                <div className="flex gap-3">
                  {METER_TYPES.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setMeterType(item.id)
                        setVerifyResult(null)
                      }}
                      className={`flex-1 rounded border-2 px-3 py-2 font-medium transition-all ${
                        meterType === item.id
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-stone-200 bg-white text-stone-900 hover:border-amber-300'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-stone-900">Distribution Company</label>
                {loadingServices ? (
                  <div className="h-11 animate-pulse rounded-lg bg-stone-100" />
                ) : (
                  <select
                    value={serviceID}
                    onChange={(event) => {
                      setServiceID(event.target.value)
                      setVerifyResult(null)
                    }}
                    className="w-full rounded-lg border border-stone-200 px-4 py-2.5 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {services.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-stone-900">Meter Number</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-3 h-5 w-5 text-stone-400" />
                  <input
                    placeholder="1234567890"
                    value={meter}
                    onChange={(event) => {
                      setMeter(event.target.value)
                      setVerifyResult(null)
                    }}
                    className="w-full rounded-lg border border-stone-200 py-2.5 pl-10 pr-4 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <Button
                onClick={handleVerify}
                disabled={!meter || !serviceID || verifying || loadingVariations}
                className="h-10 w-full rounded-lg bg-stone-900 text-white hover:bg-stone-800"
              >
                {verifying || loadingVariations ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {loadingVariations ? 'Loading meter type...' : 'Verifying...'}
                  </span>
                ) : (
                  'Verify Meter'
                )}
              </Button>

              {verifyResult && (
                <div
                  className={`space-y-3 rounded-lg border p-4 ${
                    isInvalidMeter ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`h-5 w-5 ${isInvalidMeter ? 'text-red-600' : 'text-green-600'}`} />
                    <div className={`${isInvalidMeter ? 'text-red-900' : 'text-green-900'} text-sm`}>
                      <p className="font-semibold">
                        {isInvalidMeter
                          ? 'Invalid Meter'
                          : verifiedName
                            ? `Meter Verified: ${verifiedName}`
                            : 'Meter Verified'}
                      </p>
                      {!isInvalidMeter && verifiedAddress ? (
                        <p className="mt-1 text-xs leading-5 text-green-800">{verifiedAddress}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

              {verifyResult && !isInvalidMeter && (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-stone-900">Amount (N)</label>
                    <div className="relative">
                      <Lightbulb className="absolute left-3 top-3 h-5 w-5 text-stone-400" />
                      <input
                        type="number"
                        placeholder="5000"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        className="w-full rounded-lg border border-stone-200 py-2.5 pl-10 pr-4 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  {amount && (
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

                  <div className="space-y-2">
                    {isLoggedIn ? (
                      <>
                        <Button
                          onClick={handleWalletPurchase}
                          disabled={
                            processingWallet ||
                            processing ||
                            (walletBalance !== null && displayPrice > walletBalance)
                          }
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

                  <PaymentSelector
                    open={showPaymentSelector}
                    amount={displayPrice}
                    email={auth.currentUser?.email || ''}
                    description={`${selectedServiceName} Electricity - N${displayPrice.toLocaleString()}`}
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
