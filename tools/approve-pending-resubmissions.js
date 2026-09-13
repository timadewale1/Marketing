const admin = require('firebase-admin')
const fs = require('fs')
const path = require('path')

function loadServiceAccount() {
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
  const match = env.match(/^FIREBASE_SERVICE_ACCOUNT_KEY=(.*(?:\r?\n(?![A-Z_0-9]+=).*)*)$/m)
  if (!match) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is missing from .env')
  return JSON.parse(match[1].trim())
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(loadServiceAccount()),
    databaseURL: 'https://blessing-636ca.firebaseio.com',
  })
}

const db = admin.firestore()
const APPLY = process.argv.includes('--apply')
const PAYOUT_RATE = 0.6
const TERMINAL_CAMPAIGN_STATES = new Set(['Deleted', 'Stopped', 'Expired'])

function amount(value) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

function ownerRefs(ownerId) {
  return [
    { collection: 'advertisers', transactions: 'advertiserTransactions' },
    { collection: 'vendors', transactions: 'vendorTransactions' },
  ].map((entry) => ({ ...entry, ref: db.collection(entry.collection).doc(ownerId) }))
}

async function listCandidates() {
  const snap = await db.collection('earnerSubmissions')
    .where('resubmissionStatus', '==', 'submitted')
    .get()

  return snap.docs.filter((doc) => {
    const data = doc.data()
    return String(data.status || '') === 'Pending' &&
      ['pending', 'resubmission_requested'].includes(String(data.advertiserDecisionStatus || '').toLowerCase())
  })
}

