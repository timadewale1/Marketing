/*
One-off enforcement + cleanup for a specific campaign owner.

Usage:
  node tools/enforce-campaign-owner-ban.js <ownerUid>

What it does:
1) Verifies all pending submissions for the owner's ACTIVE campaigns.
2) Deletes all owner's ACTIVE campaigns and refunds only non-reserved budget.
3) Blocks the owner from creating tasks (wallet/bills remain unchanged).
4) Prints a summary.
*/

async function initFirebaseAdmin() {
  const adminModule = await import('firebase-admin')
  const admin = adminModule && (adminModule.default || adminModule)

  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT
    if (!raw) {
      throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY/FIREBASE_SERVICE_ACCOUNT in environment')
    }
    const sa = JSON.parse(raw)
    admin.initializeApp({ credential: admin.credential.cert(sa) })
  }
  return { admin, db: admin.firestore() }
}

function num(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

async function verifyPendingSubmission({ admin, db, submissionRef, campaignRef, ownerRef, ownerTxCollection }) {
  await db.runTransaction(async (t) => {
    const [submissionSnap, campaignSnap, ownerSnap] = await Promise.all([
      t.get(submissionRef),
      t.get(campaignRef),
      t.get(ownerRef),
    ])
    if (!submissionSnap.exists || !campaignSnap.exists || !ownerSnap.exists) return

    const submission = submissionSnap.data() || {}
    if (String(submission.status || '').toLowerCase() !== 'pending') return

    const campaign = campaignSnap.data() || {}
    const userId = String(submission.userId || '').trim()
    if (!userId) return

    const earnerRef = db.collection('earners').doc(userId)
    const earnerSnap = await t.get(earnerRef)
    if (!earnerSnap.exists) return

    const reservedAmount = Math.max(0, num(submission.reservedAmount, 0))
    const earnerAmount = Math.max(0, num(submission.earnerPrice, Math.floor(reservedAmount * 0.6)))
    const chargeAmount = reservedAmount > 0 ? reservedAmount : Math.max(earnerAmount, num(campaign.costPerLead, earnerAmount))
    const now = admin.firestore.FieldValue.serverTimestamp()
    const nowDate = new Date()

    t.update(submissionRef, {
      status: 'Verified',
      reviewedAt: nowDate,
      reviewedBy: 'admin-cleanup',
      finalDecisionAt: nowDate,
      finalDecisionBy: 'admin-cleanup',
      finalDecisionSource: 'admin',
      updatedAt: nowDate,
      proofCleanupStatus: 'scheduled',
      proofCleanupEligibleAt: nowDate,
      rejectionReason: null,
    })

    const estimatedLeads = num(campaign.estimatedLeads, 0)
    const generatedLeads = num(campaign.generatedLeads, 0) + 1
    const completionRate = estimatedLeads > 0 ? (generatedLeads / estimatedLeads) * 100 : 0
    const campaignUpdates = {
      generatedLeads: admin.firestore.FieldValue.increment(1),
      completedLeads: admin.firestore.FieldValue.increment(1),
      reservedBudget: admin.firestore.FieldValue.increment(-reservedAmount),
      completionRate,
      lastLeadAt: nowDate,
      lastUpdated: nowDate,
      ...(completionRate >= 100 && String(campaign.status || '') !== 'Deleted' ? { status: 'Completed' } : {}),
    }
    t.update(campaignRef, campaignUpdates)

    const earnerTxRef = db.collection('earnerTransactions').doc()
    t.set(earnerTxRef, {
      userId,
      campaignId: submission.campaignId || campaignRef.id,
      type: 'credit',
      amount: earnerAmount,
      status: 'completed',
      note: `Payment for ${submission.campaignTitle || campaign.title || 'task participation'}`,
      createdAt: now,
    })

    t.update(earnerRef, {
      balance: admin.firestore.FieldValue.increment(earnerAmount),
      totalEarned: admin.firestore.FieldValue.increment(earnerAmount),
      leadsPaidFor: admin.firestore.FieldValue.increment(1),
      lastEarnedAt: nowDate,
    })

    const ownerTxRef = db.collection(ownerTxCollection).doc()
    t.set(ownerTxRef, {
      userId: ownerRef.id,
      campaignId: submission.campaignId || campaignRef.id,
      type: 'debit',
      amount: chargeAmount,
      status: 'completed',
      note: `Payment for lead in ${submission.campaignTitle || campaign.title || 'campaign'}`,
      createdAt: now,
    })

    t.update(ownerRef, {
      totalSpent: admin.firestore.FieldValue.increment(chargeAmount),
      leadsGenerated: admin.firestore.FieldValue.increment(1),
      lastLeadAt: nowDate,
    })
  })
}

async function run() {
  const ownerUid = String(process.argv[2] || '').trim()
  if (!ownerUid) {
    throw new Error('Usage: node tools/enforce-campaign-owner-ban.js <ownerUid>')
  }

  const { admin, db } = await initFirebaseAdmin()

  const advertiserRef = db.collection('advertisers').doc(ownerUid)
  const vendorRef = db.collection('vendors').doc(ownerUid)
  const [advertiserSnap, vendorSnap] = await Promise.all([advertiserRef.get(), vendorRef.get()])

  const ownerRef = advertiserSnap.exists ? advertiserRef : (vendorSnap.exists ? vendorRef : null)
  const ownerType = advertiserSnap.exists ? 'advertiser' : (vendorSnap.exists ? 'vendor' : null)
  const ownerTxCollection = ownerType === 'advertiser' ? 'advertiserTransactions' : ownerType === 'vendor' ? 'vendorTransactions' : null

  if (!ownerRef || !ownerTxCollection || !ownerType) {
    throw new Error(`Owner ${ownerUid} was not found in advertisers/vendors`)
  }

  const campaignsSnap = await db.collection('campaigns').where('ownerId', '==', ownerUid).get()
  const campaigns = campaignsSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} }))
  const activeCampaigns = campaigns.filter((item) => String(item.data.status || '').toLowerCase() === 'active')

  let verifiedSubmissions = 0
  let deletedCampaigns = 0
  let totalRefund = 0
  const campaignAudit = []

  for (const campaign of activeCampaigns) {
    const campaignRef = db.collection('campaigns').doc(campaign.id)
    const pendingSnap = await db
      .collection('earnerSubmissions')
      .where('campaignId', '==', campaign.id)
      .where('status', '==', 'Pending')
      .get()

    for (const submissionDoc of pendingSnap.docs) {
      await verifyPendingSubmission({
        admin,
        db,
        submissionRef: submissionDoc.ref,
        campaignRef,
        ownerRef,
        ownerTxCollection,
      })
      verifiedSubmissions += 1
    }

    await db.runTransaction(async (t) => {
      const [campaignSnapFresh, ownerSnapFresh] = await Promise.all([t.get(campaignRef), t.get(ownerRef)])
      if (!campaignSnapFresh.exists || !ownerSnapFresh.exists) return
      const c = campaignSnapFresh.data() || {}
      if (String(c.status || '').toLowerCase() === 'deleted') return

      const pendingAfterSnap = await t.get(
        db.collection('earnerSubmissions')
          .where('campaignId', '==', campaign.id)
          .where('status', '==', 'Pending')
      )
      const pendingReservedAmount = pendingAfterSnap.docs.reduce((sum, s) => sum + Math.max(0, num(s.data()?.reservedAmount, 0)), 0)
      const existingReserved = Math.max(0, num(c.reservedBudget, 0))
      const safeReserved = Math.max(existingReserved, pendingReservedAmount)
      const refundAmount = Math.max(0, num(c.budget, 0))

      t.update(campaignRef, {
        status: 'Deleted',
        budget: 0,
        reservedBudget: safeReserved,
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        deletedBy: 'admin-cleanup',
      })

      if (refundAmount > 0) {
        t.update(ownerRef, {
          balance: admin.firestore.FieldValue.increment(refundAmount),
        })
        const refundTxRef = db.collection(ownerTxCollection).doc()
        t.set(refundTxRef, {
          userId: ownerUid,
          campaignId: campaign.id,
          type: 'refund',
          amount: refundAmount,
          status: 'completed',
          note: `Refund from removed campaign: ${String(c.title || campaign.id)}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      }
    })

    totalRefund += Math.max(0, num(campaign.data.budget, 0))
    deletedCampaigns += 1
    campaignAudit.push({
      campaignId: campaign.id,
      title: String(campaign.data.title || ''),
      refunded: Math.max(0, num(campaign.data.budget, 0)),
      hadPendingSubmissions: pendingSnap.size > 0,
      pendingCount: pendingSnap.size,
    })
  }

  await ownerRef.set({
    taskCreationBlocked: true,
    taskCreationBlockReason: 'Your account has been banned from creating tasks because previous tasks did not align with platform standards. You can still use wallet features for bills and withdrawals.',
    taskCreationBlockedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true })

  console.log(JSON.stringify({
    success: true,
    ownerUid,
    ownerType,
    campaignCount: campaigns.length,
    activeCampaignCount: activeCampaigns.length,
    deletedCampaigns,
    verifiedSubmissions,
    totalRefund,
    campaignAudit,
  }, null, 2))
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})

