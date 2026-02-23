"use client"

import { useState } from 'react'
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Mail, MapPin, Phone, MessageCircle, Youtube } from 'lucide-react'
import toast from "react-hot-toast"

export default function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        toast.success("Message sent successfully!")
        setName('')
        setEmail('')
        setMessage('')
      } else {
        toast.error(data.message || "Failed to send message")
      }
    } catch (error) {
      console.error('Contact form error:', error)
      toast.error("Failed to send message")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center text-stone-800 mb-8">
          Contact Us
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Contact Form */}
          <Card className="p-6 bg-gradient-to-br from-amber-50 to-stone-100">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Name
                </label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Your name"
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Email
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="your@email.com"
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Message
                </label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  placeholder="How can we help?"
                  className="w-full h-32"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-600 text-white hover:bg-amber-700"
              >
                {loading ? 'Sending...' : 'Send Message'}
              </Button>
            </form>
          </Card>

          {/* Contact Information */}
          <div className="space-y-6">
            <Card className="p-6 bg-gradient-to-br from-amber-50 to-stone-100">
              <div className="flex items-start space-x-4">
                <Mail className="text-amber-600 mt-1" />
                <div>
                  <h3 className="font-medium text-stone-800">Email</h3>
                  <p className="text-stone-600">support@pambaadverts.com</p>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-amber-50 to-stone-100">
              <div className="flex items-start space-x-4">
                <MapPin className="text-amber-600 mt-1" />
                <div>
                  <h3 className="font-medium text-stone-800">Office</h3>
                  <p className="text-stone-600">
                    Abuja, Nigeria
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-amber-50 to-stone-100">
              <div className="flex items-start space-x-4">
                <Phone className="text-amber-600 mt-1" />
                <div>
                  <h3 className="font-medium text-stone-800">Phone</h3>
                  <p className="text-stone-600">+234 8146532678</p>
                  <p className="text-xs text-stone-500 mt-1">
                    Mon-Fri 9am-5pm WAT
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-amber-50 to-stone-100">
              <a href="https://wa.me/message/LVWEYWZSTQBQI1" className="flex items-start space-x-4 hover:text-amber-600 transition-colors">
                <MessageCircle className="text-amber-600 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-medium text-stone-800">WhatsApp</h3>
                  <p className="text-stone-600">Chat with us on WhatsApp</p>
                </div>
              </a>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-amber-50 to-stone-100">
              <a href="https://www.youtube.com/@pambaadvertisementcompany" className="flex items-start space-x-4 hover:text-amber-600 transition-colors">
                <Youtube className="text-amber-600 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-medium text-stone-800">YouTube</h3>
                  <p className="text-stone-600">Subscribe to our channel</p>
                </div>
              </a>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}