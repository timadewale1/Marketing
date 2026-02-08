import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, email, message } = body

    // Validation
    if (!name || !email || !message) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, message: 'Invalid email format' },
        { status: 400 }
      )
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin || !admin) {
      return NextResponse.json(
        { success: false, message: 'Server admin unavailable' },
        { status: 500 }
      )
    }

    const adminDb = dbAdmin as import('firebase-admin').firestore.Firestore

    // Store message in Firestore
    const contactRef = adminDb.collection('contactMessages').doc()
    await contactRef.set({
      id: contactRef.id,
      name,
      email,
      message,
      status: 'unread',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    // Create admin notification
    const adminNotificationRef = adminDb.collection('adminNotifications').doc()
    await adminNotificationRef.set({
      id: adminNotificationRef.id,
      type: 'contact_message',
      title: `New contact message from ${name}`,
      description: `${email} sent: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`,
      read: false,
      relatedId: contactRef.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    return NextResponse.json(
      { success: true, message: 'Message saved successfully', id: contactRef.id },
      { status: 200 }
    )
  } catch (err) {
    console.error('Contact message error', err)
    return NextResponse.json(
      { success: false, message: String(err) },
      { status: 500 }
    )
  }
}
