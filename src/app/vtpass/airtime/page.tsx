"use client"

import React, { useEffect, useState } from 'react'
import { applyMarkup } from '@/services/vtpass/utils'
import { PaystackModal } from '@/components/paystack-modal'
import toast from 'react-hot-toast'

export default function AirtimePage() {
  type Service = { serviceID?: string; code?: string; id?: string; name?: string; title?: string }
  const [networks, setNetworks] = useState<Array<{ id: string; name: string }>>([
    { id: 'mtn', name: 'MTN' }, { id: 'glo', name: 'Glo' }, { id: 'airtel', name: 'Airtel' }, { id: '9mobile', name: '9mobile' }
  ])
  const [network, setNetwork] = useState('mtn')
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [payOpen, setPayOpen] = useState(false)
  const [email, setEmail] = useState('')

  const displayPrice = () => applyMarkup(amount)

  const handlePaySuccess = async (reference: string) => {
    // after paystack success, call our buy-service API
    try {
      const payload = {
        serviceID: network,
        amount: String(amount),
        phone,
        paystackReference: reference,
      }
      const res = await fetch('/api/vtpass/buy-service', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json()
      if (!res.ok || !j?.ok) {
        toast.error('VTpass purchase failed: ' + (j?.message || JSON.stringify(j)))
        return
      }
      toast.success('Transaction successful')
      // redirect to confirmation page
      window.open('/bills/confirmation', '_self')
    } catch (e) {
      console.error(e)
      toast.error('Purchase failed')
    }
  }

  useEffect(() => {
    // fetch networks from server
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/bills/services?identifier=airtime')
        const j = await res.json()
        if (res.ok && j?.ok && Array.isArray(j.result) && mounted) {
          const mapped = (j.result as Service[]).map(s => ({ id: s.serviceID || s.code || s.id || 'unknown', name: s.name || s.title || 'Unknown' }))
          setNetworks(mapped)
          if (j.result[0]) {
            const v = (j.result[0] as Service).serviceID || (j.result[0] as Service).code || (j.result[0] as Service).id
            if (v) setNetwork(v)
          }
        }
      } catch {
        // ignore, keep defaults
      }
    })()
    return () => { mounted = false }
  }, [])

  return (
    <div className="p-6 max-w-md">
      <h2 className="text-xl font-semibold mb-4">Airtime Purchase</h2>
      <div className="space-y-3">
        <label className="block">
          Network
          <select value={network} onChange={(e) => setNetwork(e.target.value)} className="w-full p-2 border rounded mt-1">
            {networks.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </label>
        <label className="block">
          Phone
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full p-2 border rounded mt-1" />
        </label>
        <label className="block">
          Amount (₦)
          <input value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full p-2 border rounded mt-1" />
        </label>
        <div>
          <div className="text-sm">You will be charged: ₦{displayPrice().toLocaleString()}</div>
        </div>
        <div className="flex gap-2">
          <input placeholder="Email (for receipt)" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1 p-2 border rounded" />
          <button className="bg-amber-500 text-stone-900 px-4 py-2 rounded" onClick={() => setPayOpen(true)}>Pay</button>
        </div>
      </div>

      {payOpen && (
        <PaystackModal amount={displayPrice()} email={email || 'no-reply@example.com'} onSuccess={handlePaySuccess} onClose={() => setPayOpen(false)} open={payOpen} />
      )}
    </div>
  )
}
