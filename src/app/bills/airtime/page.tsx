"use client"

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { ArrowLeft, Smartphone, Zap } from 'lucide-react'
import { PaymentSelector } from '@/components/payment-selector'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { auth, db } from '@/lib/firebase'
import { postBuyService } from '@/lib/postBuyService'

type AirtimeNetwork = {
  id: string
  name: string
}

const FALLBACK_NETWORKS: AirtimeNetwork[] = [
  { id: 'mtn', name: 'MTN' },
  { id: 'glo', name: 'GLO' },
  { id: 'airtel', name: 'AIRTEL' },
  { id: '9mobile', name: '9MOBILE' },
]

export default function AirtimePage() {
  const [network, setNetwork] = useState('')
  const [networks, setNetworks] = useState<AirtimeNetwork[]>([])
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [loadingNetworks, setLoadingNetworks] = useState(true)
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
      setLoadingNetworks(true)
      try {
        const response = await fetch('/api/bills/services?identifier=airtime')
        const data = await response.json()
        if (!response.ok || !data?.ok || !Array.isArray(data.result)) {
          throw new Error(data?.message || 'Failed to load airtime networks')
        }

        const mapped = (data.result as Array<Record<string, unknown>>)
          .map((item) => ({
            id: String(item.serviceID || item.code || item.id || '').trim(),
            name: String(item.name || item.title || '').trim(),
          }))
          .filter((item) => item.id && item.name)

        const nextNetworks = mapped.length ? mapped : FALLBACK_NETWORKS
        if (!cancelled) {
          setNetworks(nextNetworks)
          setNetwork((current) => current || nextNetworks[0]?.id || '')
        }
      } catch (error) {
        console.error('Failed to load airtime networks', error)
        if (!cancelled) {
          setNetworks(FALLBACK_NETWORKS)
          setNetwork((current) => current || FALLBACK_NETWORKS[0].id)
        }
      } finally {
        if (!cancelled) setLoadingNetworks(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

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
  const selectedNetworkName = networks.find((item) => item.id === network)?.name || 'Airtime'

  const validateForm = () => {
    if (!network) {
      toast.error('Please select a network')
      return false
    }
    if (!phone.trim()) {
      toast.error('Please enter phone number')
      return false
    }
    if (!amount || Number(amount) <= 0) {
      toast.error('Please enter amount')
      return false
    }
    return true
  }

  const completePurchase = async (
    payload: Record<string, unknown>,
    mode: 'wallet' | 'paystack' | 'monnify' | 'external'
  ) => {
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : undefined
    const response = await postBuyService(payload, { idToken })
    if (!response.ok) {
      throw new Error(response.body?.message || 'Purchase failed')
    }

    const result = response.body?.result || {}
    const transactionData: Record<string, unknown> = {
      serviceID: network,
      amount: displayPrice,
      network: selectedNetworkName,
      phone,
      response_description: result?.response_description || 'SUCCESS',
      paymentChannel: mode,
    }

    const transactionId =
      result?.content?.transactions?.transactionId ||
      result?.transactionId ||
      result?.content?.transactionId

    if (transactionId) transactionData.transactionId = transactionId

    sessionStorage.setItem('lastTransaction', JSON.stringify(transactionData))
    toast.success('Airtime purchased successfully')
    window.location.href = '/bills/confirmation'
  }

  const handleWalletPurchase = async () => {
    if (!auth.currentUser) {
      toast.error('Please sign in to pay from wallet')
      return
    }
    if (!validateForm()) return

    setProcessingWallet(true)
    try {
      await completePurchase(
        {
          serviceID: network,
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
    if (!validateForm()) return
    setShowPaymentSelector(true)
  }

  const onPaymentSuccess = async (reference: string, provider: 'paystack' | 'monnify') => {
    setShowPaymentSelector(false)
    setProcessing(true)
    try {
      await completePurchase(
        {
          serviceID: network,
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
          <h1 className="text-xl font-bold text-stone-900">Buy Airtime</h1>
          <div className="w-[68px]" />
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <Card className="rounded-xl border border-stone-200 bg-white shadow-lg">
            <CardContent className="space-y-6 p-6 sm:p-8">
              <div>
                <label className="mb-3 block text-sm font-semibold text-stone-900">Select Network</label>
                {loadingNetworks ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div key={index} className="h-12 animate-pulse rounded-lg bg-stone-100" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {networks.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setNetwork(item.id)}
                        className={`rounded-lg border-2 p-3 font-medium transition-all ${
                          network === item.id
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
                <label className="mb-2 block text-sm font-semibold text-stone-900">Phone Number</label>
                <div className="relative">
                  <Smartphone className="absolute left-3 top-3 h-5 w-5 text-stone-400" />
                  <input
                    placeholder="08012345678"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="w-full rounded-lg border border-stone-200 py-2.5 pl-10 pr-4 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-stone-900">Amount (N)</label>
                <div className="relative">
                  <Zap className="absolute left-3 top-3 h-5 w-5 text-stone-400" />
                  <input
                    type="number"
                    placeholder="500"
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
                        processing ||
                        processingWallet ||
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
                description={`${selectedNetworkName} Airtime - N${displayPrice.toLocaleString()}`}
                onClose={() => setShowPaymentSelector(false)}
                onPaymentSuccess={onPaymentSuccess}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
