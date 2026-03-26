import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { requireAdminSession } from '@/lib/admin-session'

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSession()

    const { id } = await context.params
    const body = await req.json()
    const status = String(body?.status || '').trim()

    if (!id || !['active', 'inactive'].includes(status)) {
      return NextResponse.json({ success: false, message: 'Invalid advert update payload' }, { status: 400 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ success: false, message: 'Firebase admin unavailable' }, { status: 500 })
    }

    await dbAdmin.collection('homepageDirectAds').doc(id).update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ success: true, message: 'Homepage advert updated successfully' })
  } catch (error) {
    console.error('Homepage direct advert update error:', error)
    return NextResponse.json({ success: false, message: 'Failed to update homepage advert' }, { status: 500 })
  }
}
