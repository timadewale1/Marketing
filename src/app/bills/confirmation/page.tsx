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

interface CardPin {
  Serial?: string
  serial?: string
  Pin?: string
  pin?: string
}

interface TransactionData {
  serviceID?: string
  amount?: number
  purchased_code?: string
  token?: string
  transactionId?: string
  requestId?: string
  reference?: string
  tokens?: string[]
  pin?: string
  card?: string
  serialNumber?: string
  response_description?: string
  cards?: CardPin[]
  certUrl?: string
  [key: string]: unknown
}

export default function ConfirmationPage() {
  const [transaction, setTransaction] = useState<TransactionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const { role } = useUserRole()

  useEffect(() => {
    const stored = sessionStorage.getItem('lastTransaction')
    if (stored) {
      try {
        setTransaction(JSON.parse(stored))
      } catch {
        // ignore invalid session payload
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
      'abuja-electric': 'Thank you for your payment. Your electricity token has been generated successfully.',
      gotv: 'Thank you for your payment. Your TV subscription has been activated successfully.',
      dstv: 'Thank you for your payment. Your TV subscription has been activated successfully.',
      startimes: 'Thank you for your payment. Your TV subscription has been activated successfully.',
      airtime: 'Thank you for your payment. Your airtime has been credited to your number successfully.',
      data: 'Thank you for your payment. Your data bundle has been credited to your number successfully.',
      waec: 'Thank you for your payment. Your WAEC result checker has been processed successfully.',
      'waec-registration': 'Thank you for your payment. Your WAEC registration PIN has been generated successfully.',
      jamb: 'Thank you for your payment. Your JAMB PIN has been generated successfully.',
      'ui-insure': 'Thank you for your payment. Your insurance certificate has been generated successfully.',
    }
    return messages[service] || 'Thank you for your payment. Your transaction has been submitted successfully.'
  }

  const renderDetailsContent = () => {
    if (!transaction) return null

    const service = transaction.serviceID?.toLowerCase() || ''
    const electricityToken = String(transaction.purchased_code || transaction.token || '').trim()
    const displayReference = String(transaction.requestId || transaction.reference || '').trim()
    const items: React.ReactNode[] = []

    if (service === 'ui-insure' && (transaction.certUrl || transaction.purchased_code)) {
      const certUrl = String(transaction.certUrl || '').trim()
      const purchasedCode = String(transaction.purchased_code || '').trim()
      items.push(
        <div key="insurance-cert" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="mb-3 font-semibold text-emerald-900">Insurance Certificate</h3>
          <div className="space-y-3 rounded border border-emerald-200 bg-white p-4">
            {purchasedCode ? <p className="break-all text-sm font-medium text-emerald-800">{purchasedCode}</p> : null}
            {certUrl ? (
              <a
                href={certUrl}
                target="_blank"
                rel="noreferrer"
                className="block rounded bg-emerald-500 px-4 py-2 text-center font-medium text-white transition-all hover:bg-emerald-600"
              >
                Open Certificate
              </a>
            ) : null}
          </div>
        </div>
      )
    }

    if ((service.includes('electric') || service === 'prepaid') && electricityToken) {
      items.push(
        <div key="elec-token" className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="mb-3 font-semibold text-amber-900">Your Token</h3>
          <div className="space-y-3 rounded border border-amber-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <code className="text-lg font-bold text-amber-600">{electricityToken}</code>
            </div>
            {transaction.amount ? (
              <div className="flex items-center justify-between border-t border-amber-100 pt-3">
                <span className="text-sm font-medium text-stone-600">Amount Paid:</span>
                <span className="text-lg font-bold text-amber-600">N{Number(transaction.amount).toLocaleString()}</span>
              </div>
            ) : null}
            <button
              onClick={() => copyToClipboard(electricityToken)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded bg-amber-500 py-2 font-medium text-stone-900 transition-all hover:bg-amber-600"
            >
              <Copy className="h-4 w-4" />
              Copy Token
            </button>
          </div>
        </div>
      )
    }

    if (service.includes('waec') && transaction.cards && Array.isArray(transaction.cards) && transaction.cards.length > 0) {
      items.push(
        <div key="waec-cards" className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h3 className="mb-3 font-semibold text-blue-900">Your Card{transaction.cards.length > 1 ? 's' : ''}</h3>
          <div className="space-y-2">
            {transaction.cards.map((card, idx) => (
              <div key={idx} className="rounded border border-blue-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-stone-600">Serial</div>
                    <div className="font-mono font-bold text-blue-600">{card.Serial || card.serial || ''}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-stone-600">PIN</div>
                    <div className="font-mono font-bold text-blue-600">{card.Pin || card.pin || ''}</div>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => copyToClipboard(String(card.Serial || card.serial || ''))} className="rounded p-2 hover:bg-blue-50">
                    Copy Serial
                  </button>
                  <button onClick={() => copyToClipboard(String(card.Pin || card.pin || ''))} className="rounded p-2 hover:bg-blue-50">
                    Copy PIN
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    } else if (service.includes('waec') && transaction.tokens && transaction.tokens.length > 0) {
      items.push(
        <div key="waec-tokens" className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h3 className="mb-3 font-semibold text-blue-900">Your PIN{transaction.tokens.length > 1 ? 's' : ''}</h3>
          <div className="space-y-2">
            {transaction.tokens.map((token, idx) => (
              <div key={idx} className="flex items-center justify-between rounded border border-blue-200 bg-white p-3">
                <code className="font-mono font-bold text-blue-600">{token}</code>
                <button onClick={() => copyToClipboard(token)} className="rounded p-2 transition-all hover:bg-blue-50">
                  <Copy className="h-4 w-4 text-blue-600" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (service === 'jamb' && transaction.pin) {
      items.push(
        <div key="jamb-pin" className="rounded-lg border border-purple-200 bg-purple-50 p-4">
          <h3 className="mb-3 font-semibold text-purple-900">Your PIN</h3>
          <div className="rounded border border-purple-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <code className="text-lg font-bold text-purple-600">{transaction.pin}</code>
              <button onClick={() => copyToClipboard(String(transaction.pin))} className="rounded p-2 transition-all hover:bg-purple-50">
                <Copy className="h-4 w-4 text-purple-600" />
              </button>
            </div>
            <button
              onClick={() => copyToClipboard(String(transaction.pin))}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded bg-purple-500 py-2 font-medium text-white transition-all hover:bg-purple-600"
            >
              <Copy className="h-4 w-4" />
              Copy PIN
            </button>
          </div>
        </div>
      )
    }

    if (service.includes('waec') && (!transaction.cards || transaction.cards.length === 0) && (!transaction.tokens || transaction.tokens.length === 0) && electricityToken) {
      items.push(
        <div key="waec-code" className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h3 className="mb-3 font-semibold text-blue-900">Your Code</h3>
          <div className="rounded border border-blue-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <code className="break-all text-sm font-bold text-blue-700">{electricityToken}</code>
              <button onClick={() => copyToClipboard(electricityToken)} className="rounded p-2 hover:bg-blue-50">
                <Copy className="h-4 w-4 text-blue-700" />
              </button>
            </div>
          </div>
        </div>
      )
    }

    if (service === 'jamb' && !transaction.pin && electricityToken) {
      items.push(
        <div key="jamb-code" className="rounded-lg border border-purple-200 bg-purple-50 p-4">
          <h3 className="mb-3 font-semibold text-purple-900">Your PIN</h3>
          <div className="rounded border border-purple-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <code className="break-all text-sm font-bold text-purple-700">{electricityToken}</code>
              <button onClick={() => copyToClipboard(electricityToken)} className="rounded p-2 hover:bg-purple-50">
                <Copy className="h-4 w-4 text-purple-700" />
              </button>
            </div>
          </div>
        </div>
      )
    }

    if (!service.includes('electric') && !service.includes('waec') && service !== 'jamb' && service !== 'ui-insure' && electricityToken) {
      items.push(
        <div key="generic-code" className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="mb-3 font-semibold text-amber-900">Purchase Code</h3>
          <div className="rounded border border-amber-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <code className="break-all text-sm font-bold text-amber-700">{electricityToken}</code>
              <button onClick={() => copyToClipboard(electricityToken)} className="rounded p-2 hover:bg-amber-50">
                <Copy className="h-4 w-4 text-amber-700" />
              </button>
            </div>
          </div>
        </div>
      )
    }

    items.push(
      <div key="generic-details" className="rounded-lg border border-stone-200 bg-stone-50 p-4">
        <h3 className="mb-3 font-semibold text-stone-900">Transaction Details</h3>
        <div className="space-y-2 text-sm">
          {transaction.serviceID ? (
            <div className="flex justify-between">
              <span className="text-stone-600">Service:</span>
              <span className="font-medium capitalize text-stone-900">{transaction.serviceID}</span>
            </div>
          ) : null}
          {transaction.amount ? (
            <div className="flex justify-between">
              <span className="text-stone-600">Amount:</span>
              <span className="font-medium text-stone-900">N{Number(transaction.amount).toLocaleString()}</span>
            </div>
          ) : null}
          {transaction.response_description ? (
            <div className="flex justify-between">
              <span className="text-stone-600">Status:</span>
              <span className="font-medium text-green-600">{transaction.response_description}</span>
            </div>
          ) : null}
          {transaction.transactionId ? (
            <div className="flex justify-between">
              <span className="text-stone-600">Transaction ID:</span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-stone-900">{String(transaction.transactionId)}</span>
                <button onClick={() => copyToClipboard(String(transaction.transactionId))} className="rounded p-1 hover:bg-stone-50">
                  <Copy className="h-4 w-4 text-stone-600" />
                </button>
              </div>
            </div>
          ) : null}
          {displayReference ? (
            <div className="flex justify-between">
              <span className="text-stone-600">Reference:</span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-stone-900">{displayReference}</span>
                <button onClick={() => copyToClipboard(displayReference)} className="rounded p-1 hover:bg-stone-50">
                  <Copy className="h-4 w-4 text-stone-600" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    )

    return items
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-amber-500" />
          <p>Loading transaction details...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-white to-stone-100">
      <div className="sticky top-0 z-10 border-b border-stone-200 bg-white/80 backdrop-blur-md">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Link href="/bills">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-stone-900">Payment Confirmation</h1>
          <div className="w-[68px]" />
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <Card className="mb-6 rounded-xl border border-green-200 bg-green-50 shadow-lg">
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-center gap-4">
                <CheckCircle2 className="h-12 w-12 flex-shrink-0 text-green-600" />
                <div>
                  <h2 className="mb-2 text-lg font-bold text-green-900">Payment Successful!</h2>
                  <p className="text-green-800">{getThankyouMessage()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6 rounded-xl border border-stone-200 shadow-lg">
            <CardContent className="p-6 sm:p-8">
              <div className="space-y-4">
                {renderDetailsContent()}
                <div className="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Important:</strong> Please copy or take a screenshot of your details before closing the page as there will be no way to recover the details if closed.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Link href="/bills" className="block">
              <Button className="h-11 w-full gap-2 rounded-lg bg-amber-500 font-semibold text-stone-900 hover:bg-amber-600">
                <CreditCard className="h-4 w-4" />
                Pay Another Bill
              </Button>
            </Link>
            <Link href={isLoggedIn ? (role === 'advertiser' ? '/advertiser' : role === 'earner' ? '/earner' : '/dashboard') : '/'} className="block">
              <Button variant="outline" className="h-11 w-full gap-2 rounded-lg border-stone-300 text-stone-900 hover:bg-stone-50">
                <Home className="h-4 w-4" />
                {isLoggedIn ? 'Back to Dashboard' : 'Back Home'}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
