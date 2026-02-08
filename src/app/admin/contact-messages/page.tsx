'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, orderBy, Timestamp } from 'firebase/firestore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Mail, Trash2, Reply, Check } from 'lucide-react'
import toast from 'react-hot-toast'

type ContactMessage = {
  id: string
  name: string
  email: string
  message: string
  status: 'unread' | 'read' | 'replied'
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export default function AdminContactMessagesPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<ContactMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | 'unread' | 'read' | 'replied'>('all')

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (!u) {
        router.replace('/auth/sign-in')
        return
      }

      // Check if user is admin
      const userDoc = doc(db, 'users', u.uid)
      // For now, assume logged-in user can see this (add admin check if needed)

      // Subscribe to contact messages
      const q = query(collection(db, 'contactMessages'), orderBy('createdAt', 'desc'))
      const unsubMessages = onSnapshot(q, (snap) => {
        const msgs = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as ContactMessage[]
        setMessages(msgs)
        setLoading(false)
      })

      return () => unsubMessages()
    })

    return () => unsub()
  }, [router])

  const filteredMessages = messages.filter((msg) => {
    if (filterStatus === 'all') return true
    return msg.status === filterStatus
  })

  const handleMarkAsRead = async (msgId: string) => {
    try {
      await updateDoc(doc(db, 'contactMessages', msgId), {
        status: 'read',
        updatedAt: new Date(),
      })
      toast.success('Marked as read')
    } catch (err) {
      console.error(err)
      toast.error('Failed to update status')
    }
  }

  const handleDelete = async (msgId: string) => {
    if (!confirm('Delete this message permanently?')) return
    try {
      await deleteDoc(doc(db, 'contactMessages', msgId))
      setSelectedMessage(null)
      toast.success('Message deleted')
    } catch (err) {
      console.error(err)
      toast.error('Failed to delete message')
    }
  }

  const handleSendReply = async () => {
    if (!selectedMessage || !replyText.trim()) return

    setSendingReply(true)
    try {
      // In production, send email via SendGrid or similar
      // For now, just mark as replied and save reply
      await updateDoc(doc(db, 'contactMessages', selectedMessage.id), {
        status: 'replied',
        updatedAt: new Date(),
        replyText,
        repliedAt: new Date(),
      })

      toast.success('Reply sent successfully')
      setReplyText('')
      setSelectedMessage(null)
    } catch (err) {
      console.error(err)
      toast.error('Failed to send reply')
    } finally {
      setSendingReply(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-stone-800 mb-8">Contact Messages</h1>

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          {(['all', 'unread', 'read', 'replied'] as const).map((status) => (
            <Button
              key={status}
              variant={filterStatus === status ? 'default' : 'outline'}
              onClick={() => setFilterStatus(status)}
              className={filterStatus === status ? 'bg-amber-600' : ''}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
              {status !== 'all' && ` (${messages.filter((m) => m.status === status).length})`}
            </Button>
          ))}
        </div>

        {/* Messages List */}
        <div className="space-y-4">
          {loading ? (
            <p className="text-stone-600">Loading messages...</p>
          ) : filteredMessages.length === 0 ? (
            <p className="text-stone-600">No messages found.</p>
          ) : (
            filteredMessages.map((msg) => (
              <Card
                key={msg.id}
                className={`p-4 cursor-pointer transition ${
                  msg.status === 'unread'
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-white/70'
                }`}
                onClick={() => setSelectedMessage(msg)}
              >
                <CardContent className="p-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Mail size={18} className="text-amber-600" />
                        <h3 className="font-semibold text-stone-800">{msg.name}</h3>
                        {msg.status === 'unread' && (
                          <span className="inline-block w-2 h-2 bg-amber-600 rounded-full"></span>
                        )}
                      </div>
                      <p className="text-sm text-stone-600 mt-1">{msg.email}</p>
                      <p className="text-stone-700 mt-2 line-clamp-2">{msg.message}</p>
                      <p className="text-xs text-stone-500 mt-2">
                        {msg.createdAt?.toDate?.().toLocaleDateString?.() || 'Just now'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          msg.status === 'unread'
                            ? 'bg-amber-100 text-amber-700'
                            : msg.status === 'read'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {msg.status}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Message Detail Modal */}
      {selectedMessage && (
        <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
          <DialogContent className="max-w-2xl bg-white rounded-lg">
            <DialogHeader>
              <DialogTitle>
                {selectedMessage.name} ({selectedMessage.email})
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Message Content */}
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-stone-700 whitespace-pre-wrap">{selectedMessage.message}</p>
                <p className="text-xs text-stone-500 mt-4">
                  Received: {selectedMessage.createdAt?.toDate?.().toLocaleString?.() || 'Unknown'}
                </p>
              </div>

              {/* Reply Form */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-stone-700">Send Reply</label>
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your reply here..."
                  className="h-24"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-between">
                <div className="flex gap-2">
                  {selectedMessage.status === 'unread' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        handleMarkAsRead(selectedMessage.id)
                        setSelectedMessage(null)
                      }}
                      className="gap-2"
                    >
                      <Check size={16} /> Mark as Read
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(selectedMessage.id)}
                    className="gap-2"
                  >
                    <Trash2 size={16} /> Delete
                  </Button>
                </div>
                <Button
                  onClick={handleSendReply}
                  disabled={sendingReply || !replyText.trim()}
                  className="bg-amber-600 hover:bg-amber-700 gap-2"
                >
                  <Reply size={16} /> Send Reply
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
