"use client"

import React, { useEffect, useState } from 'react'
import { PaymentSelector } from '@/components/payment-selector'
import { postBuyService } from '@/lib/postBuyService'
import { getVerifyPrimaryDetails } from '@/services/vtpass/utils'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'

export default function EducationPage() {
  const [tab, setTab] = useState<'waec-result' | 'waec-reg' | 'jamb'>('waec-result')

  const [waecPlans, setWaecPlans] = useState<Array<{ code: string; name: string; amount: number }>>([])
  const [waecPlan, setWaecPlan] = useState('')
  const [waecQty, setWaecQty] = useState(1)
  const [waecPhone, setWaecPhone] = useState('')

  const [waecRegPlans, setWaecRegPlans] = useState<Array<{ code: string; name: string; amount: number }>>([])
  const [waecRegPlan, setWaecRegPlan] = useState('')
  const [waecRegQty, setWaecRegQty] = useState(1)
  const [waecRegPhone, setWaecRegPhone] = useState('')

  const [jambPlans, setJambPlans] = useState<Array<{ code: string; name: string; amount: number }>>([])
  const [jambPlan, setJambPlan] = useState('')
  const [jambProfile, setJambProfile] = useState('')
  const [jambPhone, setJambPhone] = useState('')
  const [jambVerifyResult, setJambVerifyResult] = useState<Record<string, unknown> | null>(null)
  const [verifyingJamb, setVerifyingJamb] = useState(false)

  const [pendingPurchase, setPendingPurchase] = useState<Record<string, unknown> | null>(null)
  const [showPaymentSelector, setShowPaymentSelector] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingWallet, setProcessingWallet] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [wRes, wrRes, jRes] = await Promise.all([
          fetch('/api/bills/variations?serviceID=waec'),
          fetch('/api/bills/variations?serviceID=waec-registration'),
          fetch('/api/bills/variations?serviceID=jamb'),
        ])
        const wj = await wRes.json()
        const wrj = await wrRes.json()
        const jj = await jRes.json()

        if (mounted && wRes.ok && wj?.ok && Array.isArray(wj.result)) {
          const mapped = (wj.result as Array<Record<string, unknown>>).map((v) => ({
            code: String(v['variation_code'] || v['code'] || ''),
            name: String(v['name'] || ''),
            amount: Number(v['variation_amount'] || v['amount'] || 0),
          }))
          setWaecPlans(mapped)
          if (mapped[0]?.code) setWaecPlan(mapped[0].code)
        }

        if (mounted && wrRes.ok && wrj?.ok && Array.isArray(wrj.result)) {
          const mapped = (wrj.result as Array<Record<string, unknown>>).map((v) => ({
            code: String(v['variation_code'] || v['code'] || ''),
            name: String(v['name'] || ''),
            amount: Number(v['variation_amount'] || v['amount'] || 0),
          }))
          setWaecRegPlans(mapped)
          if (mapped[0]?.code) setWaecRegPlan(mapped[0].code)
        }

        if (mounted && jRes.ok && jj?.ok && Array.isArray(jj.result)) {
          const mapped = (jj.result as Array<Record<string, unknown>>).map((v) => ({
            code: String(v['variation_code'] || v['code'] || ''),
            name: String(v['name'] || ''),
            amount: Number(v['variation_amount'] || v['amount'] || 0),
          }))
          setJambPlans(mapped)
          if (mapped[0]?.code) setJambPlan(mapped[0].code)
        }
      } catch {
        // ignore
      }
    })()

    return () => {
      mounted = false
    }
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setIsLoggedIn(!!user))
    return () => unsub()
  }, [])

  const waecDisplayPrice = () => {
    const found = waecPlans.find((p) => p.code === waecPlan)
    return found ? found.amount * (waecQty || 1) : 0
  }

  const waecRegDisplayPrice = () => {
    const found = waecRegPlans.find((p) => p.code === waecRegPlan)
    return found ? found.amount * (waecRegQty || 1) : 0
  }

  const jambDisplayPrice = () => {
    const found = jambPlans.find((p) => p.code === jambPlan)
    return found ? found.amount : 0
  }

  const { name: jambVerifyName, address: jambVerifyAddress } = getVerifyPrimaryDetails(jambVerifyResult || undefined)

  const buildTransactionData = (
    result: Record<string, unknown> | null | undefined,
    fallback: Record<string, unknown>
  ) => {
    const resultContent = result?.content && typeof result.content === 'object'
      ? (result.content as Record<string, unknown>)
      : null
    const transactionData: Record<string, unknown> = {
      ...fallback,
      amount: result?.amount ?? resultContent?.amount ?? fallback.amount,
      response_description: result?.response_description || 'SUCCESS',
    }

    const txId =
      resultContent
        ? resultContent.transactions && typeof resultContent.transactions === 'object'
          ? (resultContent.transactions as Record<string, unknown>).transactionId
          : undefined
        : undefined
    const fallbackTxId =
      (result as Record<string, unknown> | null)?.transactionId ||
      resultContent?.transactionId
    if (txId || fallbackTxId) transactionData.transactionId = txId || fallbackTxId

    const requestReference =
      result?.requestId ||
      result?.request_id ||
      resultContent?.requestId ||
      resultContent?.request_id
    if (requestReference) transactionData.requestId = requestReference

    const cards =
      (resultContent ? resultContent.transactions && typeof resultContent.transactions === 'object'
        ? (resultContent.transactions as Record<string, unknown>).cards
        : undefined : undefined) ||
      resultContent?.cards ||
      result?.cards ||
      resultContent?.tokens ||
      result?.tokens

    if (Array.isArray(cards) && cards.length) {
      const normalizedCards: Array<Record<string, string>> = []
      for (const c of cards) {
        if (!c) continue
        if (typeof c === 'string') {
          normalizedCards.push({ Serial: c, Pin: c })
        } else if (typeof c === 'object') {
          const obj = c as Record<string, unknown>
          const Serial = String(obj['Serial'] ?? obj['serial'] ?? obj['unique_element'] ?? obj['unique'] ?? '')
          const Pin = String(obj['Pin'] ?? obj['pin'] ?? obj['PinNumber'] ?? obj['pin_number'] ?? obj['PinCode'] ?? '')
          normalizedCards.push({ Serial, Pin })
        }
      }
      if (normalizedCards.length) transactionData.cards = normalizedCards
    }

    if (Array.isArray(result?.tokens)) transactionData.tokens = result.tokens
    if (result?.purchased_code) transactionData.purchased_code = result.purchased_code
    if (result?.cards && Array.isArray(result.cards)) transactionData.cards = result.cards

    if (result?.purchased_code) {
      const rawCode = String(result.purchased_code)
      if (rawCode.includes('Serial') || /pin[:\s]/i.test(rawCode) || /Pin\s*:/i.test(rawCode)) {
        try {
          const parts = rawCode.split('||').map((p) => p.trim()).filter(Boolean)
          const parsed: Array<Record<string, string>> = []
          for (const p of parts) {
            const mSerial = p.match(/Serial\s*No[:\s]*([^,|]+)/i)
            const mPin = p.match(/pin[:\s]*([0-9A-Za-z]+)/i) || p.match(/Pin\s*[:\s]*([0-9A-Za-z]+)/i)
            if (mSerial || mPin) {
              parsed.push({ Serial: mSerial ? mSerial[1].trim() : '', Pin: mPin ? mPin[1].trim() : '' })
            }
          }
          if (parsed.length) transactionData.cards = parsed
        } catch {}
      }
    }

    const rawPin = result?.Pin || result?.pin || result?.purchased_code
    if (rawPin) {
      const raw = String(rawPin)
      const match = raw.match(/([0-9]{4,})/) || raw.match(/([0-9A-Za-z]{6,})/)
      if (match) transactionData.pin = match[1]
    }

    return transactionData
  }

  const handleCompletePurchase = async () => {
    try {
      if (!pendingPurchase) return toast.error('No pending purchase')

      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : undefined
      const res = await postBuyService(pendingPurchase, { idToken })
      const j = res.body
      if (!res.ok) return toast.error('Purchase failed')

      const transactionData = buildTransactionData(j.result || null, {
        serviceID: pendingPurchase.serviceID,
        amount: pendingPurchase.amount,
      })

      sessionStorage.setItem('lastTransaction', JSON.stringify(transactionData))
      toast.success('Purchase successful')
      window.location.href = '/bills/confirmation'
    } catch {
      toast.error('Error completing purchase')
    }
  }

  const payNowWithWallet = async (payload: Record<string, unknown>) => {
    if (!auth.currentUser) return toast.error('Please sign in to pay from wallet')

    setProcessingWallet(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      payload.payFromWallet = true
      const res = await postBuyService(payload, { idToken })
      if (!res.ok) return toast.error(res.body?.message || 'Purchase failed')

      const j = res.body
      const transactionData = buildTransactionData(j.result || null, {
        serviceID: payload.serviceID,
        amount: payload.amount,
      })
      sessionStorage.setItem('lastTransaction', JSON.stringify(transactionData))
      toast.success('Purchase successful')
      window.location.href = '/bills/confirmation'
    } catch (error) {
      console.error(error)
      toast.error('Error completing purchase')
    } finally {
      setProcessingWallet(false)
    }
  }

  const startWaecPurchase = (open = true) => {
    const found = waecPlans.find((p) => p.code === waecPlan)
    if (!found) return toast.error('Choose a plan')

    const payload: Record<string, unknown> = {
      serviceID: 'waec',
      variation_code: waecPlan,
      quantity: waecQty,
      amount: String(found.amount),
    }

    if (waecPhone) payload.phone = waecPhone
    setPendingPurchase(payload)
    setShowPaymentSelector(open)
  }

  const startWaecRegPurchase = (open = true) => {
    const found = waecRegPlans.find((p) => p.code === waecRegPlan)
    if (!found) return toast.error('Choose a WAEC Registration plan')

    const payload: Record<string, unknown> = {
      serviceID: 'waec-registration',
      variation_code: waecRegPlan,
      quantity: waecRegQty,
      amount: String(found.amount),
    }

    if (waecRegPhone) payload.phone = waecRegPhone
    setPendingPurchase(payload)
    setShowPaymentSelector(open)
  }

  const startJambPurchase = (open = true) => {
    const found = jambPlans.find((p) => p.code === jambPlan)
    if (!found) return toast.error('Choose a JAMB item')
    if (!jambProfile) return toast.error('Enter JAMB profile/registration')
    if (!jambPhone) return toast.error('Phone is required for JAMB')

    const payload: Record<string, unknown> = {
      serviceID: 'jamb',
      variation_code: jambPlan,
      billersCode: jambProfile,
      phone: jambPhone,
      amount: String(found.amount),
    }

    setPendingPurchase(payload)
    setShowPaymentSelector(open)
  }

  const onPaymentSuccess = async (reference: string, provider: 'paystack' | 'monnify'): Promise<void> => {
    if (!pendingPurchase) {
      toast.error('No pending purchase')
      return
    }

    setProcessing(true)
    try {
      pendingPurchase.paystackReference = reference
      pendingPurchase.provider = provider
      await handleCompletePurchase()
    } catch (error) {
      console.error(error)
    } finally {
      setProcessing(false)
      setShowPaymentSelector(false)
    }
  }

  const verifyJamb = async () => {
    if (!jambProfile) return toast.error('Enter JAMB profile/registration')

    setVerifyingJamb(true)
    try {
      const res = await fetch('/api/bills/merchant-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceID: 'jamb', billersCode: jambProfile }),
      })
      const j = await res.json()
      if (!res.ok || !j?.ok) {
        const msg = j?.message || 'Verify failed'
        return toast.error(String(msg))
      }

      setJambVerifyResult((j.result?.content || j.result || null) as Record<string, unknown> | null)
      toast.success('Verified')
    } catch {
      toast.error('Verification error')
    } finally {
      setVerifyingJamb(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-white to-stone-100">
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-stone-200">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
            Back
          </Button>
          <h1 className="text-xl font-bold text-stone-900">Education - WAEC & JAMB</h1>
          <div className="w-[68px]" />
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setTab('waec-result')}
              className={`px-3 py-1 rounded ${tab === 'waec-result' ? 'bg-amber-500 text-stone-900' : 'bg-stone-100'}`}
            >
              WAEC Result
            </button>
            <button
              onClick={() => setTab('waec-reg')}
              className={`px-3 py-1 rounded ${tab === 'waec-reg' ? 'bg-amber-500 text-stone-900' : 'bg-stone-100'}`}
            >
              WAEC Register
            </button>
            <button
              onClick={() => setTab('jamb')}
              className={`px-3 py-1 rounded ${tab === 'jamb' ? 'bg-amber-500 text-stone-900' : 'bg-stone-100'}`}
            >
              JAMB
            </button>
          </div>

          <div className="border border-stone-200 shadow-lg bg-white rounded-xl">
            <div className="p-6 sm:p-8 space-y-4">
              {tab === 'waec-result' && (
                <div className="space-y-3">
                  <select value={waecPlan} onChange={(e) => setWaecPlan(e.target.value)} className="w-full p-2 border rounded">
                    {waecPlans.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name} - N{p.amount.toLocaleString()}
                      </option>
                    ))}
                  </select>
                  <input type="number" min={1} value={waecQty} onChange={(e) => setWaecQty(Number(e.target.value))} className="w-full p-2 border rounded" />
                  <input placeholder="Phone" value={waecPhone} onChange={(e) => setWaecPhone(e.target.value)} className="w-full p-2 border rounded" />
                  <div className="text-sm">You will be charged: N{waecDisplayPrice().toLocaleString()}</div>
                  {isLoggedIn && walletBalance !== null ? (
                    <div className="text-sm text-stone-600">Wallet balance: N{Number(walletBalance).toLocaleString()}</div>
                  ) : null}
                  <div className="flex gap-2">
                    <button disabled={processing || processingWallet} className="bg-amber-500 text-stone-900 px-4 py-2 rounded disabled:opacity-60" onClick={() => startWaecPurchase(true)}>
                      {processing ? 'Processing...' : 'Pay with Card'}
                    </button>
                    {isLoggedIn && (
                      <button
                        disabled={processing || processingWallet || (walletBalance !== null && waecDisplayPrice() > walletBalance)}
                        className="bg-amber-600 text-white px-4 py-2 rounded"
                        onClick={() => {
                          const found = waecPlans.find((p) => p.code === waecPlan)
                          if (!found) return toast.error('Choose a plan')
                          const payload: Record<string, unknown> = {
                            serviceID: 'waec',
                            variation_code: waecPlan,
                            quantity: waecQty,
                            amount: String(found.amount),
                          }
                          if (waecPhone) payload.phone = waecPhone
                          payNowWithWallet(payload)
                        }}
                      >
                        {processingWallet ? 'Processing...' : walletBalance !== null && waecDisplayPrice() > walletBalance ? 'Insufficient funds' : 'Pay from wallet'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {tab === 'waec-reg' && (
                <div className="space-y-3">
                  <select value={waecRegPlan} onChange={(e) => setWaecRegPlan(e.target.value)} className="w-full p-2 border rounded">
                    {waecRegPlans.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name} - N{p.amount.toLocaleString()}
                      </option>
                    ))}
                  </select>
                  <input type="number" min={1} value={waecRegQty} onChange={(e) => setWaecRegQty(Number(e.target.value))} className="w-full p-2 border rounded" />
                  <input placeholder="Phone" value={waecRegPhone} onChange={(e) => setWaecRegPhone(e.target.value)} className="w-full p-2 border rounded" />
                  <div className="text-sm">You will be charged: N{waecRegDisplayPrice().toLocaleString()}</div>
                  {isLoggedIn && walletBalance !== null ? (
                    <div className="text-sm text-stone-600">Wallet balance: N{Number(walletBalance).toLocaleString()}</div>
                  ) : null}
                  <div className="flex gap-2">
                    <button disabled={processing || processingWallet} className="bg-amber-500 text-stone-900 px-4 py-2 rounded disabled:opacity-60" onClick={() => startWaecRegPurchase(true)}>
                      {processing ? 'Processing...' : 'Pay with Card'}
                    </button>
                    {isLoggedIn && (
                      <button
                        disabled={processing || processingWallet || (walletBalance !== null && waecRegDisplayPrice() > walletBalance)}
                        className="bg-amber-600 text-white px-4 py-2 rounded"
                        onClick={() => {
                          const found = waecRegPlans.find((p) => p.code === waecRegPlan)
                          if (!found) return toast.error('Choose a WAEC Registration plan')
                          const payload: Record<string, unknown> = {
                            serviceID: 'waec-registration',
                            variation_code: waecRegPlan,
                            quantity: waecRegQty,
                            amount: String(found.amount),
                          }
                          if (waecRegPhone) payload.phone = waecRegPhone
                          payNowWithWallet(payload)
                        }}
                      >
                        {processingWallet ? 'Processing...' : walletBalance !== null && waecRegDisplayPrice() > walletBalance ? 'Insufficient funds' : 'Pay from wallet'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {tab === 'jamb' && (
                <div className="space-y-3">
                  <select value={jambPlan} onChange={(e) => setJambPlan(e.target.value)} className="w-full p-2 border rounded">
                    {jambPlans.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name} - N{p.amount.toLocaleString()}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="JAMB profile / registration"
                    value={jambProfile}
                    onChange={(e) => setJambProfile(e.target.value)}
                    className="w-full p-2 border rounded"
                  />
                  <input
                    placeholder="Phone (required)"
                    value={jambPhone}
                    onChange={(e) => setJambPhone(e.target.value)}
                    className="w-full p-2 border rounded"
                    required
                  />
                  <div className="flex items-center gap-2">
                    <button disabled={verifyingJamb} className="px-3 py-1 rounded bg-stone-100 disabled:opacity-60" onClick={verifyJamb}>
                      {verifyingJamb ? 'Verifying...' : 'Verify'}
                    </button>
                    <div className="text-sm">You will be charged: N{jambDisplayPrice().toLocaleString()}</div>
                  </div>
                  {isLoggedIn && walletBalance !== null ? (
                    <div className="text-sm text-stone-600">Wallet balance: N{Number(walletBalance).toLocaleString()}</div>
                  ) : null}

                  {jambVerifyResult && (
                    <div className="border p-3 rounded bg-green-50">
                      <h3 className="font-semibold">Verify Result</h3>
                      {jambVerifyName ? (
                        <p className="mt-2 text-sm text-green-900">
                          Name: <span className="font-medium">{jambVerifyName}</span>
                        </p>
                      ) : null}
                      {jambVerifyAddress ? (
                        <p className="mt-1 text-sm text-green-800">
                          Address: <span className="font-medium">{jambVerifyAddress}</span>
                        </p>
                      ) : null}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button disabled={processing || processingWallet} className="bg-amber-500 text-stone-900 px-4 py-2 rounded disabled:opacity-60" onClick={() => startJambPurchase(true)}>
                      {processing ? 'Processing...' : 'Pay with Card'}
                    </button>
                    {isLoggedIn && (
                      <button
                        disabled={processing || processingWallet || (walletBalance !== null && jambDisplayPrice() > walletBalance)}
                        className="bg-amber-600 text-white px-4 py-2 rounded"
                        onClick={() => {
                          const found = jambPlans.find((p) => p.code === jambPlan)
                          if (!found) return toast.error('Choose a JAMB item')
                          if (!jambProfile) return toast.error('Enter JAMB profile/registration')
                          if (!jambPhone) return toast.error('Phone is required for JAMB')
                          const payload: Record<string, unknown> = {
                            serviceID: 'jamb',
                            variation_code: jambPlan,
                            billersCode: jambProfile,
                            phone: jambPhone,
                            amount: String(found.amount),
                          }
                          payNowWithWallet(payload)
                        }}
                      >
                        {processingWallet ? 'Processing...' : walletBalance !== null && jambDisplayPrice() > walletBalance ? 'Insufficient funds' : 'Pay from wallet'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {showPaymentSelector && (
            <PaymentSelector
              open={showPaymentSelector}
              amount={Number(pendingPurchase?.amount || 0)}
              email={auth.currentUser?.email || ''}
              description="Bill Payment"
              onClose={() => setShowPaymentSelector(false)}
              onPaymentSuccess={onPaymentSuccess}
            />
          )}
        </div>
      </div>
    </div>
  )
}
