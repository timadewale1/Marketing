"use client"

import React, { useEffect, useState } from 'react'
import { PaystackModal } from '@/components/paystack-modal'
import { applyMarkup, formatVerifyResult } from '@/services/vtpass/utils'
import { User, Hash, Calendar, DollarSign, Info, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'

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
      if (!res.ok || !j?.ok) return toast.error('Verification failed')
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
      } catch {
        // ignore
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
      } catch {
        // ignore
      }
    })()
    return () => { mounted = false }
  }, [provider])

  return (
    <div className="p-6 max-w-md">
      <h2 className="text-xl font-semibold mb-4">TV Subscription</h2>
      <div className="space-y-3">
        <select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full p-2 border rounded">
          <option value="gotv">GOtv</option>
          <option value="dstv">DStv</option>
          <option value="startimes">Startimes</option>
        </select>
        <div className="flex gap-2">
          <input placeholder="Smartcard number" value={smartcard} onChange={(e) => setSmartcard(e.target.value)} className="flex-1 p-2 border rounded" />
          <button type="button" onClick={handleVerify} className="px-3 py-2 border rounded">Verify</button>
        </div>
        <input placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full p-2 border rounded" />
        <div className="text-sm">You will be charged: ₦{displayPrice().toLocaleString()}</div>
        <div className="flex gap-2">
          <button className="bg-amber-500 text-stone-900 px-4 py-2 rounded" onClick={() => setPayOpen(true)}>Pay</button>
        </div>
      </div>
      {verifyResult && (
        <div className="p-3 border rounded bg-white mt-3">
          <h3 className="font-semibold">Verify Result</h3>
          <div className="mt-2 text-sm">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 items-start">
              {formatVerifyResult(verifyResult, ['Customer_Name', 'customerName', 'Amount', 'Renewal_Amount', 'Due_Date']).map((item: { label: string; value: string }) => {
                const key = item.label
                const val = item.value || ''
                const lower = key.toLowerCase()
                const Icon = lower.includes('name') ? User : lower.includes('account') || lower.includes('card') ? Hash : lower.includes('date') ? Calendar : lower.includes('amount') ? DollarSign : lower.includes('district') ? MapPin : Info
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
        </div>
      )}

      {payOpen && <PaystackModal amount={displayPrice()} email={'no-reply@example.com'} onSuccess={handlePaySuccess} onClose={() => setPayOpen(false)} open={payOpen} />}
    </div>
  )
}
