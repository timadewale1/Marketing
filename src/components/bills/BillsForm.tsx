"use client"

import React from 'react'

export default function BillsForm() {
  // Dataway removed. Direct users to the new VTpass services page.
  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold">Bills & Utilities</h3>
      <p className="text-sm text-stone-600">The previous Dataway integration has been removed. Use VTpass for bills and utilities.</p>
      <div className="mt-4">
        <a href="/vtpass" target="_blank" rel="noreferrer" className="inline-block bg-amber-500 text-stone-900 px-4 py-2 rounded">Open VTpass Services</a>
      </div>
    </div>
  )
}
