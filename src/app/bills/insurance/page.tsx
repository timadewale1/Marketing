"use client"

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react'
import { PaymentSelector } from '@/components/payment-selector'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { auth, db } from '@/lib/firebase'
import { postBuyService } from '@/lib/postBuyService'

type InsurancePlan = { code: string; name: string; amount: number }
type OptionItem = { code: string; name: string }

const mapOption = (item: Record<string, unknown>, pairs: Array<[string, string]>): OptionItem => {
  for (const [codeKey, nameKey] of pairs) {
    const code = String(item[codeKey] || '').trim()
    const name = String(item[nameKey] || '').trim()
    if (code && name) return { code, name }
  }
  return { code: '', name: '' }
}

export default function InsurancePage() {
  const [plans, setPlans] = useState<InsurancePlan[]>([])
  const [engineOptions, setEngineOptions] = useState<OptionItem[]>([])
  const [colorOptions, setColorOptions] = useState<OptionItem[]>([])
  const [brandOptions, setBrandOptions] = useState<OptionItem[]>([])
  const [modelOptions, setModelOptions] = useState<OptionItem[]>([])
  const [stateOptions, setStateOptions] = useState<OptionItem[]>([])
  const [lgaOptions, setLgaOptions] = useState<OptionItem[]>([])

  const [plan, setPlan] = useState('')
  const [phone, setPhone] = useState('')
  const [insuredName, setInsuredName] = useState('')
  const [engineCapacity, setEngineCapacity] = useState('')
  const [chasisNumber, setChasisNumber] = useState('')
  const [plateNumber, setPlateNumber] = useState('')
  const [vehicleMake, setVehicleMake] = useState('')
  const [vehicleColor, setVehicleColor] = useState('')
  const [vehicleModel, setVehicleModel] = useState('')
  const [yearOfMake, setYearOfMake] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [lgaCode, setLgaCode] = useState('')
  const [email, setEmail] = useState('')

  const [loading, setLoading] = useState(true)
  const [loadingModels, setLoadingModels] = useState(false)
  const [loadingLgas, setLoadingLgas] = useState(false)
  const [showPaymentSelector, setShowPaymentSelector] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingWallet, setProcessingWallet] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsLoggedIn(!!user)
      if (user?.email && !email) setEmail(user.email)
    })
    return () => unsub()
  }, [email])

  useEffect(() => {
    let unsubBalance: (() => void) | null = null
    const setup = async (uid: string) => {
      try {
        const advertiserRef = doc(db, 'advertisers', uid)
        const advertiserSnap = await getDoc(advertiserRef)
        if (advertiserSnap.exists()) {
          setWalletBalance(Number(advertiserSnap.data()?.balance || 0))
          unsubBalance = onSnapshot(advertiserRef, (snapshot) => setWalletBalance(Number(snapshot.data()?.balance || 0)))
          return
        }
        const earnerRef = doc(db, 'earners', uid)
        const earnerSnap = await getDoc(earnerRef)
        if (earnerSnap.exists()) {
          setWalletBalance(Number(earnerSnap.data()?.balance || 0))
          unsubBalance = onSnapshot(earnerRef, (snapshot) => setWalletBalance(Number(snapshot.data()?.balance || 0)))
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
        try { unsubBalance() } catch {}
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [plansRes, engineRes, colorRes, brandRes, stateRes] = await Promise.all([
          fetch('/api/bills/variations?serviceID=ui-insure'),
          fetch('/api/bills/options?type=engine-capacity'),
          fetch('/api/bills/options?type=color'),
          fetch('/api/bills/options?type=brand'),
          fetch('/api/bills/options?type=state'),
        ])
        const [plansJson, engineJson, colorJson, brandJson, stateJson] = await Promise.all([
          plansRes.json(),
          engineRes.json(),
          colorRes.json(),
          brandRes.json(),
          stateRes.json(),
        ])

        if (!cancelled && plansRes.ok && plansJson?.ok && Array.isArray(plansJson.result)) {
          const mapped = (plansJson.result as Array<Record<string, unknown>>).map((item) => ({
            code: String(item.variation_code || item.code || '').trim(),
            name: String(item.name || '').trim(),
            amount: Number(item.variation_amount || item.amount || 0),
          })).filter((item) => item.code)
          setPlans(mapped)
          setPlan(mapped[0]?.code || '')
        }

        if (!cancelled && engineRes.ok && engineJson?.ok && Array.isArray(engineJson.result)) {
          const mapped = (engineJson.result as Array<Record<string, unknown>>)
            .map((item) => mapOption(item, [['CapacityCode', 'CapacityName']]))
            .filter((item) => item.code)
          setEngineOptions(mapped)
        }

        if (!cancelled && colorRes.ok && colorJson?.ok && Array.isArray(colorJson.result)) {
          const mapped = (colorJson.result as Array<Record<string, unknown>>)
            .map((item) => mapOption(item, [['ColourCode', 'ColourName'], ['ColorCode', 'ColorName']]))
            .filter((item) => item.code)
          setColorOptions(mapped)
        }

        if (!cancelled && brandRes.ok && brandJson?.ok && Array.isArray(brandJson.result)) {
          const mapped = (brandJson.result as Array<Record<string, unknown>>)
            .map((item) => mapOption(item, [['VehicleMakeCode', 'VehicleMakeName']]))
            .filter((item) => item.code)
          setBrandOptions(mapped)
        }

        if (!cancelled && stateRes.ok && stateJson?.ok && Array.isArray(stateJson.result)) {
          const mapped = (stateJson.result as Array<Record<string, unknown>>)
            .map((item) => mapOption(item, [['StateCode', 'StateName']]))
            .filter((item) => item.code)
          setStateOptions(mapped)
        }
      } catch (error) {
        console.error('insurance bootstrap error', error)
        if (!cancelled) toast.error('Unable to load insurance options right now. Please try again shortly.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!vehicleMake) {
      setModelOptions([])
      setVehicleModel('')
      return
    }
    ;(async () => {
      setLoadingModels(true)
      try {
        const res = await fetch(`/api/bills/options?type=model&parentCode=${encodeURIComponent(vehicleMake)}`)
        const json = await res.json()
        if (!cancelled && res.ok && json?.ok && Array.isArray(json.result)) {
          const mapped = (json.result as Array<Record<string, unknown>>)
            .map((item) => mapOption(item, [['VehicleModelCode', 'VehicleModelName']]))
            .filter((item) => item.code)
          setModelOptions(mapped)
          setVehicleModel((current) => current && mapped.some((item) => item.code === current) ? current : (mapped[0]?.code || ''))
        }
      } catch (error) {
        console.error('insurance models error', error)
        if (!cancelled) toast.error('Unable to load vehicle models right now.')
      } finally {
        if (!cancelled) setLoadingModels(false)
      }
    })()
    return () => { cancelled = true }
  }, [vehicleMake])

  useEffect(() => {
    let cancelled = false
    if (!stateCode) {
      setLgaOptions([])
      setLgaCode('')
      return
    }
    ;(async () => {
      setLoadingLgas(true)
      try {
        const res = await fetch(`/api/bills/options?type=lga&parentCode=${encodeURIComponent(stateCode)}`)
        const json = await res.json()
        if (!cancelled && res.ok && json?.ok && Array.isArray(json.result)) {
          const mapped = (json.result as Array<Record<string, unknown>>)
            .map((item) => mapOption(item, [['LGACode', 'LGAName']]))
            .filter((item) => item.code)
          setLgaOptions(mapped)
          setLgaCode((current) => current && mapped.some((item) => item.code === current) ? current : (mapped[0]?.code || ''))
        }
      } catch (error) {
        console.error('insurance lgas error', error)
        if (!cancelled) toast.error('Unable to load local government areas right now.')
      } finally {
        if (!cancelled) setLoadingLgas(false)
      }
    })()
    return () => { cancelled = true }
  }, [stateCode])

  const selectedPlan = useMemo(() => plans.find((item) => item.code === plan) || null, [plan, plans])
  const displayPrice = selectedPlan?.amount || 0

  const validateForm = () => {
    if (!selectedPlan) return toast.error('Please select an insurance plan'), false
    if (!phone.trim()) return toast.error('Please enter phone number'), false
    if (!insuredName.trim()) return toast.error('Please enter insured name'), false
    if (!engineCapacity) return toast.error('Please select engine capacity'), false
    if (!chasisNumber.trim()) return toast.error('Please enter chassis number'), false
    if (!plateNumber.trim()) return toast.error('Please enter plate number'), false
    if (!vehicleMake) return toast.error('Please select vehicle make'), false
    if (!vehicleColor) return toast.error('Please select vehicle color'), false
    if (!vehicleModel) return toast.error('Please select vehicle model'), false
    if (!yearOfMake.trim()) return toast.error('Please enter year of make'), false
    if (!stateCode) return toast.error('Please select state'), false
    if (!lgaCode) return toast.error('Please select local government area'), false
    if (!email.trim()) return toast.error('Please enter email address'), false
    return true
  }

  const buildPayload = () => ({
    serviceID: 'ui-insure',
    variation_code: plan,
    amount: String(displayPrice),
    phone,
    billersCode: plateNumber.trim().toUpperCase(),
    Plate_Number: plateNumber.trim().toUpperCase(),
    Insured_Name: insuredName.trim(),
    engine_capacity: engineCapacity,
    Chasis_Number: chasisNumber.trim(),
    vehicle_make: vehicleMake,
    vehicle_color: vehicleColor,
    vehicle_model: vehicleModel,
    YearofMake: yearOfMake.trim(),
    state: stateCode,
    lga: lgaCode,
    email: email.trim(),
  })

  const saveTransactionAndRedirect = (result: Record<string, unknown>) => {
    const transactionData: Record<string, unknown> = {
      serviceID: 'ui-insure',
      amount: result.amount ?? displayPrice,
      response_description: result.response_description || 'SUCCESS',
      purchased_code: result.purchased_code || '',
      certUrl: result.certUrl || '',
      requestId: result.requestId || result.request_id || '',
      transactionId:
        result?.content && typeof result.content === 'object' && (result.content as Record<string, unknown>).transactions && typeof (result.content as Record<string, unknown>).transactions === 'object'
          ? ((result.content as Record<string, unknown>).transactions as Record<string, unknown>).transactionId
          : result.transactionId,
    }
    sessionStorage.setItem('lastTransaction', JSON.stringify(transactionData))
    toast.success('Insurance payment successful')
    window.location.href = '/bills/confirmation'
  }

  const handleWalletPurchase = async () => {
    if (!auth.currentUser) return toast.error('Please sign in to pay from wallet')
    if (!validateForm()) return
    setProcessingWallet(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const payload = { ...buildPayload(), payFromWallet: true }
      const res = await postBuyService(payload, { idToken })
      if (!res.ok) return toast.error(res.body?.message || 'Purchase failed')
      saveTransactionAndRedirect((res.body?.result || {}) as Record<string, unknown>)
    } catch (error) {
      console.error(error)
      toast.error('Unable to complete insurance purchase right now.')
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
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : undefined
      const payload = { ...buildPayload(), paystackReference: reference, provider }
      const res = await postBuyService(payload, { idToken })
      if (!res.ok) {
        toast.error(res.body?.message || 'Purchase failed')
        return
      }
      saveTransactionAndRedirect((res.body?.result || {}) as Record<string, unknown>)
    } catch (error) {
      console.error(error)
      toast.error('Unable to complete insurance purchase right now.')
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
          <h1 className="text-xl font-bold text-stone-900">Motor Insurance</h1>
          <div className="w-[68px]" />
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <Card className="rounded-xl border border-stone-200 bg-white shadow-lg">
            <CardContent className="space-y-6 p-6 sm:p-8">
              {loading ? (
                <div className="flex items-center justify-center py-20 text-stone-600">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading insurance options...
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="h-5 w-5 text-emerald-700" />
                      <div>
                        <p className="font-semibold text-emerald-900">Third Party Motor Insurance</p>
                        <p className="text-sm text-emerald-800">Complete the vehicle details below to generate your certificate.</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <select value={plan} onChange={(e) => setPlan(e.target.value)} className="w-full rounded border p-2.5">
                      <option value="">Select insurance plan</option>
                      {plans.map((item) => (
                        <option key={item.code} value={item.code}>{item.name} - N{item.amount.toLocaleString()}</option>
                      ))}
                    </select>
                    <input placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded border p-2.5" />
                    <input placeholder="Insured name" value={insuredName} onChange={(e) => setInsuredName(e.target.value)} className="w-full rounded border p-2.5" />
                    <input placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded border p-2.5" />
                    <select value={engineCapacity} onChange={(e) => setEngineCapacity(e.target.value)} className="w-full rounded border p-2.5">
                      <option value="">Select engine capacity</option>
                      {engineOptions.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                    </select>
                    <input placeholder="Year of make" value={yearOfMake} onChange={(e) => setYearOfMake(e.target.value)} className="w-full rounded border p-2.5" />
                    <input placeholder="Plate number" value={plateNumber} onChange={(e) => setPlateNumber(e.target.value.toUpperCase())} className="w-full rounded border p-2.5" />
                    <input placeholder="Chassis number" value={chasisNumber} onChange={(e) => setChasisNumber(e.target.value)} className="w-full rounded border p-2.5" />
                    <select value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)} className="w-full rounded border p-2.5">
                      <option value="">Select vehicle make</option>
                      {brandOptions.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                    </select>
                    <select value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} className="w-full rounded border p-2.5" disabled={loadingModels || !vehicleMake}>
                      <option value="">{loadingModels ? 'Loading vehicle models...' : 'Select vehicle model'}</option>
                      {modelOptions.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                    </select>
                    <select value={vehicleColor} onChange={(e) => setVehicleColor(e.target.value)} className="w-full rounded border p-2.5">
                      <option value="">Select vehicle color</option>
                      {colorOptions.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                    </select>
                    <select value={stateCode} onChange={(e) => setStateCode(e.target.value)} className="w-full rounded border p-2.5">
                      <option value="">Select state</option>
                      {stateOptions.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                    </select>
                    <select value={lgaCode} onChange={(e) => setLgaCode(e.target.value)} className="w-full rounded border p-2.5 md:col-span-2" disabled={loadingLgas || !stateCode}>
                      <option value="">{loadingLgas ? 'Loading local government areas...' : 'Select local government area'}</option>
                      {lgaOptions.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                    </select>
                  </div>

                  {selectedPlan ? (
                    <div className="rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-stone-50 p-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between border-t border-amber-200 pt-2">
                          <span className="font-semibold text-stone-900">Total:</span>
                          <span className="text-lg font-bold text-amber-600">N{displayPrice.toLocaleString()}</span>
                        </div>
                        {isLoggedIn && walletBalance !== null ? (
                          <div className="flex items-center justify-between text-sm text-stone-600">
                            <span>Wallet balance:</span>
                            <span className="font-medium">N{Number(walletBalance).toLocaleString()}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {selectedPlan ? (
                    <div className="space-y-2">
                      {isLoggedIn ? (
                        <>
                          <Button
                            onClick={handleWalletPurchase}
                            disabled={processing || processingWallet || (walletBalance !== null && displayPrice > walletBalance)}
                            className="h-12 w-full rounded-lg bg-amber-500 font-semibold text-stone-900 transition-all hover:bg-amber-600"
                          >
                            {processingWallet ? 'Processing...' : walletBalance !== null && displayPrice > walletBalance ? 'Insufficient funds' : 'Pay from wallet'}
                          </Button>
                          <Button onClick={handleCardPurchase} disabled={processing || processingWallet} variant="outline" className="w-full">
                            {processing ? 'Processing...' : 'Pay with Card'}
                          </Button>
                        </>
                      ) : (
                        <Button onClick={handleCardPurchase} disabled={processing} className="h-12 w-full rounded-lg bg-amber-500 font-semibold text-stone-900 transition-all hover:bg-amber-600">
                          {processing ? 'Processing...' : 'Proceed to Payment'}
                        </Button>
                      )}
                    </div>
                  ) : null}
                </>
              )}

              <PaymentSelector
                open={showPaymentSelector}
                amount={displayPrice}
                email={email}
                description={`Motor insurance - ${selectedPlan?.name || 'Plan'}`}
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
