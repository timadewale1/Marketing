"use client"

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { PaystackModal } from '@/components/paystack-modal'
import { applyMarkup, formatVerifyResult } from '@/services/vtpass/utils'
import { Hash, Zap, ArrowLeft, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function TVPage() {
  const [provider, setProvider] = useState('gotv')
  const [smartcard, setSmartcard] = useState('')
  const [amount, setAmount] = useState('')
  const [providers, setProviders] = useState<Array<{ id: string; name: string }>>([])
  const [bouquets, setBouquets] = useState<Array<{ code: string; name: string; amount: number }>>([])
  const [payOpen, setPayOpen] = useState(false)
  const [verifyResult, setVerifyResult] = useState<Record<string, unknown> | null>(null)

  const displayPrice = () => applyMarkup(amount)

  const handlePaySuccess = async (reference: string) => {
    try {
      const payload: Record<string, unknown> = { serviceID: provider, billersCode: smartcard, paystackReference: reference }
      const matched = bouquets.find(b => b.code === amount || String(b.amount) === amount)
      if (matched) {
        payload.variation_code = matched.code
        payload.amount = String(matched.amount)
      } else {
        payload.amount = String(amount)
      }
      const res = await fetch('/api/bills/buy-service', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json()
      if (!res.ok || !j?.ok) return toast.error('Purchase failed')
      toast.success('Subscription successful')
      window.location.href = '/bills/confirmation'
    } catch (e) { console.error(e); toast.error('Error') }
  }

  const handleVerify = async () => {
    if (!smartcard) return toast.error('Enter smartcard number')
    try {
      const res = await fetch('/api/bills/merchant-verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ billersCode: smartcard, serviceID: provider }) })
      const j = await res.json()
      if (!res.ok || !j?.ok) {
        const msg = j?.message || 'Verification failed'
        return toast.error(String(msg))
      }
      setVerifyResult(j.result || j)
      toast.success('Verified')
    } catch (err) {
      console.error('verify error', err)
      toast.error('Verification error')
    }
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/bills/services?identifier=tv-subscription')
        const j = await res.json()
        if (res.ok && j?.ok && Array.isArray(j.result) && mounted) {
          const mapped = (j.result as Array<Record<string, unknown>>).map(s => ({ id: String(s['serviceID'] || s['code'] || s['id'] || ''), name: String(s['name'] || s['title'] || '') }))
          setProviders(mapped)
          if (mapped[0] && mapped[0].id) setProvider(mapped[0].id)
        }
      } catch (e) {
        console.error(e)
      }
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    let mounted = true
    if (!provider) return
    ;(async () => {
      try {
        const res = await fetch(`/api/bills/variations?serviceID=${encodeURIComponent(provider)}`)
        const j = await res.json()
        if (res.ok && j?.ok && Array.isArray(j.result) && mounted) {
          const mapped = (j.result as Array<Record<string, unknown>>).map(v => ({ code: String(v['variation_code'] || v['code'] || ''), name: String(v['name'] || ''), amount: Number(v['variation_amount'] || v['amount'] || 0) }))
          setBouquets(mapped)
          if (mapped[0]) { setAmount(String(mapped[0].amount)) }
        }
      } catch (e) {
        console.error(e)
      }
    })()
    return () => { mounted = false }
  }, [provider])

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
              {/* Provider Selection */}
              <div>
                <label className="block text-sm font-semibold text-stone-900 mb-3">Select TV Provider</label>
                <div className="grid grid-cols-3 gap-2">
                  {providers.length ? providers.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setProvider(p.id)}
                      className={`p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                        provider === p.id
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-stone-200 bg-white text-stone-900 hover:border-amber-300'
                      }`}
                    >
                      {p.name}
                    </button>
                  )) : (
                    <>
                      <button onClick={() => setProvider('gotv')} className={`p-3 rounded-lg border-2 transition-all text-sm font-medium ${provider === 'gotv' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-stone-200 bg-white text-stone-900'}`}>GOtv</button>
                      <button onClick={() => setProvider('dstv')} className={`p-3 rounded-lg border-2 transition-all text-sm font-medium ${provider === 'dstv' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-stone-200 bg-white text-stone-900'}`}>DStv</button>
                      <button onClick={() => setProvider('startimes')} className={`p-3 rounded-lg border-2 transition-all text-sm font-medium ${provider === 'startimes' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-stone-200 bg-white text-stone-900'}`}>Startimes</button>
                    </>
                  )}
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
                disabled={!smartcard}
                className="w-full bg-stone-900 hover:bg-stone-800 text-white rounded-lg h-10"
              >
                Verify Smartcard
              </Button>

              {/* Verification Result */}
              {verifyResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <p className="text-sm font-semibold text-green-900">Account Verified</p>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(formatVerifyResult(verifyResult)).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-sm">
                        <span className="text-green-800">{k}:</span>
                        <span className="text-green-900 font-medium">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bouquets/Amount Selection */}
              {verifyResult && bouquets.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-stone-900 mb-3">Select Bouquet</label>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {bouquets.map(b => (
                      <button
                        key={b.code}
                        onClick={() => setAmount(String(b.amount))}
                        className={`w-full p-3 border-2 rounded-lg text-left transition-all ${
                          String(amount) === String(b.amount)
                            ? 'border-amber-500 bg-amber-50'
                            : 'border-stone-200 bg-white hover:border-amber-300'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <p className="font-medium text-stone-900">{b.name}</p>
                          <p className="font-semibold text-amber-600">₦{b.amount.toLocaleString()}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Price Summary */}
              {amount && verifyResult && (
                <div className="bg-gradient-to-r from-amber-50 to-stone-50 p-4 rounded-lg border border-amber-200">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-600">Service charge:</span>
                      <span className="text-stone-900">₦50</span>
                    </div>
                    <div className="border-t border-amber-200 pt-2 flex justify-between">
                      <span className="font-semibold text-stone-900">Total charge:</span>
                      <span className="text-lg font-bold text-amber-600">₦{displayPrice().toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Button */}
              {verifyResult && amount && (
                <Button
                  onClick={() => setPayOpen(true)}
                  className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold rounded-lg transition-all"
                >
                  Proceed to Payment
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {payOpen && <PaystackModal amount={displayPrice()} email={'no-reply@example.com'} onSuccess={handlePaySuccess} onClose={() => setPayOpen(false)} open={payOpen} />}
    </div>
  )
}
