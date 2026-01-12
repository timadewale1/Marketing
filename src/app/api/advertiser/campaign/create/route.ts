import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { campaignData } = body

    if (!campaignData || typeof campaignData !== 'object') {
      return NextResponse.json({ success: false, message: 'Missing campaign data' }, { status: 400 })
    }

    // Verify Firebase ID token from Authorization header
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: 'Missing Authorization token' }, { status: 401 })
    }
    const idToken = authHeader.split('Bearer ')[1]

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin || !admin) return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })

    const db = dbAdmin as import('firebase-admin').firestore.Firestore

    // Verify ID token
    let verifiedUid: string
    try {
      const decoded = await admin.auth().verifyIdToken(idToken)
      verifiedUid = decoded.uid
    } catch (err) {
      console.error('Invalid ID token', err)
      return NextResponse.json({ success: false, message: 'Invalid ID token' }, { status: 401 })
    }

    const budget = Number(campaignData.budget || 0)
    if (!budget || budget <= 0) {
      return NextResponse.json({ success: false, message: 'Invalid campaign budget' }, { status: 400 })
    }

    const advertiserRef = db.collection('advertisers').doc(verifiedUid)
    const advertiserSnap = await advertiserRef.get()
    if (!advertiserSnap.exists) return NextResponse.json({ success: false, message: 'Advertiser not found' }, { status: 404 })

    // Run transaction: create campaign, deduct balance, record transaction
    await db.runTransaction(async (t) => {
      const advSnap = await t.get(advertiserRef)
      const currentBal = Number(advSnap.data()?.balance || 0)
      if (currentBal < budget) throw new Error('Insufficient balance')

      // Prepare campaign doc ref
      const campaignRef = db.collection('campaigns').doc()

      // Preserve original budget as the advertiser-entered total so advertiser views
      // always show the original task amount (originalBudget). Also initialize reservedBudget.
      t.set(campaignRef, {
        ...campaignData,
        ownerId: verifiedUid,
        status: 'Active',
        originalBudget: budget,
        reservedBudget: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      // Deduct advertiser balance
      t.update(advertiserRef, {
        balance: admin.firestore.FieldValue.increment(-budget),
        campaignsCreated: admin.firestore.FieldValue.increment(1),
      })

      // Log transaction
      const txRef = db.collection('advertiserTransactions').doc()
      t.set(txRef, {
        userId: verifiedUid,
        type: 'campaign_payment',
        amount: -budget,
        campaignId: campaignRef.id,
        campaignTitle: String(campaignData.title || ''),
        status: 'completed',
        note: 'Budget allocated for campaign',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      // Notify admin of new campaign created
      const noteRef = db.collection('adminNotifications').doc()
      t.set(noteRef, {
        type: 'campaign_created',
        title: 'New campaign created',
        body: `${String(campaignData.title || 'Untitled')} was created by advertiser ${verifiedUid}`,
        link: `/admin/campaigns/${campaignRef.id}`,
        userId: verifiedUid,
        campaignId: campaignRef.id,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    })

    return NextResponse.json({ success: true, message: 'Campaign created using wallet funds' })
  } catch (err) {
    console.error('Campaign create error', err)
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Insufficient balance' ? 402 : 500
    return NextResponse.json({ success: false, message: msg }, { status })
  }
}
