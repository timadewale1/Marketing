"use client"

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Copy, ArrowLeft, Home, CreditCard } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { auth } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { useUserRole } from '@/hooks/useUserRole'

interface Card {
  Serial?: string
  serial?: string
  Pin?: string
  pin?: string
}

interface TransactionData {
  serviceID?: string
  amount?: number
  purchased_code?: string
  transactionId?: string
  tokens?: string[]
  pin?: string
  card?: string
  serialNumber?: string
  response_description?: string
  cards?: Card[]
  [key: string]: unknown
}

export default function ConfirmationPage() {
  const [transaction, setTransaction] = useState<TransactionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const { role } = useUserRole()

  useEffect(() => {
    // Get transaction data from session storage (passed from purchase flow)
    const stored = sessionStorage.getItem('lastTransaction')
    if (stored) {
      try {
        const data = JSON.parse(stored)
        setTransaction(data)
      } catch {
        // ignore
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsLoggedIn(!!user)
    })
    return () => unsub()
  }, [])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied!')
  }

  const getThankyouMessage = () => {
    if (!transaction?.serviceID) return 'Thank you for your payment. Your transaction has been submitted successfully.'
    
    const service = transaction.serviceID.toLowerCase()
    const messages: Record<string, string> = {
      'ikeja-electric': 'Thank you for your payment. Your electricity token has been generated successfully.',
      'eko-electric': 'Thank you for your payment. Your electricity token has been generated successfully.',
      'gotv': 'Thank you for your payment. Your TV subscription has been activated successfully.',
      'dstv': 'Thank you for your payment. Your TV subscription has been activated successfully.',
      'startimes': 'Thank you for your payment. Your TV subscription has been activated successfully.',
      'airtime': 'Thank you for your payment. Your airtime has been credited to your number successfully.',
      'data': 'Thank you for your payment. Your data bundle has been credited to your number successfully.',
      'waec': 'Thank you for your payment. Your WAEC result checker has been processed successfully.',
      'waec-registration': 'Thank you for your payment. Your WAEC registration PIN has been generated successfully.',
      'jamb': 'Thank you for your payment. Your JAMB PIN has been generated successfully.',
    }
    return messages[service] || 'Thank you for your payment. Your transaction has been submitted successfully.'
  }

  const renderDetailsContent = () => {
    if (!transaction) return null
    const service = transaction.serviceID?.toLowerCase() || ''
    
    const items = []

    // Electricity/Prepaid PIN
    if ((service.includes('electric') || service === 'prepaid') && transaction.purchased_code) {
      items.push(
        <div key="elec-token" className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="font-semibold text-amber-900 mb-3">Your Token</h3>
          <div className="bg-white p-4 rounded border border-amber-200 space-y-3">
            <div className="flex items-center justify-between">
              {/* <span className="text-sm font-medium text-stone-600">Token Number:</span> */}
              <code className="text-lg font-bold text-amber-600">{transaction.purchased_code}</code>
            </div>
            {transaction.amount && (
              <div className="flex items-center justify-between pt-3 border-t border-amber-100">
                <span className="text-sm font-medium text-stone-600">Amount Paid:</span>
                <span className="text-lg font-bold text-amber-600">₦{Number(transaction.amount).toLocaleString()}</span>
              </div>
            )}
            <button
              onClick={() => copyToClipboard(String(transaction.purchased_code))}
              className="w-full mt-3 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-stone-900 font-medium py-2 rounded transition-all"
            >
              <Copy className="w-4 h-4" />
              Copy Token
            </button>
          </div>
        </div>
      )
    }

    // WAEC Registration/Result Checker Tokens
    // WAEC Registration/Result Checker Cards or Tokens
    if (service.includes('waec') && transaction.cards && Array.isArray(transaction.cards) && transaction.cards.length > 0) {
      items.push(
        <div key="waec-cards" className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-3">Your Card{transaction.cards.length > 1 ? 's' : ''}</h3>
          <div className="space-y-2">
            {transaction.cards.map((c: Card, idx: number) => (
              <div key={idx} className="bg-white p-3 rounded border border-blue-200">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-sm text-stone-600">Serial</div>
                    <div className="font-mono font-bold text-blue-600">{c.Serial || c.serial || ''}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-stone-600">PIN</div>
                    <div className="font-mono font-bold text-blue-600">{c.Pin || c.pin || ''}</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => copyToClipboard(String(c.Serial || c.serial || ''))} className="p-2 hover:bg-blue-50 rounded">Copy Serial</button>
                  <button onClick={() => copyToClipboard(String(c.Pin || c.pin || ''))} className="p-2 hover:bg-blue-50 rounded">Copy PIN</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    } else if (service.includes('waec') && transaction.tokens && transaction.tokens.length > 0) {
      items.push(
        <div key="waec-tokens" className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-3">Your PIN{transaction.tokens.length > 1 ? 's' : ''}</h3>
          <div className="space-y-2">
            {transaction.tokens.map((token, idx) => (
              <div key={idx} className="bg-white p-3 rounded border border-blue-200 flex items-center justify-between">
                <code className="font-mono font-bold text-blue-600">{token}</code>
                <button
                  onClick={() => copyToClipboard(token)}
                  className="p-2 hover:bg-blue-50 rounded transition-all"
                >
                  <Copy className="w-4 h-4 text-blue-600" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )
    }

    // JAMB PIN
    if (service === 'jamb' && transaction.pin) {
      items.push(
        <div key="jamb-pin" className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="font-semibold text-purple-900 mb-3">Your PIN</h3>
          <div className="bg-white p-4 rounded border border-purple-200">
            <div className="flex items-center justify-between">
              <code className="text-lg font-bold text-purple-600">{transaction.pin}</code>
              <button
                onClick={() => copyToClipboard(String(transaction.pin))}
                className="p-2 hover:bg-purple-50 rounded transition-all"
              >
                <Copy className="w-4 h-4 text-purple-600" />
              </button>
            </div>
            <button
              onClick={() => copyToClipboard(String(transaction.pin))}
              className="w-full mt-3 flex items-center justify-center gap-2 bg-purple-500 hover:bg-purple-600 text-white font-medium py-2 rounded transition-all"
            >
              <Copy className="w-4 h-4" />
              Copy PIN
            </button>
          </div>
        </div>
      )
    }

    // Generic details
    items.push(
      <div key="generic-details" className="bg-stone-50 border border-stone-200 rounded-lg p-4">
        <h3 className="font-semibold text-stone-900 mb-3">Transaction Details</h3>
        <div className="space-y-2 text-sm">
          {transaction.serviceID && (
            <div className="flex justify-between">
              <span className="text-stone-600">Service:</span>
              <span className="font-medium text-stone-900 capitalize">{transaction.serviceID}</span>
            </div>
          )}
          {transaction.amount && (
            <div className="flex justify-between">
              <span className="text-stone-600">Amount:</span>
              <span className="font-medium text-stone-900">₦{Number(transaction.amount).toLocaleString()}</span>
            </div>
          )}
          {transaction.response_description && (
            <div className="flex justify-between">
              <span className="text-stone-600">Status:</span>
              <span className="font-medium text-green-600">{transaction.response_description}</span>
            </div>
          )}
          {transaction.transactionId && (
            <div className="flex justify-between">
              <span className="text-stone-600">Transaction ID:</span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-stone-900">{String(transaction.transactionId)}</span>
                <button onClick={() => copyToClipboard(String(transaction.transactionId))} className="p-1 hover:bg-stone-50 rounded">
                  <Copy className="w-4 h-4 text-stone-600" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )

    return items
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto mb-4"></div>
          <p>Loading transaction details...</p>
        </div>
      </div>
    )
  }

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
          <h1 className="text-xl font-bold text-stone-900">Payment Confirmation</h1>
          <div className="w-[68px]" />
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Success Message */}
          <Card className="border border-green-200 bg-green-50 shadow-lg mb-6 rounded-xl">
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-center gap-4">
                <CheckCircle2 className="w-12 h-12 text-green-600 flex-shrink-0" />
                <div>
                  <h2 className="text-lg font-bold text-green-900 mb-2">Payment Successful!</h2>
                  <p className="text-green-800">{getThankyouMessage()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Details Card */}
          <Card className="border border-stone-200 shadow-lg rounded-xl mb-6">
            <CardContent className="p-6 sm:p-8">
              <div className="space-y-4">
                {renderDetailsContent()}

                {/* Warning Message */}
                <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    <strong>⚠️ Important:</strong> Please copy or take a screenshot of your details before closing the page as there will be no way to recover the details if closed.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Link href="/bills" className="block">
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold rounded-lg h-11 gap-2">
                <CreditCard className="w-4 h-4" />
                Pay Another Bill
              </Button>
            </Link>
            <Link href={isLoggedIn ? (role === 'advertiser' ? '/advertiser' : role === 'earner' ? '/earner' : '/dashboard') : '/'} className="block">
              <Button variant="outline" className="w-full border-stone-300 text-stone-900 rounded-lg h-11 gap-2 hover:bg-stone-50">
                <Home className="w-4 h-4" />
                {isLoggedIn ? 'Back to Dashboard' : 'Back Home'}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

