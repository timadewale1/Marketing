"use client"

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import BillsForm from './BillsForm'

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
            <Dialog>
              <DialogTrigger>
                <Button className="bg-amber-500 text-stone-900">Pay Bill</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Pay Bills & Utilities</DialogTitle>
                </DialogHeader>
                <div className="mt-4">
                  <BillsForm />
                </div>
                <DialogFooter />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
