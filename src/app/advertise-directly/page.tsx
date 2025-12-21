"use client"

import React, { useState } from "react"
import { db } from "@/lib/firebase"
import { collection, addDoc, serverTimestamp } from "firebase/firestore"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { toast } from "react-hot-toast"
import { useRouter } from "next/navigation"

export default function AdvertiseDirectlyPage() {
  const router = useRouter()
  const [businessName, setBusinessName] = useState("")
  const [contactName, setContactName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [advertType, setAdvertType] = useState("")
  const [duration, setDuration] = useState("")
  const [budget, setBudget] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!businessName || !contactName || !phone || !email) {
      toast.error("Please complete required fields")
      return
    }
    setSubmitting(true)
    try {
      await addDoc(collection(db, "directAdvertRequests"), {
        businessName,
        contactName,
        email,
        phone,
        advertType: advertType || null,
        duration: duration || null,
        budget: budget ? Number(budget) : null,
        message: message || null,
        status: "pending",
        createdAt: serverTimestamp(),
      })
      toast.success("Thanks — your request has been submitted")
      router.push("/advertise-directly/thank-you")
    } catch (err) {
      console.error(err)
      toast.error("Failed to submit — try again")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 via-amber-100 to-stone-200 py-12">
      <div className="container mx-auto px-4 max-w-3xl">
        <Card className="p-6">
          <h1 className="text-2xl font-semibold mb-4">Advertise Directly</h1>
          <p className="text-sm text-stone-600 mb-4">Fill this short form and our team will reach out to help set up your campaign.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-stone-600">Business name *</label>
              <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            </div>

            <div>
              <label className="text-xs text-stone-600">Contact person *</label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-stone-600">Phone *</label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-stone-600">Email *</label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-stone-600">Advert type</label>
                <Input value={advertType} onChange={(e) => setAdvertType(e.target.value)} placeholder="e.g., Video, Social, Survey" />
              </div>
              <div>
                <label className="text-xs text-stone-600">Duration</label>
                <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g., 7 days" />
              </div>
              <div>
                <label className="text-xs text-stone-600">Budget (₦)</label>
                <Input value={budget} onChange={(e) => setBudget(e.target.value)} type="number" />
              </div>
            </div>

            <div>
              <label className="text-xs text-stone-600">Message / Requirements</label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={submitting} className="bg-amber-500 hover:bg-amber-600 text-stone-900">
                {submitting ? "Submitting..." : "Send request"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
