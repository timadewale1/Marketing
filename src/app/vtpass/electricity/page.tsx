"use client"

import React, { useEffect, useState } from 'react'
import { PaystackModal } from '@/components/paystack-modal'
import { applyMarkup, formatVerifyResult } from '@/services/vtpass/utils'
import { User, Hash, CreditCard, Calendar, MapPin, Info, DollarSign } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ElectricityPage() {
  const [meter, setMeter] = useState('')
  const [disco, setDisco] = useState('ikeja-electric')
  const [meterType, setMeterType] = useState('prepaid' as 'prepaid'|'postpaid')
  const [amount, setAmount] = useState('')
  const [discos, setDiscos] = useState<Array<{ id: string; name: string }>>([])
  const [verifyResult, setVerifyResult] = useState<Record<string, unknown> | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [payOpen, setPayOpen] = useState(false)

  const displayPrice = () => applyMarkup(amount)

  const handlePaySuccess = async (reference: string) => {
    try {
      const payload = { request_id: `vt-${Date.now()}`, serviceID: disco, amount: String(amount), billersCode: meter, paystackReference: reference }
      const res = await fetch('/api/vtpass/buy-service', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json()
      if (!res.ok || !j?.ok) return toast.error('Purchase failed')
      toast.success('Electricity paid')
      window.location.href = '/bills/confirmation'
    } catch (e) { console.error(e); toast.error('Error') }
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
      } catch {
        // ignore
      }
    })()
    return () => { mounted = false }
  }, [])

  const handleVerify = async () => {
    setVerifyResult(null)
    setVerifying(true)
    try {
      const payload: Record<string, unknown> = { billersCode: meter, serviceID: disco }
      if (meterType === 'postpaid') payload.type = 'postpaid'
      const res = await fetch('/api/bills/merchant-verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json()
      if (!res.ok || !j?.ok) {
        toast.error('Verification failed')
        setVerifying(false)
        return
      }
      setVerifyResult(j.result || j)
      toast.success('Verified')
    } catch (err) {
      console.error('verify error', err)
      toast.error('Verification error')
    }
    setVerifying(false)
  }

  return (
    <div className="p-6 max-w-md">
      <h2 className="text-xl font-semibold mb-4">Electricity</h2>
      <div className="space-y-3">
        <input placeholder="Meter number" value={meter} onChange={(e) => setMeter(e.target.value)} className="w-full p-2 border rounded" />
        <div className="flex gap-2">
          <select value={meterType} onChange={(e) => setMeterType(e.target.value as 'prepaid'|'postpaid') } className="p-2 border rounded w-1/2">
            <option value="prepaid">Prepaid</option>
            <option value="postpaid">Postpaid</option>
          </select>
          <select value={disco} onChange={(e) => setDisco(e.target.value)} className="p-2 border rounded w-1/2">
          {discos.length ? discos.map(d => <option key={d.id} value={d.id}>{d.name}</option>) : (
            <>
              <option value="ikeja-electric">Ikeja Electric</option>
              <option value="eko-electric">Eko Electric</option>
            </>
          )}
        </select>
        <div className="flex gap-2">
          <button type="button" onClick={handleVerify} className="px-3 py-2 border rounded" disabled={verifying}>{verifying ? 'Verifying...' : 'Verify'}</button>
        </div>
        {verifyResult && (
          <div className="p-3 border rounded bg-white">
            <h3 className="font-semibold">Customer details</h3>
            <div className="text-sm mt-2">
              <div className="space-y-2">
                {formatVerifyResult(verifyResult, ['Customer_Name', 'customerName', 'Account_Number', 'Meter_Number', 'Customer_Number', 'Meter_Type', 'Customer_Type', 'Minimum_Amount', 'Min_Purchase_Amount', 'Customer_District', 'Customer_District_Reference']).map((item: { label: string; value: string }) => {
                  const key = item.label
                  const val = item.value || 'N/A'
                  const lower = key.toLowerCase()
                  let Icon = Info
                  if (lower.includes('name')) Icon = User
                  else if (lower.includes('account') || lower.includes('meter')) Icon = Hash
                  else if (lower.includes('type')) Icon = CreditCard
                  else if (lower.includes('date')) Icon = Calendar
                  else if (lower.includes('district') || lower.includes('location')) Icon = MapPin
                  else if (lower.includes('amount')) Icon = DollarSign
                  return (
                    <div key={key} className="grid grid-cols-2 gap-x-6 gap-y-2 items-start">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-amber-500" />
                        <span className="font-medium">{key}:</span>
                      </div>
                      <div className="text-right">{key.toLowerCase().includes('amount') ? `₦${Number(val || 0).toLocaleString()}` : val}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
        <input placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full p-2 border rounded" />
        <div className="text-sm">You will be charged: ₦{displayPrice().toLocaleString()}</div>
        <div className="flex gap-2">
          <button className="bg-amber-500 text-stone-900 px-4 py-2 rounded" onClick={() => setPayOpen(true)}>Pay</button>
        </div>
      </div>
      </div>
      {payOpen && <PaystackModal amount={displayPrice()} email={'no-reply@example.com'} onSuccess={handlePaySuccess} onClose={() => setPayOpen(false)} open={payOpen} />}
    </div>
  )
}
