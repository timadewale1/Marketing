import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { sendNewTaskNotificationToEarners } from '@/lib/mailer'
import { notifyAdminOfTaskCreated } from '@/lib/task-admin-alerts'
import { HIGH_VALUE_TASK_POINTS, HIGH_VALUE_TASK_THRESHOLD, awardPointsInTransaction, getPointsEventId } from '@/lib/points'
import { awardAdvertiserFirstTaskReferralBonusInTransaction } from '@/lib/paymentProcessing'
import { computeEarnerPayout } from '@/lib/task-pricing'

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
    const category = String(campaignData.category || '')
    const externalLink = String(campaignData.externalLink || '').trim()
    const mediaUrl = String(campaignData.mediaUrl || '').trim()
    if (!budget || budget <= 0) {
      return NextResponse.json({ success: false, message: 'Invalid campaign budget' }, { status: 400 })
    }
    if (category === 'Social media live task' && !externalLink && !mediaUrl) {
      return NextResponse.json({
        success: false,
        message: 'For Social media live task, add at least a link or an image.',
      }, { status: 400 })
    }
    const baseCostPerLead = Number(campaignData.baseCostPerLead || campaignData.costPerLead || 0)
    const priorityMultiplierRaw = Number(campaignData.priorityMultiplier || 1)
    const priorityMultiplier = Number.isFinite(priorityMultiplierRaw)
      ? Math.max(1, Math.min(10, Math.round(priorityMultiplierRaw)))
      : 1
    const priorityEnabled = Boolean(campaignData.priorityEnabled) && priorityMultiplier > 1
    
    // Handle custom cost per lead if provided
    let costPerLead = Number(campaignData.costPerLead || 0) || baseCostPerLead * priorityMultiplier
    const customCostPerLeadRaw = Number(campaignData.customCostPerLead || 0)
    if (priorityEnabled && customCostPerLeadRaw > 0) {
      if (customCostPerLeadRaw < baseCostPerLead) {
        return NextResponse.json({ 
          success: false, 
          message: `Custom price per lead cannot be lower than ₦${baseCostPerLead.toLocaleString()}` 
        }, { status: 400 })
      }
      costPerLead = customCostPerLeadRaw
    }
    
    if (baseCostPerLead <= 0) {
      return NextResponse.json({ success: false, message: 'Invalid task amount' }, { status: 400 })
    }
    if (priorityEnabled && priorityMultiplier > 10 && !customCostPerLeadRaw) {
      return NextResponse.json({ success: false, message: 'Priority can only go up to 10x the base task amount' }, { status: 400 })
    }
    if (!customCostPerLeadRaw && costPerLead !== baseCostPerLead * priorityMultiplier) {
      return NextResponse.json({ success: false, message: 'Priority pricing is invalid' }, { status: 400 })
    }
    if (costPerLead > 0 && budget < costPerLead) {
      return NextResponse.json({ success: false, message: `Budget cannot be less than ₦${costPerLead.toLocaleString()} for this task type` }, { status: 400 })
    }
    if (costPerLead > 0 && budget % costPerLead !== 0) {
      return NextResponse.json({
        success: false,
        message: `Budget must be in exact multiples of â‚¦${costPerLead.toLocaleString()} for this task type`,
      }, { status: 400 })
    }

    const advertiserRef = db.collection('advertisers').doc(verifiedUid)
    const vendorRef = db.collection('vendors').doc(verifiedUid)
    const [advertiserSnap, vendorSnap] = await Promise.all([advertiserRef.get(), vendorRef.get()])
    const isVendor = vendorSnap.exists && !advertiserSnap.exists
    const ownerCollection = advertiserSnap.exists ? 'advertisers' : isVendor ? 'vendors' : null
    if (!ownerCollection) {
      return NextResponse.json({ success: false, message: 'Account not found for task creation' }, { status: 404 })
    }
    const ownerRef = ownerCollection === 'advertisers' ? advertiserRef : vendorRef
    const ownerSnap = ownerCollection === 'advertisers' ? advertiserSnap : vendorSnap

    let createdCampaignId = ''
    const advertiserData = ownerSnap.data() || {}
    if (ownerCollection === 'advertisers') {
      const taskCreationBlocked = Boolean(advertiserData.taskCreationBlocked)
      if (taskCreationBlocked) {
        return NextResponse.json({
          success: false,
          message: String(advertiserData.taskCreationBlockReason || 'Your account is restricted from creating tasks.'),
        }, { status: 403 })
      }
    }
    if (ownerCollection === 'vendors') {
      const verificationStatus = String(advertiserData.vendorVerificationStatus || '').toLowerCase()
      const setupPaid = String(advertiserData.vendorPaymentStatus || '').toLowerCase() === 'paid'
      const isVerified = verificationStatus === 'verified' || verificationStatus === 'approved'
      if (!isVerified || !setupPaid) {
        return NextResponse.json({
          success: false,
          message: 'Vendor account must be verified and setup fee must be paid before creating tasks.',
        }, { status: 403 })
      }
    }
    const advertiserName = String(
      advertiserData.fullName ||
      advertiserData.businessName ||
      advertiserData.name ||
      advertiserData.companyName ||
      advertiserData.email ||
      verifiedUid
    ).trim()
    const campaignTitle = String(campaignData.title || 'Untitled')
    const availableSlots = Number(campaignData.estimatedLeads || campaignData.targetLeads || 0)
    const taskDurationValue = Number(campaignData.taskDurationValue || 0)
    const taskDurationUnit = String(campaignData.taskDurationUnit || '').toLowerCase() === 'days' ? 'days' : 'hours'

    // Run transaction: create campaign, deduct balance, record transaction
    await db.runTransaction(async (t) => {
      const advSnap = await t.get(ownerRef)
      const currentBal = Number(advSnap.data()?.balance || 0)
      if (currentBal < budget) throw new Error('Insufficient balance')

      // Prepare campaign doc ref
      const campaignRef = db.collection('campaigns').doc()
      createdCampaignId = campaignRef.id

      if (ownerCollection === 'advertisers' && budget >= HIGH_VALUE_TASK_THRESHOLD) {
        await awardPointsInTransaction({
          adminDb: db,
          admin,
          transaction: t,
          userCollection: 'advertisers',
          userId: verifiedUid,
          amount: HIGH_VALUE_TASK_POINTS,
          eventId: getPointsEventId('campaign-created-high-value', campaignRef.id),
          type: 'high_value_campaign_created',
          note: `Bonus for creating a high-value task with a budget of â‚¦${budget.toLocaleString()}`,
          referenceId: campaignRef.id,
          extraUserUpdates: {
            pointsHighValueTaskCount: admin.firestore.FieldValue.increment(1),
            pointsLastHighValueTaskAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          extraLedgerData: {
            campaignId: campaignRef.id,
            campaignBudget: budget,
          },
        })
      }

      if (ownerCollection === 'advertisers') {
        try {
          await awardAdvertiserFirstTaskReferralBonusInTransaction(
            db,
            admin,
            t,
            verifiedUid,
            campaignRef.id,
            budget,
            campaignTitle
          )
        } catch (bonusError) {
          console.warn('[campaign-create] advertiser referral bonus skipped after non-fatal error:', bonusError)
        }
      }

      // Preserve original budget as the advertiser-entered total so advertiser views
      // always show the original task amount (originalBudget). Also initialize reservedBudget.
      t.set(campaignRef, {
        ...campaignData,
        ownerType: ownerCollection === 'advertisers' ? 'advertiser' : 'vendor',
        baseCostPerLead,
        priorityEnabled,
        priorityMultiplier,
        costPerLead,
        earnerPrice: computeEarnerPayout(costPerLead),
        ownerId: verifiedUid,
        status: 'Active',
        originalBudget: budget,
        reservedBudget: 0,
        taskDurationValue: taskDurationValue > 0 ? taskDurationValue : null,
        taskDurationUnit: taskDurationValue > 0 ? taskDurationUnit : null,
        expiresAt:
          taskDurationValue > 0
            ? admin.firestore.Timestamp.fromMillis(
                Date.now() + taskDurationValue * (taskDurationUnit === 'days' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000)
              )
            : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      // Deduct advertiser balance
      t.update(ownerRef, {
        balance: admin.firestore.FieldValue.increment(-budget),
        campaignsCreated: admin.firestore.FieldValue.increment(1),
      })

      // Log transaction
      const txRef = db.collection(ownerCollection === 'advertisers' ? 'advertiserTransactions' : 'vendorTransactions').doc()
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
    })

    if (createdCampaignId) {
      await notifyAdminOfTaskCreated({
        advertiserId: verifiedUid,
        advertiserName,
        campaignId: createdCampaignId,
        campaignTitle,
      }).catch((error) => {
        console.error('Task creation admin alert failed:', error)
      })

      await sendNewTaskNotificationToEarners({
        campaignId: createdCampaignId,
        campaignTitle,
        availableSlots,
      }).catch((mailerErr) => {
        console.error('New task notification failed:', mailerErr)
      })
    }

    return NextResponse.json({ success: true, message: 'Campaign created using wallet funds' })
  } catch (err) {
    console.error('Campaign create error', err)
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Insufficient balance' ? 402 : 500
    return NextResponse.json({ success: false, message: msg }, { status })
  }
}
