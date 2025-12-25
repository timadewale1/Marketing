"use client"

import React, { useEffect, useState } from "react"
import { db } from "@/lib/firebase"
import { collection, query, orderBy, onSnapshot, updateDoc, doc, Timestamp } from "firebase/firestore"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { toast } from "react-hot-toast"
import Link from "next/link"

interface DirectAdvertRequest {
  id: string
  businessName?: string
  contactName: string
  phone: string
  email: string
  advertType?: string
  duration?: string
  budget?: number
  message?: string
  status?: string
  createdAt?: Timestamp
}

export default function AdminDirectAdRequestsPage() {
  const [requests, setRequests] = useState<DirectAdvertRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, "directAdvertRequests"), orderBy("createdAt", "desc"))
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) } as DirectAdvertRequest))
      setRequests(data)
      setLoading(false)
    }, (err) => {
      console.error("Failed to listen directAdvertRequests:", err)
      toast.error("Failed to load direct advert requests")
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const setStatus = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, "directAdvertRequests", id), { status })
      toast.success("Updated status")
    } catch (err) {
      console.error(err)
      toast.error("Failed to update status")
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-2xl font-semibold mb-6">Direct Advert Requests</h1>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <div className="space-y-4">
            {requests.length === 0 && <p className="text-sm text-stone-600">No requests yet.</p>}
            {requests.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="font-semibold">{r.businessName || "(No business name)"}</h3>
                    <p className="text-sm text-stone-600">Contact: {r.contactName} • {r.phone} • {r.email}</p>
                    <p className="text-sm mt-2">Type: {r.advertType || "—"} • Duration: {r.duration || "—"} • Budget: {r.budget ? `₦${r.budget.toLocaleString()}` : "—"}</p>
                    {r.message && <p className="text-sm mt-2 text-stone-700">{r.message}</p>}
                    <p className="text-xs text-stone-500 mt-2">Status: <strong>{r.status || 'pending'}</strong></p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="space-x-2">
                      <Button size="sm" className="bg-amber-500 text-stone-900" onClick={() => setStatus(r.id, 'approved')}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => setStatus(r.id, 'rejected')}>Reject</Button>
                    </div>
                    <div className="mt-2">
                      <Link href={`/admin/direct-ad-requests/${r.id}`} className="text-amber-600 hover:underline">View</Link>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
