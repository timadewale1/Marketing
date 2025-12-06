"use client"

import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle, Home, CreditCard } from 'lucide-react'

export default function ConfirmationPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-white to-stone-100 flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full">
        <Card className="border border-green-200 shadow-lg bg-white rounded-xl">
          <CardContent className="p-8 text-center space-y-6">
            {/* Success Icon */}
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
            </div>

            {/* Success Message */}
            <div>
              <h1 className="text-2xl font-bold text-stone-900 mb-2">Payment Submitted</h1>
              <p className="text-stone-600">
                Thank you for your payment. Your transaction has been submitted successfully.
              </p>
            </div>

            {/* Info Box */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-900">
                You&apos;ll receive a confirmation email shortly. Check your transaction history for more details.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pt-2">
              <Link href="/bills" className="block">
                <Button className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold rounded-lg h-11 gap-2">
                  <CreditCard className="w-4 h-4" />
                  Pay Another Bill
                </Button>
              </Link>
              <Link href="/" className="block">
                <Button variant="outline" className="w-full border-stone-300 text-stone-900 rounded-lg h-11 gap-2 hover:bg-stone-50">
                  <Home className="w-4 h-4" />
                  Back Home
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
