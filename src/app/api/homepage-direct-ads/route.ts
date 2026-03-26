import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

function toMillis(value: unknown) {
  if (!value) return 0
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    return Number((value as { seconds?: number }).seconds || 0) * 1000
  }
  if (value instanceof Date) return value.getTime()
  return 0
}

export async function GET() {
  try {
    const { dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin) {
      return NextResponse.json({ success: false, message: 'Firebase admin unavailable' }, { status: 500 })
    }

    const now = Date.now()
    const snap = await dbAdmin.collection('homepageDirectAds').where('status', '==', 'active').get()

    const ads = snap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>
        return {
          id: doc.id,
          brandName: String(data.brandName || ''),
          phone: String(data.phone || ''),
          email: String(data.email || ''),
          writeup: String(data.writeup || ''),
          link: data.link ? String(data.link) : '',
          mediaType: String(data.mediaType || 'image'),
          mediaUrl: String(data.mediaUrl || ''),
          mediaPath: String(data.mediaPath || ''),
          durationDays: Number(data.durationDays || 0),
          status: String(data.status || 'inactive'),
          createdAtMs: toMillis(data.createdAt),
          startsAtMs: toMillis(data.startsAt),
          expiresAtMs: toMillis(data.expiresAt),
        }
      })
      .filter((ad) => ad.mediaUrl && (!ad.expiresAtMs || ad.expiresAtMs > now))
      .sort((a, b) => (a.createdAtMs < b.createdAtMs ? 1 : -1))

    return NextResponse.json({ success: true, ads })
  } catch (error) {
    console.error('Homepage direct ads load error:', error)
    return NextResponse.json({ success: false, message: 'Failed to load homepage direct ads' }, { status: 500 })
  }
}
