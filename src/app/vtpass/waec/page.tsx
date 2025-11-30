"use client"

import React, { useEffect, useState } from 'react'
import { PaystackModal } from '@/components/paystack-modal'
import { applyMarkup } from '@/services/vtpass/utils'
import toast from 'react-hot-toast'

export default function WaecPage() {
  const [plans, setPlans] = useState<Array<{ code: string; name: string; amount: number }>>([])
  const [plan, setPlan] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [phone, setPhone] = useState('')
  const [payOpen, setPayOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/vtpass/variations?serviceID=waec')
        const j = await res.json()
        if (res.ok && j?.ok && Array.isArray(j.result) && mounted) {
          const mapped = (j.result as Array<Record<string, unknown>>).map(v => ({ code: String(v['variation_code'] || v['code'] || ''), name: String(v['name'] || ''), amount: Number(v['variation_amount'] || v['amount'] || 0) }))
          setPlans(mapped)
          if (mapped[0] && mapped[0].code) { setPlan(mapped[0].code) }
        }
      } catch {
        // ignore
      }
    })()
    return () => { mounted = false }
  }, [])

  const displayPrice = () => {
    const found = plans.find(p => p.code === plan)
    return applyMarkup(found ? found.amount * (quantity || 1) : 0)
  }

  const handlePaySuccess = async (reference: string) => {
    try {
      const payload: Record<string, unknown> = { serviceID: 'waec', variation_code: plan, quantity, phone, paystackReference: reference }
      const found = plans.find(p => p.code === plan)
      if (found) payload.amount = String(found.amount * (quantity || 1))
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
      <h2 className="text-xl font-semibold mb-4">Education — WAEC</h2>
      <div className="space-y-3">
        <select value={plan} onChange={(e) => setPlan(e.target.value)} className="w-full p-2 border rounded">
          {plans.map(p => <option key={p.code} value={p.code}>{p.name} — ₦{p.amount.toLocaleString()}</option>)}
        </select>
        <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-full p-2 border rounded" />
        <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full p-2 border rounded" />
        <div className="text-sm">You will be charged: ₦{displayPrice().toLocaleString()}</div>
        <div className="flex gap-2">
          <button className="bg-amber-500 text-stone-900 px-4 py-2 rounded" onClick={() => setPayOpen(true)}>Pay</button>
        </div>
      </div>
      {payOpen && <PaystackModal amount={displayPrice()} email={'no-reply@example.com'} onSuccess={handlePaySuccess} onClose={() => setPayOpen(false)} open={payOpen} />}
    </div>
  )
}
