"use client"

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function BillsCard() {
  return (
    <Card className="bg-white/70 backdrop-blur border-none shadow-md hover:shadow-lg transition-all">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-stone-900">Bills & Utilities</h3>
            <p className="text-sm text-stone-600">Pay electricity, data, TV or phone bills quickly and securely.</p>
          </div>
          <div>
            {/* Open PAMBA Bills in a new tab per project requirement */}
            <a href="/bills" target="_blank" rel="noreferrer">
              <Button className="bg-amber-500 text-stone-900">Pay Bill</Button>
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