async function approveSubmission(submissionRef) {
  return db.runTransaction(async (transaction) => {
    const submissionSnap = await transaction.get(submissionRef)
    if (!submissionSnap.exists) return { status: 'missing' }

    const submission = submissionSnap.data()
    if (String(submission.status || '') !== 'Pending' ||
        String(submission.resubmissionStatus || '').toLowerCase() !== 'submitted') {
      return { status: 'already_processed' }
    }

    const campaignId = String(submission.campaignId || '')
    const userId = String(submission.userId || '')
    const ownerId = String(submission.advertiserId || '')
    if (!campaignId || !userId || !ownerId) return { status: 'invalid' }

    const campaignRef = db.collection('campaigns').doc(campaignId)
    const earnerRef = db.collection('earners').doc(userId)
    const [campaignSnap, earnerSnap, advertiserSnap, vendorSnap] = await Promise.all([
      transaction.get(campaignRef),
      transaction.get(earnerRef),
      transaction.get(db.collection('advertisers').doc(ownerId)),
      transaction.get(db.collection('vendors').doc(ownerId)),
    ])

    if (!campaignSnap.exists || !earnerSnap.exists) return { status: 'missing_dependency' }
    const campaign = campaignSnap.data()
    const campaignStatus = String(campaign.status || '')
    const reservedAmount = amount(submission.reservedAmount)
    const backedExpiredResubmission = campaignStatus === 'Expired' && amount(campaign.reservedBudget) >= reservedAmount
    if (TERMINAL_CAMPAIGN_STATES.has(campaignStatus) && !backedExpiredResubmission) return { status: 'terminal_campaign' }

    const owner = advertiserSnap.exists
      ? { ref: db.collection('advertisers').doc(ownerId), transactions: 'advertiserTransactions' }
      : vendorSnap.exists
        ? { ref: db.collection('vendors').doc(ownerId), transactions: 'vendorTransactions' }
        : null
    if (!owner) return { status: 'missing_owner' }

    const costPerLead = amount(campaign.costPerLead)
    const earnerAmount = amount(submission.earnerPrice) || Math.round(costPerLead * PAYOUT_RATE)
    const fullAmount = reservedAmount || costPerLead || Math.round(earnerAmount / PAYOUT_RATE)
    if (earnerAmount <= 0 || fullAmount <= 0) return { status: 'invalid_amount' }

    const campaignBudget = amount(campaign.budget)
    const campaignReservedBudget = amount(campaign.reservedBudget)
    const reservationShortage = Math.max(0, reservedAmount - campaignReservedBudget)
    const budgetToConsume = Math.min(campaignBudget, reservationShortage)
    const remainingToCover = Math.max(0, reservationShortage - budgetToConsume)
    const ownerBalance = amount((advertiserSnap.exists ? advertiserSnap.data() : vendorSnap.data()).balance)
    if (remainingToCover > ownerBalance) return { status: 'insufficient_owner_balance', remainingToCover }

    const now = admin.firestore.FieldValue.serverTimestamp()
    const campaignUpdates = {
      generatedLeads: admin.firestore.FieldValue.increment(1),
      completedLeads: admin.firestore.FieldValue.increment(1),
      dailySubmissionCount: admin.firestore.FieldValue.increment(1),
      lastLeadAt: now,
      lastUpdated: now,
    }
    if (reservedAmount > 0) {
      campaignUpdates.reservedBudget = admin.firestore.FieldValue.increment(-reservedAmount + reservationShortage)
    }
    if (budgetToConsume > 0) campaignUpdates.budget = admin.firestore.FieldValue.increment(-budgetToConsume)
    if (Number(campaign.estimatedLeads || 0) > 0 && Number(campaign.generatedLeads || 0) + 1 >= Number(campaign.estimatedLeads)) {
      campaignUpdates.status = 'Completed'
    }

    transaction.update(submissionRef, {
      status: 'Verified',
      reviewedAt: now,
      reviewedBy: 'manual-resubmission-approval-script',
      rejectionReason: null,
      advertiserDecisionStatus: 'auto_verified',
      advertiserDecisionReason: null,
      advertiserDecisionAt: now,
      advertiserDecisionBy: 'manual-resubmission-approval-script',
      advertiserDecisionSource: 'manual_resubmission_approval_script',
      finalDecisionAt: now,
      finalDecisionBy: 'manual-resubmission-approval-script',
      finalDecisionSource: 'manual_resubmission_approval_script',
      resubmissionStatus: 'approved',
      autoVerified: true,
      autoVerifiedReason: 'manual_pending_resubmission_approval',
      updatedAt: now,
    })
    transaction.update(campaignRef, campaignUpdates)
    transaction.update(earnerRef, {
      balance: admin.firestore.FieldValue.increment(earnerAmount),
      leadsPaidFor: admin.firestore.FieldValue.increment(1),
      totalEarned: admin.firestore.FieldValue.increment(earnerAmount),
      lastEarnedAt: now,
    })
    if (remainingToCover > 0) {
      transaction.update(owner.ref, {
        balance: admin.firestore.FieldValue.increment(-remainingToCover),
      })
    }

    transaction.set(db.collection('earnerTransactions').doc(`resubmission-approval-${submissionRef.id}`), {
      userId,
      campaignId,
      type: 'credit',
      amount: earnerAmount,
      status: 'completed',
      note: `Payment for resubmission ${submission.campaignTitle || campaign.title || ''}`,
      reference: submissionRef.id,
      createdAt: now,
    })
    transaction.set(db.collection(owner.transactions).doc(`resubmission-debit-${submissionRef.id}`), {
      userId: ownerId,
      campaignId,
      type: 'debit',
      amount: fullAmount,
      status: 'completed',
      note: `Payment for approved resubmission ${submission.campaignTitle || campaign.title || ''}`,
      reference: submissionRef.id,
      createdAt: now,
    })

    return { status: 'approved', submissionId: submissionRef.id, earnerAmount, fullAmount }
  })
}

async function main() {
  const candidates = await listCandidates()
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: found ${candidates.length} submitted pending resubmissions`)

  if (!APPLY) {
    for (const doc of candidates) {
      const data = doc.data()
      console.log(JSON.stringify({
        submissionId: doc.id,
        userId: data.userId,
        campaignId: data.campaignId,
        reservedAmount: data.reservedAmount || 0,
        resubmissionDueAt: data.resubmissionDueAt || null,
      }))
    }
    console.log('No data changed. Re-run with --apply after reviewing the candidates.')
    return
  }

  const summary = {}
  for (const doc of candidates) {
    try {
      const result = await approveSubmission(doc.ref)
      summary[result.status] = (summary[result.status] || 0) + 1
      console.log(JSON.stringify(result))
    } catch (error) {
      summary.failed = (summary.failed || 0) + 1
      console.error(JSON.stringify({ submissionId: doc.id, status: 'failed', error: String(error) }))
    }
  }
  console.log(JSON.stringify({ summary }))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
