"use client"

import React, { useEffect, useState } from 'react'
import { PaymentSelector } from '@/components/payment-selector'
import { postBuyService } from '@/lib/postBuyService'
import Link from 'next/link'
// bypass Paystack: call VTpass directly
import DataPlanSelector from '@/components/bills/DataPlanSelector'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, Loader2, Smartphone } from 'lucide-react'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { USUF_NETWORKS, type UsufNetwork, getPlansGrouped, type UsufPlanWithSelling } from '@/services/usufPlans'
import { buyUsufData } from '@/services/usuf'

type DataPlan = { code: string; name: string; amount: number }

type Provider = 'vtpass' | 'usuf'

export default function DataPage() {
  const [provider, setProvider] = useState<Provider>('vtpass')
  const [amount, setAmount] = useState('')
  const [service, setService] = useState('')
  const [services, setServices] = useState<Array<{ id: string; name: string }>>([])
  const [plan, setPlan] = useState('')
  const [plans, setPlans] = useState<DataPlan[]>([])
  const [phone, setPhone] = useState('')
  
  // Usuf states
  const [selectedNetwork, setSelectedNetwork] = useState<UsufNetwork | null>(null)
  const [usufGrouped, setUsufGrouped] = useState<{
    networkId: UsufNetwork
    networkName: string
    groups: Array<{ planType: string; plans: UsufPlanWithSelling[] }>
  } | null>(null)
  const [selectedUsufPlan, setSelectedUsufPlan] = useState<UsufPlanWithSelling | null>(null)
  
  const [loading, setLoading] = useState(true)
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
      } catch (e) { console.warn('wallet balance fetch error', e) }
    }
    const authUnsub = onAuthStateChanged(auth, (u) => {
      if (!u) { setWalletBalance(null); return }
      setup(u.uid)
    })
    return () => { authUnsub(); if (unsubBalance) try { unsubBalance() } catch {} }
  }, [])

  const displayPrice = () => {
    if (provider === 'usuf' && selectedUsufPlan) {
      return selectedUsufPlan.sellAmount
    }
    return Number(amount || 0)
  }

  const handleUsufNetworkChange = (network: UsufNetwork) => {
    setSelectedNetwork(network)
    const grouped = getPlansGrouped(network)
    setUsufGrouped(grouped)
    setSelectedUsufPlan(null)
    setAmount('')
  }

  const handleUsufPlanSelect = (plan: UsufPlanWithSelling) => {
    setSelectedUsufPlan(plan)
    setAmount(String(plan.sellAmount))
  }

  const handleUsufPurchase = async (paymentProvider?: 'usuf_wallet' | 'monnify') => {
    if (!selectedUsufPlan) return toast.error('Please select a plan')
    if (!phone) return toast.error('Please enter a phone number')
    if (!auth.currentUser) return toast.error('Please sign in to make a purchase')

    const isWallet = paymentProvider === 'usuf_wallet'
    if (isWallet) setProcessingWallet(true)
    else setProcessing(true)

    try {
      const response = await buyUsufData(
        phone,
        selectedUsufPlan.network,
        selectedUsufPlan.id,
        true, // ported number
      )

      console.log('Usuf purchase response:', response)

      if (!response.status) {
        const errorMsg = response.message || 'Purchase failed'
        console.error('Usuf API error details:', response.apiResponse)
        return toast.error(errorMsg)
      }

      const transactionData = {
        provider: 'usuf',
        amount: selectedUsufPlan.sellAmount,
        network: selectedUsufPlan.networkName,
        planId: selectedUsufPlan.id,
        planSize: selectedUsufPlan.size,
        phone,
        timestamp: new Date().toISOString(),
        transactionId: response.data?.reference || undefined,
        response_description: response.message || response.apiResponse?.api_response || response.apiResponse?.api_response_message || undefined,
      }

      sessionStorage.setItem('lastTransaction', JSON.stringify(transactionData))
      toast.success('Purchase successful')
      window.location.href = '/bills/confirmation'
    } catch (e) {
      console.error('Usuf purchase exception:', e)
      toast.error('Error processing purchase')
    } finally {
      if (isWallet) setProcessingWallet(false)
      else setProcessing(false)
    }
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/bills/services?identifier=data')
        const j = await res.json()
        if (res.ok && j?.ok && Array.isArray(j.result) && mounted) {
          const mapped = (j.result as Array<Record<string, unknown>>).map(s => ({ id: String(s['serviceID'] || s['code'] || s['id'] || ''), name: String(s['name'] || s['title'] || '') }))
          setServices(mapped)
          const first = mapped[0]
          const sid = first?.id || 'data'
          setService(sid)
        }
      } catch (e) {
        console.error(e)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    let mounted = true
    if (!service) return
    ;(async () => {
      try {
        const res = await fetch(`/api/bills/variations?serviceID=${encodeURIComponent(service)}`)
        const j = await res.json()
        if (res.ok && j?.ok && Array.isArray(j.result) && mounted) {
          const mapped = (j.result as Array<Record<string, unknown>>).map(v => ({ code: String(v['variation_code'] || v['code'] || ''), name: String(v['name'] || ''), amount: Number(v['variation_amount'] || v['amount'] || 0) }))
          setPlans(mapped)
          if (mapped[0]) {
            setPlan(mapped[0].code)
            setAmount(String(mapped[0].amount))
          }
        }
      } catch (e) {
        console.error(e)
      }
    })()
    return () => { mounted = false }
  }, [service])

  const handlePurchase = async () => {
    setShowPaymentSelector(true)
  }

  const handleWalletPurchase = async () => {
    if (!auth.currentUser) return toast.error('Please sign in to pay from wallet')
    if (!phone) return toast.error('Please enter phone number')
    setProcessingWallet(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const payload: Record<string, unknown> = { serviceID: service || 'data', variation_code: plan, phone, payFromWallet: true }
      const matched = plans.find(p => p.code === plan)
      if (matched) payload.amount = String(matched.amount)
      const res = await postBuyService(payload, { idToken })
      if (!res.ok) return toast.error('Purchase failed: ' + (res.body?.message || JSON.stringify(res.body)))
      const j = res.body
      const matched2 = plans.find(p => p.code === plan)
      const transactionData: Record<string, unknown> = {
        serviceID: service || 'data',
        amount: matched2?.amount || Number(payload.amount),
        response_description: j.result?.response_description || 'SUCCESS',
      }
      const txid = j.result?.content?.transactions?.transactionId || j.result?.transactionId || j.result?.content?.transactionId
      if (txid) transactionData.transactionId = txid
      sessionStorage.setItem('lastTransaction', JSON.stringify(transactionData))
      toast.success('Purchase successful')
      window.location.href = '/bills/confirmation'
    } catch (e) {
      console.error(e)
      toast.error('Error processing purchase')
    } finally { setProcessingWallet(false) }
  }

  const onPaymentSuccess = async (reference: string, provider: 'paystack' | 'monnify'): Promise<void> => {
    setShowPaymentSelector(false)
    setProcessing(true)
    try {
      const payload: Record<string, unknown> = { serviceID: service || 'data', variation_code: plan, phone, paystackReference: reference, provider }
      const matched = plans.find(p => p.code === plan)
      if (matched) payload.amount = String(matched.amount)
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : undefined
      const res = await postBuyService(payload, { idToken })
      const j = res.body
      if (!res.ok) {
        toast.error('Purchase failed: ' + (j?.message || JSON.stringify(j)))
        return
      }
      const matched2 = plans.find(p => p.code === plan)
      const transactionData: Record<string, unknown> = {
        serviceID: service || 'data',
        amount: matched2?.amount || Number(payload.amount),
        response_description: j.result?.response_description || 'SUCCESS',
      }
      const txid = j.result?.content?.transactions?.transactionId || j.result?.transactionId || j.result?.content?.transactionId
      if (txid) transactionData.transactionId = txid
      sessionStorage.setItem('lastTransaction', JSON.stringify(transactionData))
      toast.success('Purchase successful')
      window.location.href = '/bills/confirmation'
    } catch (e) {
      console.error(e)
      toast.error('Error processing purchase')
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
          <h1 className="text-xl font-bold text-stone-900">Buy Data</h1>
          <div className="w-[68px]" />
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Provider Tabs */}
          <div className="flex gap-2 mb-6 border-b border-stone-200">
            <button
              onClick={() => setProvider('vtpass')}
              className={`px-4 py-3 font-semibold transition-colours border-b-2 ${
                provider === 'vtpass'
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-stone-500 hover:text-stone-700'
              }`}
            >
              Data Plans
            </button>
            <button
              onClick={() => setProvider('usuf')}
              className={`px-4 py-3 font-semibold transition-colours border-b-2 ${
                provider === 'usuf'
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-stone-500 hover:text-stone-700'
              }`}
            >
              Other Data Plans
            </button>
          </div>

          <Card className="border border-stone-200 shadow-lg bg-white rounded-xl">
            <CardContent className="p-6 sm:p-8 space-y-6">
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

              {/* VTpass Plans */}
              {provider === 'vtpass' && (
                <>
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-semibold text-stone-900 mb-3">Select Network</label>
                      <select
                        value={service}
                        onChange={(e) => setService(e.target.value)}
                        className="w-full px-4 py-2.5 border border-stone-200 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        {services.length ? services.map(s => <option key={s.id} value={s.id}>{s.name}</option>) : <option value="">Select network</option>}
                      </select>
                      <label className="block text-sm font-semibold text-stone-900 mb-3">Select Data Plan</label>
                      <DataPlanSelector
                        plans={plans}
                        selectedCode={plan}
                        onSelect={(code, amt) => {
                          setPlan(code)
                          setAmount(String(amt))
                        }}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Usuf Plans */}
              {provider === 'usuf' && (
                <>
                  {/* Network Selection Dropdown */}
                  <div>
                    <label className="block text-sm font-semibold text-stone-900 mb-3">Select Network</label>
                    <select
                      value={selectedNetwork || ''}
                      onChange={(e) => handleUsufNetworkChange(Number(e.target.value) as UsufNetwork)}
                      className="w-full px-4 py-2.5 border border-stone-200 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">Select network</option>
                      {Object.entries(USUF_NETWORKS).map(([netId, netName]) => (
                        <option key={netId} value={netId}>
                          {netName}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Category Tabs */}
                  {usufGrouped && usufGrouped.groups.length > 0 && (
                    <>
                      <div className="flex gap-2 mb-4 overflow-x-auto pb-2 border-b border-stone-200">
                        {usufGrouped.groups.map((group) => (
                          <button
                            key={group.planType}
                            onClick={() => setPlan(`_category_${group.planType}`)}
                            className={`px-4 py-2 font-semibold text-sm whitespace-nowrap transition-all border-b-2 ${
                              plan === `_category_${group.planType}`
                                ? 'border-amber-500 text-amber-600'
                                : 'border-transparent text-stone-500 hover:text-stone-700'
                            }`}
                          >
                            {group.planType}
                          </button>
                        ))}
                      </div>

                      {/* Category Plans List */}
                      {usufGrouped.groups
                        .filter((g) => plan === `_category_${g.planType}`)
                        .map((group) => (
                          <div key={group.planType}>
                            <label className="block text-sm font-semibold text-stone-900 mb-3">Select Plan</label>
                            <div className="space-y-2">
                              {group.plans.map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() => handleUsufPlanSelect(p)}
                                  className={`w-full p-3 rounded-lg border-2 transition-all text-left flex items-center justify-between ${
                                    selectedUsufPlan?.id === p.id
                                      ? 'border-amber-500 bg-amber-50'
                                      : 'border-stone-200 bg-white hover:border-amber-300'
                                  }`}
                                >
                                  <div>
                                    <div className="font-semibold text-stone-900">{p.size}</div>
                                    <div className="text-xs text-stone-600">{p.validity}</div>
                                  </div>
                                  <div className="text-sm font-bold text-amber-600">₦{p.sellAmount.toLocaleString()}</div>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                    </>
                  )}
                </>
              )}

              {/* Price Summary */}
              {amount && (
                <div className="bg-gradient-to-r from-amber-50 to-stone-50 p-4 rounded-lg border border-amber-200">
                  <div className="space-y-2">
                    <div className="border-t border-amber-200 pt-2 flex justify-between">
                      <span className="font-semibold text-stone-900">Total:</span>
                      <span className="text-lg font-bold text-amber-600">₦{displayPrice().toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <>
                <div className="space-y-2">
                  {provider === 'vtpass' ? (
                    <>
                      {isLoggedIn ? (
                        <>
                          <Button onClick={handleWalletPurchase} disabled={processing || processingWallet || (walletBalance !== null && displayPrice() > walletBalance)} className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold rounded-lg transition-all">{processingWallet ? 'Processing...' : (walletBalance !== null && displayPrice() > walletBalance ? 'Insufficient funds' : 'Pay from wallet')}</Button>
                          <Button onClick={async () => { if (!phone) { toast.error('Please enter phone number'); return } await handlePurchase() }} disabled={processing || processingWallet} variant="outline" className="w-full">Pay with Card</Button>
                        </>
                      ) : (
                        <>
                          <Button onClick={async () => { if (!phone) { toast.error('Please enter phone number'); return } await handlePurchase() }} disabled={processing} className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold rounded-lg transition-all">{processing ? 'Processing...' : 'Proceed to Payment'}</Button>
                        </>
                      )}
                      <PaymentSelector
                        open={showPaymentSelector}
                        amount={displayPrice()}
                        email={auth.currentUser?.email || ''}
                        description="Bill Payment"
                        onClose={() => setShowPaymentSelector(false)}
                        onPaymentSuccess={onPaymentSuccess}
                      />
                    </>
                  ) : (
                    <>
                      {isLoggedIn ? (
                        <>
                          <Button onClick={() => handleUsufPurchase('usuf_wallet')} disabled={processing || processingWallet || (walletBalance !== null && displayPrice() > walletBalance) || !selectedUsufPlan} className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold rounded-lg transition-all">{processingWallet ? 'Processing...' : (walletBalance !== null && displayPrice() > walletBalance ? 'Insufficient funds' : 'Pay from wallet')}</Button>
                          <Button onClick={() => handleUsufPurchase('monnify')} disabled={processing || processingWallet || !selectedUsufPlan} variant="outline" className="w-full">Pay with Card</Button>
                        </>
                      ) : (
                        <>
                          <Button onClick={() => handleUsufPurchase()} disabled={processing || !selectedUsufPlan} className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold rounded-lg transition-all">{processing ? 'Processing...' : 'Proceed to Payment'}</Button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
