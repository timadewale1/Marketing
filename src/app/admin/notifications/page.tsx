"use client"

import React, { useEffect, useState } from "react"
import { db } from "@/lib/firebase"
import { collection, query, orderBy, onSnapshot, updateDoc, doc } from "firebase/firestore"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Bell, Check, ExternalLink } from "lucide-react"
import Link from "next/link"
import { toast } from "react-hot-toast"

interface AdminNotification {
  id: string
  title: string
  body: string
  createdAt?: { toDate(): Date }
  link?: string
  read?: boolean
}

export default function AdminNotificationsPage() {
  const [notes, setNotes] = useState<AdminNotification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, "adminNotifications"), orderBy("createdAt", "desc"))
    const unsub = onSnapshot(q, (snap) => {
      setNotes(snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) } as AdminNotification)))
      setLoading(false)
    }, (err) => {
      console.error('Failed to load admin notifications', err)
      toast.error('Failed to load notifications')
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const markRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'adminNotifications', id), { read: true })
      toast.success('Marked read')
    } catch (err) {
      console.error(err)
      toast.error('Failed to mark read')
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 py-8">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Admin Notifications</h1>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => window.location.reload()} className="flex items-center gap-2">
              <Bell size={16} /> Refresh
            </Button>
          </div>
        </div>

        {loading ? <p>Loading…</p> : (
          <div className="space-y-4">
            {notes.length === 0 && <p className="text-sm text-stone-600">No notifications</p>}
            {notes.map(n => (
              <Card key={n.id} className="p-4">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="font-semibold">{n.title}</h3>
                    <p className="text-sm text-stone-600 mt-1">{n.body}</p>
                    <p className="text-xs text-stone-500 mt-2">{n.createdAt?.toDate ? new Date(n.createdAt.toDate()).toLocaleString() : ''}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => markRead(n.id)} className="bg-amber-500 text-stone-900"><Check size={14} /> Mark read</Button>
                      {n.link && (
                        <Link href={n.link} className="text-amber-600 hover:underline flex items-center gap-2"><ExternalLink size={14} /> View</Link>
                      )}
                    </div>
                    {!n.read && <span className="text-xs text-amber-600">New</span>}
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
