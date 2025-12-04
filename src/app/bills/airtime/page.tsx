"use client"

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { applyMarkup } from '@/services/vtpass/utils'
import { PaystackModal } from '@/components/paystack-modal'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, Smartphone, Zap } from 'lucide-react'

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
    try {
      const payload = {
        serviceID: network,
        amount: String(amount),
        phone,
        paystackReference: reference,
      }
      const res = await fetch('/api/bills/buy-service', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json()
      if (!res.ok || !j?.ok) {
        toast.error('Purchase failed: ' + (j?.message || JSON.stringify(j)))
        return
      }
      toast.success('Transaction successful')
      window.open('/bills/confirmation', '_self')
    } catch (e) {
      console.error(e)
      toast.error('Purchase failed')
    }
  }

  useEffect(() => {
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
      } catch (e) {
        console.error(e)
      }
    })()
    return () => { mounted = false }
  }, [])

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
          <h1 className="text-xl font-bold text-stone-900">Buy Airtime</h1>
          <div className="w-[68px]" />
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card className="border border-stone-200 shadow-lg bg-white rounded-xl">
            <CardContent className="p-6 sm:p-8 space-y-6">
              {/* Network Selection */}
              <div>
                <label className="block text-sm font-semibold text-stone-900 mb-3">Select Network</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {networks.map(n => (
                    <button
                      key={n.id}
                      onClick={() => setNetwork(n.id)}
                      className={`p-3 rounded-lg border-2 transition-all font-medium ${
                        network === n.id
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-stone-200 bg-white text-stone-900 hover:border-amber-300'
                      }`}
                    >
                      {n.name}
                    </button>
                  ))}
                </div>
              </div>

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

              {/* Amount Input */}
              <div>
                <label className="block text-sm font-semibold text-stone-900 mb-2">Amount (₦)</label>
                <div className="relative">
                  <Zap className="absolute left-3 top-3 w-5 h-5 text-stone-400" />
                  <input
                    type="number"
                    placeholder="500"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Email Input */}
              <div>
                <label className="block text-sm font-semibold text-stone-900 mb-2">Email (for receipt)</label>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>

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
                onClick={() => {
                  if (!phone) {
                    toast.error('Please enter phone number')
                    return
                  }
                  if (!amount) {
                    toast.error('Please enter amount')
                    return
                  }
                  setPayOpen(true)
                }}
                className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold rounded-lg transition-all"
              >
                Proceed to Payment
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {payOpen && (
        <PaystackModal amount={displayPrice()} email={email || 'no-reply@example.com'} onSuccess={handlePaySuccess} onClose={() => setPayOpen(false)} open={payOpen} />
      )}
    </div>
  )
}
