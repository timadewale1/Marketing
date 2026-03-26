import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { sendDirectAdvertRequestEmail } from '@/lib/mailer'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      businessName,
      contactName,
      email,
      phone,
      advertType,
      duration,
      message,
    } = body as {
      businessName?: string
      contactName?: string
      email?: string
      phone?: string
      advertType?: string
      duration?: string
      message?: string
    }

    if (!businessName?.trim() || !contactName?.trim() || !email?.trim() || !phone?.trim()) {
      return NextResponse.json(
        { success: false, message: 'Business name, contact name, email, and phone are required' },
        { status: 400 }
      )
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json(
        { success: false, message: 'Server admin unavailable' },
        { status: 500 }
      )
    }

    const requestRef = dbAdmin.collection('directAdvertRequests').doc()
    const now = admin.firestore.FieldValue.serverTimestamp()

    await requestRef.set({
      id: requestRef.id,
      businessName: businessName.trim(),
      contactName: contactName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      advertType: advertType?.trim() || null,
      duration: duration?.trim() || null,
      message: message?.trim() || null,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    })

    await dbAdmin.collection('adminNotifications').doc().set({
      type: 'direct_ad_request',
      title: 'New direct advert request',
      body: `${businessName.trim()} submitted a direct advert request`,
      link: `/admin/direct-ad-requests/${requestRef.id}`,
      requestId: requestRef.id,
      read: false,
      createdAt: now,
    })

    sendDirectAdvertRequestEmail({
      businessName: businessName.trim(),
      contactName: contactName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      advertType: advertType?.trim() || null,
      duration: duration?.trim() || null,
      message: message?.trim() || null,
    }).catch((error) => {
      console.error('Direct advert request email failed:', error)
    })

    return NextResponse.json({
      success: true,
      id: requestRef.id,
      message: 'Direct advert request submitted successfully',
    })
  } catch (error) {
    console.error('Direct advert request error:', error)
    return NextResponse.json(
      { success: false, message: 'Failed to submit direct advert request' },
      { status: 500 }
    )
  }
}
