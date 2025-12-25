import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows || !rows.length) return ''
  const keys = Object.keys(rows[0])
  const lines = [keys.join(',')]
  for (const r of rows) {
    const vals = keys.map(k => {
      const v = r[k]
      if (v === null || v === undefined) return ''
      const s = String(v).replace(/"/g, '""')
      return `"${s}"`
    })
    lines.push(vals.join(','))
  }
  return lines.join('\n')
}

export async function GET() {
  try {
    const { dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin) return NextResponse.json({ ok: false, message: 'No admin DB available' }, { status: 500 })

    const snapshot = await dbAdmin.collection('vtpassTransactions').orderBy('createdAt', 'desc').limit(5000).get()
    const items: Record<string, unknown>[] = []
    snapshot.forEach(doc => items.push({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))

    const csv = toCsv(items)
    return new NextResponse(csv, { status: 200, headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="vtpass_transactions.csv"' } })
  } catch (err) {
    console.error('admin vtpass export error', err)
    return NextResponse.json({ ok: false, message: 'Internal' }, { status: 500 })
  }
}
