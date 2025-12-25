import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const limit = Number(url.searchParams.get('limit') || '100')

    const { dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin) return NextResponse.json({ ok: false, message: 'No admin DB available' }, { status: 500 })

    const snapshot = await dbAdmin.collection('vtpassTransactions').orderBy('createdAt', 'desc').limit(limit).get()
  const items: Record<string, unknown>[] = []
  snapshot.forEach(doc => items.push({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))

    return NextResponse.json({ ok: true, items })
  } catch (err) {
    console.error('admin vtpass transactions error', err)
    return NextResponse.json({ ok: false, message: 'Internal' }, { status: 500 })
  }
}
