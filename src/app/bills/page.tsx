"use client"

import React from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Smartphone, Zap, Lightbulb, Tv, BookOpen } from 'lucide-react'

const categories = [
  { id: 'airtime', name: 'Airtime', icon: Smartphone, color: 'bg-blue-50 text-blue-600' },
  { id: 'data', name: 'Data', icon: Zap, color: 'bg-yellow-50 text-yellow-600' },
  { id: 'electricity', name: 'Electricity', icon: Lightbulb, color: 'bg-orange-50 text-orange-600' },
  { id: 'tv', name: 'TV', icon: Tv, color: 'bg-purple-50 text-purple-600' },
  { id: 'education', name: 'Education', icon: BookOpen, color: 'bg-green-50 text-green-600' },
]

export default function BillsIndex() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-white to-stone-100">
      {/* Header */}
      <div className="bg-white/50 backdrop-blur-md border-b border-stone-200">
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold text-stone-900 mb-2">PAMBA Bills & Utilities</h1>
          <p className="text-stone-600">Pay your bills quickly and securely</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {categories.map((c, idx) => {
            const Icon = c.icon
            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Link href={`/bills/${c.id}`}>
                  <Card className="h-full border border-stone-200 shadow-md hover:shadow-lg transition-all cursor-pointer bg-white rounded-xl overflow-hidden">
                    <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
                      <div className={`w-16 h-16 rounded-full ${c.color} flex items-center justify-center`}>
                        <Icon className="w-8 h-8" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-stone-900">{c.name}</h3>
                        <p className="text-xs text-stone-500 mt-1">Fast & Secure</p>
                      </div>
                      <Button className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold rounded-lg">
                        Pay {c.name}
                      </Button>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
