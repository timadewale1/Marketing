import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

export async function GET() {
  try {
    const { dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin) return NextResponse.json({ ok: false, message: 'No admin DB available' }, { status: 500 })

    // fetch up to 1000 items for computing quick stats
    const snapshot = await dbAdmin.collection('vtpassTransactions').orderBy('createdAt', 'desc').limit(1000).get()
    let total = 0
    let count = 0
    snapshot.forEach(doc => {
      const d = doc.data() as Record<string, unknown>
      const raw = d.amount as unknown
      const amt = Number(raw || 0)
      total += Number.isNaN(amt) ? 0 : amt
      count += 1
    })

    const SERVICE_CHARGE = 50
    const totalMarkup = count * SERVICE_CHARGE

    return NextResponse.json({ ok: true, stats: { totalTransacted: total, totalTransactions: count, totalMarkup } })
  } catch (err) {
    console.error('admin vtpass stats error', err)
    return NextResponse.json({ ok: false, message: 'Internal' }, { status: 500 })
  }
}
