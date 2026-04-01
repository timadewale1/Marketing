import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { requireAdminSession } from '@/lib/admin-session'
import { sendDirectAdvertAcceptedEmail } from '@/lib/mailer'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSession()
    const { id } = await params
    const body = await req.json()
    const status = String(body?.status || '').trim().toLowerCase()

    if (!id || !['approved', 'rejected', 'pending'].includes(status)) {
      return NextResponse.json({ success: false, message: 'Invalid request update' }, { status: 400 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ success: false, message: 'Firebase admin unavailable' }, { status: 500 })
    }

    const requestRef = dbAdmin.collection('directAdvertRequests').doc(id)
    const requestSnap = await requestRef.get()
    if (!requestSnap.exists) {
      return NextResponse.json({ success: false, message: 'Request not found' }, { status: 404 })
    }

    const requestData = requestSnap.data() as {
      businessName?: string
      contactName?: string
      email?: string
      status?: string
    }

    await requestRef.update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    if (status === 'approved' && requestData?.email) {
      sendDirectAdvertAcceptedEmail({
        businessName: String(requestData.businessName || 'your business'),
        contactName: requestData.contactName || null,
        email: String(requestData.email),
      }).catch((error) => {
        console.error('Direct advert approval email failed:', error)
      })
    }

    return NextResponse.json({ success: true, message: 'Request updated successfully' })
  } catch (error) {
    console.error('Direct advert request update error:', error)
    return NextResponse.json({ success: false, message: 'Failed to update request' }, { status: 500 })
  }
}
