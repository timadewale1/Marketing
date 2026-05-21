import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

export async function GET() {
  try {
    const { dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin) return NextResponse.json({ ok: false, message: 'No admin DB available' }, { status: 500 })

    const collectionRef = dbAdmin.collection('vtpassTransactions')
    let total = 0
    let markupTotal = 0
    let count = 0
    let lastDoc: unknown | null = null

    while (true) {
      let queryRef = collectionRef.orderBy('createdAt', 'desc').limit(500)
      if (lastDoc) {
        queryRef = queryRef.startAfter(lastDoc as never)
      }

      const snapshot = await queryRef.get()
      if (snapshot.empty) break

      snapshot.forEach(doc => {
        const d = doc.data() as Record<string, unknown>
        const amountValue = Number(d.paidAmount ?? d.amount ?? 0)
        const profitValue = Number(d.profit ?? d.markup ?? 0)
        total += Number.isNaN(amountValue) ? 0 : amountValue
        markupTotal += Number.isNaN(profitValue) ? 0 : profitValue
        count += 1
      })

      lastDoc = snapshot.docs[snapshot.docs.length - 1] || null
      if (snapshot.size < 500) break
    }

    return NextResponse.json({ ok: true, stats: { totalTransacted: total, totalTransactions: count, totalMarkup: markupTotal } })
  } catch (err) {
    console.error('admin vtpass stats error', err)
    return NextResponse.json({ ok: false, message: 'Internal' }, { status: 500 })
  }
}
