"use client"

import React, { useEffect, useState } from 'react'
import { PaystackModal } from '@/components/paystack-modal'
import { applyMarkup, formatVerifyResult } from '@/services/vtpass/utils'
import { User, Hash, Calendar, DollarSign, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'

export default function EducationPage() {
  const [tab, setTab] = useState<'waec' | 'jamb'>('waec')

  // WAEC state
  const [waecPlans, setWaecPlans] = useState<Array<{ code: string; name: string; amount: number }>>([])
  const [waecPlan, setWaecPlan] = useState('')
  const [waecQty, setWaecQty] = useState(1)

  // JAMB state
  const [jambPlans, setJambPlans] = useState<Array<{ code: string; name: string; amount: number }>>([])
  const [jambPlan, setJambPlan] = useState('')
  const [jambProfile, setJambProfile] = useState('')
  const [jambPhone, setJambPhone] = useState('')
  const [jambVerifyResult, setJambVerifyResult] = useState<Record<string, unknown> | null>(null)

  const [payOpen, setPayOpen] = useState(false)
  const [pendingPurchase, setPendingPurchase] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [wRes, jRes] = await Promise.all([
          fetch('/api/bills/variations?serviceID=waec'),
          fetch('/api/bills/variations?serviceID=jamb'),
        ])
        const wj = await wRes.json()
        const jj = await jRes.json()
        if (mounted && wRes.ok && wj?.ok && Array.isArray(wj.result)) {
          const mapped = (wj.result as Array<Record<string, unknown>>).map(v => ({ code: String(v['variation_code'] || v['code'] || ''), name: String(v['name'] || ''), amount: Number(v['variation_amount'] || v['amount'] || 0) }))
          setWaecPlans(mapped)
          if (mapped[0]?.code) setWaecPlan(mapped[0].code)
        }
        if (mounted && jRes.ok && jj?.ok && Array.isArray(jj.result)) {
          const mapped = (jj.result as Array<Record<string, unknown>>).map(v => ({ code: String(v['variation_code'] || v['code'] || ''), name: String(v['name'] || ''), amount: Number(v['variation_amount'] || v['amount'] || 0) }))
          setJambPlans(mapped)
          if (mapped[0]?.code) setJambPlan(mapped[0].code)
        }
      } catch {
        // ignore
      }
    })()
    return () => { mounted = false }
  }, [])

  const waecDisplayPrice = () => {
    const found = waecPlans.find(p => p.code === waecPlan)
    return applyMarkup(found ? found.amount * (waecQty || 1) : 0)
  }

  const jambDisplayPrice = () => {
    const found = jambPlans.find(p => p.code === jambPlan)
    return applyMarkup(found ? found.amount : 0)
  }

  const handlePaySuccess = async (reference: string) => {
    try {
      if (!pendingPurchase) return toast.error('No pending purchase')
      const res = await fetch('/api/bills/buy-service', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...pendingPurchase, paystackReference: reference }) })
      const j = await res.json()
      if (!res.ok || !j?.ok) return toast.error('Purchase failed')
      toast.success('Purchase successful')
      window.location.href = '/bills/confirmation'
    } catch {
      toast.error('Error completing purchase')
    }
  }

  const startWaecPurchase = (open = true) => {
    const found = waecPlans.find(p => p.code === waecPlan)
    if (!found) return toast.error('Choose a plan')
    const payload: Record<string, unknown> = { serviceID: 'waec', variation_code: waecPlan, quantity: waecQty }
    payload.amount = String(found.amount * (waecQty || 1))
    setPendingPurchase(payload)
    setPayOpen(open)
  }

  const startJambPurchase = (open = true) => {
    const found = jambPlans.find(p => p.code === jambPlan)
    if (!found) return toast.error('Choose a JAMB item')
    if (!jambProfile) return toast.error('Enter JAMB profile/registration')
    const payload: Record<string, unknown> = { serviceID: 'jamb', variation_code: jambPlan, billersCode: jambProfile, phone: jambPhone }
    payload.amount = String(found.amount)
    setPendingPurchase(payload)
    setPayOpen(open)
  }

  const verifyJamb = async () => {
    if (!jambProfile) return toast.error('Enter JAMB profile/registration')
    try {
      const res = await fetch('/api/bills/merchant-verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serviceID: 'jamb', billersCode: jambProfile }) })
      const j = await res.json()
      if (!res.ok || !j?.ok) return toast.error('Verify failed')
      setJambVerifyResult(j.result)
      toast.success('Verified')
    } catch {
      toast.error('Verification error')
    }
  }

  return (
    <div className="p-6 max-w-xl">
      <div className="mb-4">
        <Button onClick={() => window.history.back()} variant="ghost">Back</Button>
      </div>
      <h2 className="text-xl font-semibold mb-4">Education — WAEC & JAMB</h2>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('waec')} className={`px-3 py-1 rounded ${tab === 'waec' ? 'bg-amber-500 text-stone-900' : 'bg-stone-100'}`}>WAEC</button>
        <button onClick={() => setTab('jamb')} className={`px-3 py-1 rounded ${tab === 'jamb' ? 'bg-amber-500 text-stone-900' : 'bg-stone-100'}`}>JAMB</button>
      </div>

      {tab === 'waec' && (
        <div className="space-y-3">
          <select value={waecPlan} onChange={(e) => setWaecPlan(e.target.value)} className="w-full p-2 border rounded">
            {waecPlans.map(p => <option key={p.code} value={p.code}>{p.name} — ₦{p.amount.toLocaleString()}</option>)}
          </select>
          <input type="number" min={1} value={waecQty} onChange={(e) => setWaecQty(Number(e.target.value))} className="w-full p-2 border rounded" />
          <div className="text-sm">You will be charged: ₦{waecDisplayPrice().toLocaleString()}</div>
          <div className="flex gap-2">
            <button className="bg-amber-500 text-stone-900 px-4 py-2 rounded" onClick={() => startWaecPurchase(true)}>Pay</button>
          </div>
        </div>
      )}

      {tab === 'jamb' && (
        <div className="space-y-3">
          <select value={jambPlan} onChange={(e) => setJambPlan(e.target.value)} className="w-full p-2 border rounded">
            {jambPlans.map(p => <option key={p.code} value={p.code}>{p.name} — ₦{p.amount.toLocaleString()}</option>)}
          </select>
          <input placeholder="JAMB profile / registration" value={jambProfile} onChange={(e) => setJambProfile(e.target.value)} className="w-full p-2 border rounded" />
          <input placeholder="Phone (optional)" value={jambPhone} onChange={(e) => setJambPhone(e.target.value)} className="w-full p-2 border rounded" />
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 rounded bg-stone-100" onClick={verifyJamb}>Verify</button>
            <div className="text-sm">You will be charged: ₦{jambDisplayPrice().toLocaleString()}</div>
          </div>

          {jambVerifyResult && (
            <div className="border p-3 rounded bg-white">
              <h3 className="font-semibold">Verify Result</h3>
              <div className="mt-2 space-y-1 text-sm">
                  {formatVerifyResult(jambVerifyResult, ['Customer_Name', 'fullName', 'Full_Name', 'profile', 'registrationNumber', 'Amount', 'Minimum_Amount']).map((item: { label: string; value: string }) => {
                    const key = item.label
                    const val = item.value || ''
                    const lower = key.toLowerCase()
                    const Icon = lower.includes('name') ? User : lower.includes('profile') || lower.includes('registration') ? Hash : lower.includes('date') ? Calendar : lower.includes('amount') ? DollarSign : Info
                    return (
                      <React.Fragment key={key}>
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-amber-500" />
                          <span className="font-medium">{key}:</span>
                        </div>
                        <div className="text-right">{key.toLowerCase().includes('amount') ? `₦${Number(val || 0).toLocaleString()}` : val || 'N/A'}</div>
                      </React.Fragment>
                    )
                  })}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button className="bg-amber-500 text-stone-900 px-4 py-2 rounded" onClick={() => startJambPurchase(true)}>Pay</button>
          </div>
        </div>
      )}

      {payOpen && pendingPurchase && (
        <PaystackModal amount={Number(pendingPurchase.amount || 0)} email={'no-reply@example.com'} onSuccess={handlePaySuccess} onClose={() => setPayOpen(false)} open={payOpen} />
      )}
    </div>
  )
}
