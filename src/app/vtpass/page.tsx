"use client"

import React from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const categories = [
  { id: 'airtime', name: 'Airtime' },
  { id: 'data', name: 'Data' },
  { id: 'electricity', name: 'Electricity' },
  { id: 'tv', name: 'TV' },
  { id: 'education', name: 'Education' },
]

export default function VtpassIndex() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">VTpass Services</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((c) => (
          <motion.div key={c.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{c.name}</h3>
                    <p className="text-sm text-stone-500">Fast, secure {c.name.toLowerCase()} and utilities payments</p>
                  </div>
                  <div>
                    <Link href={`/vtpass/${c.id}`}><Button>Open</Button></Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
