"use client"

import React, { useEffect, useState } from "react"
import { db } from "@/lib/firebase"
import { doc, getDoc, updateDoc } from "firebase/firestore"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { toast } from "react-hot-toast"
import { useParams, useRouter } from "next/navigation"

interface DirectAdRequest {
  id: string
  businessName?: string
  contactName?: string
  phone?: string
  email?: string
  advertType?: string
  duration?: string
  budget?: number
  message?: string
  status?: string
}

export default function DirectAdRequestDetail() {
  const { id } = useParams()
  const router = useRouter()
  const [req, setReq] = useState<DirectAdRequest | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const docId = typeof id === 'string' ? id : id?.[0]
    if (!docId) return
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'directAdvertRequests', docId))
        if (!snap.exists()) return toast.error('Request not found')
        setReq({ id: snap.id, ...(snap.data() || {}) })
        setLoading(false)
      } catch (err) {
        console.error(err)
        toast.error('Failed to load request')
        setLoading(false)
      }
    })()
  }, [id])

  const setStatus = async (status: string) => {
    if (!req) return
    try {
      await updateDoc(doc(db, 'directAdvertRequests', req.id), { status })
      setReq({ ...req, status })
      toast.success('Updated')
    } catch (err) {
      console.error(err)
      toast.error('Failed to update')
    }
  }

  if (loading) return <p>Loading…</p>
  if (!req) return <p>Request not found</p>

  return (
    <div className="min-h-screen bg-stone-50 py-8">
      <div className="container mx-auto px-4">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">Back</Button>
        <Card className="p-6">
          <h1 className="text-xl font-semibold mb-2">{req.businessName || '(No name)'}</h1>
          <p className="text-sm text-stone-600">Contact: {req.contactName} • {req.phone} • {req.email}</p>
          <p className="text-sm mt-4">Type: {req.advertType || '—'} • Duration: {req.duration || '—'} • Budget: {req.budget ? `₦${req.budget}` : '—'}</p>
          {req.message && <p className="text-sm mt-4">{req.message}</p>}
          <p className="text-xs text-stone-500 mt-4">Status: <strong>{req.status || 'pending'}</strong></p>

          <div className="flex gap-3 mt-6">
            <Button onClick={() => setStatus('approved')} className="bg-amber-500 text-stone-900">Approve</Button>
            <Button variant="outline" onClick={() => setStatus('rejected')}>Reject</Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
