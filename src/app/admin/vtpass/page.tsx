"use client"

import React, { useEffect, useState } from 'react'

export default function AdminVtpassPage() {
  const [stats, setStats] = useState<{ totalTransacted?: number; totalTransactions?: number; totalMarkup?: number } | null>(null)
  const [transactions, setTransactions] = useState<Array<Record<string, unknown>>>([])
  const [perPage, setPerPage] = useState(15)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [sRes, tRes] = await Promise.all([
          fetch('/api/admin/vtpass/stats'),
          fetch(`/api/admin/vtpass/transactions?limit=${perPage}&page=${page}`),
        ])
        const sj = await sRes.json()
        const tj = await tRes.json()
        if (mounted && sRes.ok && sj?.ok) setStats(sj.stats)
        if (mounted && tRes.ok && tj?.ok && Array.isArray(tj.items)) setTransactions(tj.items)
      } catch {
        // ignore
      }
    })()
    return () => { mounted = false }
  }, [perPage, page])

  const refresh = async () => {
    setLoading(true)
    try {
      const [sRes, tRes] = await Promise.all([
          fetch('/api/admin/vtpass/stats'),
          fetch(`/api/admin/vtpass/transactions?limit=${perPage}&page=${page}`),
        ])
      const sj = await sRes.json()
      const tj = await tRes.json()
      if (sRes.ok && sj?.ok) setStats(sj.stats)
      if (tRes.ok && tj?.ok && Array.isArray(tj.items)) setTransactions(tj.items)
    } catch {
      // ignore
    }
    setLoading(false)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">VTpass Manager</h1>
        <div className="flex items-center gap-2">
          <a href="/api/admin/vtpass/export" className="px-3 py-1 border rounded bg-stone-100 text-sm">Export CSV</a>
          <button onClick={refresh} className="px-3 py-1 bg-amber-500 text-stone-900 rounded">{loading ? 'Refreshing...' : 'Refresh'}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 border rounded">
          <h3 className="text-sm text-stone-500">Total Transacted</h3>
          <div className="text-lg font-semibold">₦{Number(stats?.totalTransacted || 0).toLocaleString()}</div>
        </div>
        <div className="p-4 border rounded">
          <h3 className="text-sm text-stone-500">Transactions</h3>
          <div className="text-lg font-semibold">{stats?.totalTransactions ?? 0}</div>
        </div>
        <div className="p-4 border rounded">
          <h3 className="text-sm text-stone-500">Markup Earned</h3>
          <div className="text-lg font-semibold">₦{Number(stats?.totalMarkup || 0).toLocaleString()}</div>
        </div>
      </div>

      <div className="p-4 border rounded">
        <h2 className="font-semibold">Recent VTpass Purchases</h2>
    <p className="text-sm text-stone-500">Transactions are stored in the vtpassTransactions collection.</p>
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <label className="text-sm">Per page</label>
            <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} className="p-1 border rounded">
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <div className="ml-auto flex items-center gap-2">
              <button className="px-3 py-1 border rounded" onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
              <span className="text-sm">Page {page}</span>
              <button className="px-3 py-1 border rounded" onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="text-left">
                  <th className="p-2">ID</th>
                  <th className="p-2">Service</th>
                  <th className="p-2">Amount</th>
                  <th className="p-2">Paid (₦)</th>
                  <th className="p-2">Markup</th>
                  <th className="p-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => (
                  <tr key={String(tx.id)} className="border-t">
                    <td className="p-2 truncate max-w-xs">{String(tx.id || '')}</td>
                    <td className="p-2">{String(tx.serviceID || tx.service || tx.serviceName || '')}</td>
                    <td className="p-2">₦{Number(tx.amount || 0).toLocaleString()}</td>
                    <td className="p-2">₦{Number(tx.paidAmount || 0).toLocaleString()}</td>
                    <td className="p-2">₦{Number(tx.markup || 0).toLocaleString()}</td>
                    <td className="p-2">{(() => {
                          const created = tx.createdAt as unknown
                          if (created && typeof created === 'object' && 'seconds' in (created as Record<string, unknown>)) {
                            // Firestore Timestamp-like
                            const s = Number((created as Record<string, unknown>)['seconds'] || 0)
                            return new Date(s * 1000).toLocaleString()
                          }
                          if (typeof created === 'number') return new Date(created).toLocaleString()
                          if (typeof created === 'string') return new Date(Number(created) || 0).toLocaleString()
                          return ''
                        })()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
