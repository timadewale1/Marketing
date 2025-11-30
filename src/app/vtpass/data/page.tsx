"use client"

import React, { useEffect, useState } from 'react'
import { PaystackModal } from '@/components/paystack-modal'
import { applyMarkup } from '@/services/vtpass/utils'
import toast from 'react-hot-toast'

export default function DataPage() {
  const [amount, setAmount] = useState('')
  const [service, setService] = useState('')
  const [plan, setPlan] = useState('')
  const [plans, setPlans] = useState<Array<{ code: string; name: string; amount: number }>>([])
  const [phone, setPhone] = useState('')
  const [payOpen, setPayOpen] = useState(false)

  const displayPrice = () => applyMarkup(amount)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/vtpass/services?identifier=data')
        const j = await res.json()
        if (res.ok && j?.ok && Array.isArray(j.result) && mounted) {
          const first = j.result[0]
          const sid = first?.serviceID || first?.code || first?.id || 'data'
          setService(sid)
        }
      } catch {
        // ignore
      }
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    let mounted = true
    if (!service) return
    ;(async () => {
      try {
        const res = await fetch(`/api/vtpass/variations?serviceID=${encodeURIComponent(service)}`)
        const j = await res.json()
        if (res.ok && j?.ok && Array.isArray(j.result) && mounted) {
          const mapped = (j.result as Array<Record<string, unknown>>).map(v => ({ code: String(v['variation_code'] || v['code'] || ''), name: String(v['name'] || ''), amount: Number(v['variation_amount'] || v['amount'] || 0) }))
          setPlans(mapped)
          if (mapped[0]) {
            setPlan(mapped[0].code)
            setAmount(String(mapped[0].amount))
          }
        }
      } catch {
        // ignore
      }
    })()
    return () => { mounted = false }
  }, [service])

  const handlePaySuccess = async (reference: string) => {
    try {
      const payload: Record<string, unknown> = { serviceID: service || 'data', variation_code: plan, phone, paystackReference: reference }
      const matched = plans.find(p => p.code === plan)
      if (matched) payload.amount = String(matched.amount)
      const res = await fetch('/api/vtpass/buy-service', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json()
      if (!res.ok || !j?.ok) return toast.error('Purchase failed')
      toast.success('Purchase successful')
      window.location.href = '/vtpass/confirmation'
    } catch {
      toast.error('Error')
    }
  }

  return (
    <div className="p-6 max-w-md">
      <h2 className="text-xl font-semibold mb-4">Buy Data</h2>
      <div className="space-y-3">
        <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full p-2 border rounded" />
        <select value={service} onChange={(e) => setService(e.target.value)} className="w-full p-2 border rounded">
          <option value={service}>{service || 'data'}</option>
        </select>
        <select value={plan} onChange={(e) => { setPlan(e.target.value); const sel = plans.find(p => p.code === e.target.value); if (sel) setAmount(String(sel.amount)) }} className="w-full p-2 border rounded">
          {plans.map(p => <option key={p.code} value={p.code}>{p.name} — ₦{p.amount.toLocaleString()}</option>)}
        </select>
        <input placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full p-2 border rounded" />
          <div className="text-sm">You will be charged: ₦{displayPrice().toLocaleString()}</div>
        <div className="flex gap-2">
          <button className="bg-amber-500 text-stone-900 px-4 py-2 rounded" onClick={() => setPayOpen(true)}>Pay</button>
        </div>
      </div>
      {payOpen && <PaystackModal amount={displayPrice()} email={'no-reply@example.com'} onSuccess={handlePaySuccess} onClose={() => setPayOpen(false)} open={payOpen} />}
    </div>
  )
}
