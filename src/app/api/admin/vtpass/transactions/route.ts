import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const limit = Number(url.searchParams.get('limit') || '100')
    const page = Math.max(1, Number(url.searchParams.get('page') || '1'))
    const offset = Math.max(0, (page - 1) * limit)

    const { dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin) return NextResponse.json({ ok: false, message: 'No admin DB available' }, { status: 500 })

    // Fetch one extra item to detect whether there's a next page
    const fetchLimit = limit + 1
    const queryRef = dbAdmin.collection('vtpassTransactions').orderBy('createdAt', 'desc').offset(offset).limit(fetchLimit)
    const snapshot = await queryRef.get()
    const allItems: Record<string, unknown>[] = []
    snapshot.forEach(doc => allItems.push({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))

    const hasMore = allItems.length > limit
    const items = hasMore ? allItems.slice(0, limit) : allItems

    return NextResponse.json({ ok: true, items, page, hasMore })
  } catch (err) {
    console.error('admin vtpass transactions error', err)
    return NextResponse.json({ ok: false, message: 'Internal' }, { status: 500 })
  }
}
