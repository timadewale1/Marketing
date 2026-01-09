"use client"

import React, { useEffect, useState } from 'react'
import { PaystackModal } from '@/components/paystack-modal'
import { postBuyService } from '@/lib/postBuyService'
import Link from 'next/link'
// bypass Paystack: call VTpass directly
import { applyMarkup, formatVerifyResult, extractPhoneFromVerifyResult, filterVerifyResultByService } from '@/services/vtpass/utils'
import { Hash, ArrowLeft, Zap, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { Card, CardContent } from '@/components/ui/card'

export default function ElectricityPage() {
  const [meter, setMeter] = useState('')
  const [disco, setDisco] = useState('ikeja-electric')
  const [meterType, setMeterType] = useState('prepaid' as 'prepaid'|'postpaid')
  const [amount, setAmount] = useState('')
  const [discos, setDiscos] = useState<Array<{ id: string; name: string }>>([])
  const [verifyResult, setVerifyResult] = useState<Record<string, unknown> | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [phone, setPhone] = useState('')
  const [paystackOpen, setPaystackOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingWallet, setProcessingWallet] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setIsLoggedIn(!!u))
    return () => unsub()
  }, [])

  const displayPrice = () => Number(amount || 0)

  const handlePurchase = async () => {
    setPaystackOpen(true)
  }

  const handleWalletPurchase = async () => {
    if (!auth.currentUser) return toast.error('Please sign in to pay from wallet')
    const phoneToUse = phone || ''
    if (!phoneToUse) return toast.error('Enter a phone number for this purchase')
    const phoneRegex = /^(?:\+234|0)\d{10}$/
    if (!phoneRegex.test(phoneToUse)) return toast.error('Enter a valid phone number (0XXXXXXXXXX or +234XXXXXXXXXX)')
    if (!amount) return toast.error('Please enter amount')
    setProcessingWallet(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const payload: Record<string, unknown> = { request_id: `aljd-${Date.now()}`, serviceID: disco, amount: String(amount), billersCode: meter, payFromWallet: true }
      const variationCode = meterType === 'postpaid' ? 'postpaid' : 'prepaid'
      payload.variation_code = variationCode
      payload.phone = phoneToUse
      const res = await postBuyService(payload, { idToken })
      if (!res.ok) return toast.error('Purchase failed: ' + (res.body?.message || JSON.stringify(res.body)))
      const j = res.body
      const transactionId = j.result?.content?.transactions?.transactionId || j.result?.transactionId || j.result?.content?.transactionId
      const transactionData = {
        serviceID: disco,
        amount: Number(amount),
        purchased_code: j.result?.purchased_code || j.result?.content?.transactions?.unique_element,
        response_description: j.result?.response_description || 'SUCCESS',
        transactionId: transactionId,
      }
      sessionStorage.setItem('lastTransaction', JSON.stringify(transactionData))
      toast.success('Electricity paid')
      window.location.href = '/bills/confirmation'
    } catch (e) { console.error(e); toast.error('Error') } finally { setProcessingWallet(false) }
  }

  const onPaystackSuccess = async (reference: string) => {
    setPaystackOpen(false)
    setProcessing(true)
    try {
      const payload: Record<string, unknown> = { request_id: `aljd-${Date.now()}`, serviceID: disco, amount: String(amount), billersCode: meter, paystackReference: reference }
      const variationCode = meterType === 'postpaid' ? 'postpaid' : 'prepaid'
      payload.variation_code = variationCode
      // Ensure phone is provided (try to derive from verify result if possible)
      let phoneToUse = phone || ''
      if (!phoneToUse && verifyResult) {
        try { const p = extractPhoneFromVerifyResult(verifyResult); if (p) phoneToUse = p } catch {}
      }
      if (!phoneToUse) {
        toast.error('Enter a phone number for this purchase')
        setProcessing(false)
        return
      }
      const phoneRegex = /^(?:\+234|0)\d{10}$/
      if (!phoneRegex.test(phoneToUse)) {
        toast.error('Enter a valid phone number (0XXXXXXXXXX or +234XXXXXXXXXX)')
        setProcessing(false)
        return
      }
      payload.phone = phoneToUse
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : undefined
      const res = await postBuyService(payload, { idToken })
      const j = res.body
      if (!res.ok) return toast.error('Purchase failed: ' + (j?.message || JSON.stringify(j)))
      const transactionId = j.result?.content?.transactions?.transactionId || j.result?.transactionId || j.result?.content?.transactionId || j.result?.content?.transactions?.unique_element
      const transactionData = {
        serviceID: disco,
        amount: Number(amount),
        purchased_code: j.result?.purchased_code || j.result?.content?.transactions?.unique_element,
        response_description: j.result?.response_description || 'SUCCESS',
        transactionId: transactionId,
      }
      sessionStorage.setItem('lastTransaction', JSON.stringify(transactionData))
      toast.success('Electricity paid')
      window.location.href = '/bills/confirmation'
    } catch (e) { console.error(e); toast.error('Error') } finally { setProcessing(false) }
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/bills/services?identifier=electricity-bill')
        const j = await res.json()
        if (res.ok && j?.ok && Array.isArray(j.result) && mounted) {
          const mapped = (j.result as Array<Record<string, unknown>>).map(s => ({ id: String(s['serviceID'] || s['code'] || s['id'] || ''), name: String(s['name'] || s['title'] || '') }))
          setDiscos(mapped)
          if (mapped[0] && mapped[0].id) setDisco(mapped[0].id)
        }
      } catch (e) {
        console.error(e)
      }
    })()
    return () => { mounted = false }
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

  const handleVerify = async () => {
    setVerifying(true)
    try {
      const payload: Record<string, unknown> = { billersCode: meter, serviceID: disco }
      if (meterType === 'postpaid') payload.type = 'postpaid'
      const res = await fetch('/api/bills/merchant-verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json()
      if (!res.ok || !j?.ok) {
        const msg = j?.message || 'Verification failed'
        toast.error(String(msg))
        setVerifying(false)
        return
      }
      // prefer the VTpass `content` object when present
      const resObj = j.result?.content || j.result || j
      setVerifyResult(resObj)
      try {
        const p = extractPhoneFromVerifyResult(resObj)
        if (p) setPhone(p)
      } catch {}
      toast.success('Verified')
    } catch (err) {
      console.error('verify error', err)
      toast.error('Verification error')
    }
    setVerifying(false)
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
              {/* Disco Selection */}
              <div>
                <label className="block text-sm font-semibold text-stone-900 mb-2">Select Distribution Company</label>
                <div className="flex gap-2">
                  <select value={meterType} onChange={(e) => setMeterType(e.target.value as 'prepaid'|'postpaid') } className="w-1/2 px-4 py-2.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent">
                    <option value="prepaid">Prepaid</option>
                    <option value="postpaid">Postpaid</option>
                  </select>
                  <select
                    value={disco}
                    onChange={(e) => setDisco(e.target.value)}
                    className="w-1/2 px-4 py-2.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  >
                  {discos.length ? discos.map(d => <option key={d.id} value={d.id}>{d.name}</option>) : (
                    <>
                      <option value="ikeja-electric">Ikeja Electric</option>
                      <option value="eko-electric">Eko Electric</option>
                    </>
                  )}
                </select>
              </div>
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
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <p className="text-sm font-semibold text-green-900">Account Verified</p>
                  </div>
                      <div className="space-y-2">
                        {formatVerifyResult(filterVerifyResultByService(verifyResult, ['Customer_Name', 'Address', 'Meter_Number', 'Minimum_Amount', 'Min_Purchase_Amount'])).map((item) => (
                          <div key={item.label} className="flex justify-between text-sm">
                            <span className="text-green-800">{item.label}:</span>
                            <span className="text-green-900 font-medium">{item.value || 'N/A'}</span>
                          </div>
                        ))}

                        {/* Allow entering or overriding phone for services that don't return one */}
                        <div className="mt-2">
                          <label className="block text-sm font-semibold text-green-800 mb-2">Phone: Please enter your phone number below</label>
                          <input
                            placeholder="08061234567 or +2348061234567"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full pl-3 pr-3 py-2.5 border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                          />
                        </div>
                      </div>
                </div>
              )}

              {/* Amount Input */}
              {verifyResult && (
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

                  {/* Action Button */}
                  <>
                    <div className="space-y-2">
                      {isLoggedIn ? (
                        <>
                          <Button onClick={handleWalletPurchase} disabled={processing || processingWallet} className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold rounded-lg transition-all">{processingWallet ? 'Processing...' : 'Pay from wallet'}</Button>
                          <Button onClick={async () => { if (!amount) { toast.error('Please enter amount'); return } await handlePurchase() }} disabled={processing || processingWallet} variant="outline" className="w-full">Pay with Paystack</Button>
                        </>
                      ) : (
                        <>
                          <Button onClick={async () => { if (!amount) { toast.error('Please enter amount'); return } await handlePurchase() }} disabled={processing} className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold rounded-lg transition-all">{processing ? 'Processing...' : 'Proceed to Payment'}</Button>
                        </>
                      )}
                      <PaystackModal amount={displayPrice()} email={''} open={paystackOpen} onClose={() => setPaystackOpen(false)} onSuccess={onPaystackSuccess} />
                    </div>
                  </>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Paystack removed: payments go through server handler at /api/bills/buy-service */}
    </div>
  )
}
