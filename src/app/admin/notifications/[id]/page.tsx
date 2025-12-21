"use client"

import React, { useEffect, useState } from "react"
import { db } from "@/lib/firebase"
import { doc, getDoc, updateDoc } from "firebase/firestore"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { toast } from "react-hot-toast"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

interface Notification {
  id: string
  title: string
  body: string
  read?: boolean
  link?: string
}

export default function NotificationDetail() {
  const { id } = useParams()
  const router = useRouter()
  const [note, setNote] = useState<Notification | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'adminNotifications', Array.isArray(id) ? id[0] : id))
        if (!snap.exists()) return toast.error('Notification not found')
        setNote({ id: snap.id, ...(snap.data() as Omit<Notification, 'id'> || {}) })
        setLoading(false)
      } catch (err) {
        console.error(err)
        toast.error('Failed to load notification')
        setLoading(false)
      }
    })()
  }, [id])

  const markRead = async () => {
    if (!note) return
    try {
      await updateDoc(doc(db, 'adminNotifications', note.id), { read: true })
      setNote({ ...note, read: true })
      toast.success('Marked read')
    } catch (err) {
      console.error(err)
      toast.error('Failed to mark read')
    }
  }

  if (loading) return <p>Loading…</p>
  if (!note) return <p>Notification not found</p>

  return (
    <div className="min-h-screen bg-stone-50 py-8">
      <div className="container mx-auto px-4">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">Back</Button>
        <Card className="p-6">
          <h1 className="text-xl font-semibold mb-2">{note.title}</h1>
          <p className="text-sm text-stone-700 mb-4">{note.body}</p>
          <div className="flex gap-3">
            {!note.read && <Button onClick={markRead} className="bg-amber-500 text-stone-900">Mark read</Button>}
            {note.link && <Link href={note.link} className="text-amber-600 hover:underline">Open link</Link>}
          </div>
        </Card>
      </div>
    </div>
  )
}
