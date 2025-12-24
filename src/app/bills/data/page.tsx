"use client"

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
// bypass Paystack: call VTpass directly
import DataPlanSelector from '@/components/bills/DataPlanSelector'
import { applyMarkup } from '@/services/vtpass/utils'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, Loader2, Smartphone } from 'lucide-react'

type DataPlan = { code: string; name: string; amount: number }

export default function DataPage() {
  const [amount, setAmount] = useState('')
  const [service, setService] = useState('')
  const [services, setServices] = useState<Array<{ id: string; name: string }>>([])
  const [plan, setPlan] = useState('')
  const [plans, setPlans] = useState<DataPlan[]>([])
  const [phone, setPhone] = useState('')
  
  const [loading, setLoading] = useState(true)

  const displayPrice = () => applyMarkup(amount)

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
    try {
      const payload: Record<string, unknown> = { serviceID: service || 'data', variation_code: plan, phone }
      const matched = plans.find(p => p.code === plan)
      if (matched) payload.amount = String(matched.amount)
      const res = await fetch('/api/bills/buy-service', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json()
      if (!res.ok || !j?.ok) return toast.error('Purchase failed')
      // Store transaction data for confirmation page
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

              {/* Data Plans Selector */}
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

              {/* Price Summary */}
              {amount && (
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
              <Button
                onClick={async () => {
                  if (!phone) {
                    toast.error('Please enter phone number')
                    return
                  }
                  await handlePurchase()
                }}
                className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold rounded-lg transition-all"
              >
                Proceed to Payment
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Paystack removed: payments go through server handler at /api/bills/buy-service */}
    </div>
  )
}
