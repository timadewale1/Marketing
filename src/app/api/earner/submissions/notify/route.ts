import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: 'Missing Authorization token' }, { status: 401 })
    }

    const idToken = authHeader.slice('Bearer '.length)
    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })
    }

    const decoded = await admin.auth().verifyIdToken(idToken)
    const body = await req.json()
    const { campaignId, campaignTitle, submissionId } = body || {}

    if (!campaignId || !submissionId) {
      return NextResponse.json({ success: false, message: 'Missing submission metadata' }, { status: 400 })
    }

    await dbAdmin.collection('adminNotifications').doc().set({
      type: 'submission_created',
      title: 'New task submission',
      body: `${String(campaignTitle || 'A campaign')} has a new submission from ${decoded.uid}`,
      link: '/admin/submissions',
      userId: decoded.uid,
      submissionId: String(submissionId),
      campaignId: String(campaignId),
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Submission notification error:', err)
    return NextResponse.json({ success: false, message: 'Failed to notify admin' }, { status: 500 })
  }
}
