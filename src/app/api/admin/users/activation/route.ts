import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/admin-session"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { getActivationAttemptDocId } from "@/lib/activation-attempts"
import { processPendingActivationReferrals } from "@/lib/paymentProcessing"
import { applyRecoveryAwareDebitInTransaction } from "@/lib/balance-recovery"
import type { FirebaseAdminCompat } from "@/lib/firebase-admin-compat"
import { computeAdvertiserCharge, computeEarnerPayout } from "@/lib/task-pricing"

type UserRole = "earner" | "advertiser"

type SubmissionRecord = {
  status?: string
  earnerPrice?: number | string
  campaignId?: string
  userId?: string
  advertiserId?: string
  campaignTitle?: string
  reservedAmount?: number | string
}

type CampaignRecord = {
  budget?: number | string
  costPerLead?: number | string
  reservedBudget?: number | string
  generatedLeads?: number | string
  estimatedLeads?: number | string
  ownerId?: string
  status?: string
}

async function reverseReferralBonusesForUser(
  dbAdmin: FirebaseFirestore.Firestore,
  admin: FirebaseAdminCompat,
  userId: string
) {
  const refsSnap = await dbAdmin
    .collection("referrals")
    .where("referredId", "==", userId)
    .where("bonusPaid", "==", true)
    .get()

  for (const rDoc of refsSnap.docs) {
    const r = rDoc.data()
    const bonus = Number(r.amount || 0)
    const referrerId = String(r.referrerId || "")

    await dbAdmin.runTransaction(async (t) => {
      const referralRef = dbAdmin.collection("referrals").doc(rDoc.id)
      const snap = await t.get(referralRef)
      if (!snap.exists) return
      const data = snap.data() || {}
      if (!data.bonusPaid) return

      const advRef = dbAdmin.collection("advertisers").doc(referrerId)
      const earnerRef = dbAdmin.collection("earners").doc(referrerId)
      const [advSnap, earnerSnap] = await Promise.all([t.get(advRef), t.get(earnerRef)])
      const userCollection = advSnap.exists ? "advertisers" : earnerSnap.exists ? "earners" : null
      if (!userCollection) return

      if (bonus > 0 && referrerId) {
        await applyRecoveryAwareDebitInTransaction({
          adminDb: dbAdmin,
          admin,
          transaction: t,
          userCollection,
          userId: referrerId,
          amount: bonus,
          transactionCollection: userCollection === "advertisers" ? "advertiserTransactions" : "earnerTransactions",
          transactionType: "referral_bonus_reversal",
          recoveryNote: `Reversal of referral bonus for ${userId}`,
          transactionExtras: {
            referralId: rDoc.id,
            reversedForUserId: userId,
          },
        })
      }

      t.update(referralRef, {
        status: "pending",
        bonusPaid: false,
        paidAt: admin.firestore.FieldValue.delete(),
        paidAmount: admin.firestore.FieldValue.delete(),
        completedAt: admin.firestore.FieldValue.delete(),
      })
    })
  }
}

async function reverseSubmissionForDeactivation(
  dbAdmin: FirebaseFirestore.Firestore,
  admin: FirebaseAdminCompat,
  submissionRef: FirebaseFirestore.DocumentReference,
  submission: SubmissionRecord,
  adminUid: string
) {
  const now = new Date()

  await dbAdmin.runTransaction(async (t) => {
    const prevStatus = String(submission.status || "")
    const campaignId = submission.campaignId ? String(submission.campaignId) : ""
    const userId = submission.userId ? String(submission.userId) : ""
    if (!userId) return

    let campaignRef: FirebaseFirestore.DocumentReference | null = null
    let campaignSnap: FirebaseFirestore.DocumentSnapshot | null = null
    let campaign: CampaignRecord | null = null

    if (campaignId) {
      campaignRef = dbAdmin.collection("campaigns").doc(campaignId)
      campaignSnap = await t.get(campaignRef)
      campaign = campaignSnap.exists ? (campaignSnap.data() as CampaignRecord) : null
    }

    const advertiserId = String(submission.advertiserId || campaign?.ownerId || "").trim()
    const earnerRef = dbAdmin.collection("earners").doc(userId)
    const earnerSnap = await t.get(earnerRef)
    const advertiserRef = advertiserId ? dbAdmin.collection("advertisers").doc(advertiserId) : null
    const advertiserSnap = advertiserRef ? await t.get(advertiserRef) : null

    let earnerAmount = Number(submission.earnerPrice || 0)
    let fullAmount = computeAdvertiserCharge(Number(submission.reservedAmount || 0), Number(campaign?.costPerLead || 0), earnerAmount)
    if ((!earnerAmount || earnerAmount === 0) && campaign) {
      const costPerLeadTmp = Number(campaign.costPerLead || 0)
      if (costPerLeadTmp > 0) earnerAmount = computeEarnerPayout(costPerLeadTmp)
      fullAmount = computeAdvertiserCharge(Number(submission.reservedAmount || 0), costPerLeadTmp, earnerAmount)
    }

    t.update(submissionRef, {
      status: "Rejected",
      reviewedAt: now,
      reviewedBy: adminUid,
      rejectionReason: "Activation reversed",
      updatedAt: now,
    })

    if (prevStatus === "Verified") {
      if (earnerSnap.exists && earnerAmount > 0) {
        t.set(dbAdmin.collection("earnerTransactions").doc(), {
          userId,
          campaignId: campaignId || null,
          type: "reversal",
          amount: -earnerAmount,
          status: "completed",
          note: `Reversal for activation invalidation ${String(submission.campaignTitle || "")}`,
          createdAt: now,
        })
        t.update(earnerRef, {
          balance: admin.firestore.FieldValue.increment(-earnerAmount),
          leadsPaidFor: admin.firestore.FieldValue.increment(-1),
          totalEarned: admin.firestore.FieldValue.increment(-earnerAmount),
        })
      }

      if (advertiserRef && advertiserSnap?.exists) {
        t.set(dbAdmin.collection("advertiserTransactions").doc(), {
          userId: advertiserId,
          campaignId: campaignId || null,
          type: "refund",
          amount: fullAmount,
          status: "completed",
          note: `Refund for activation invalidation ${String(submission.campaignTitle || "")}`,
          createdAt: now,
        })
        t.update(advertiserRef, {
          totalSpent: admin.firestore.FieldValue.increment(-fullAmount),
          leadsGenerated: admin.firestore.FieldValue.increment(-1),
        })
      }

      if (campaignRef && campaignSnap?.exists) {
        const reservedAmt = Number(submission.reservedAmount || 0)
        if (reservedAmt > 0) {
          if (campaign?.status === "Deleted") {
            t.update(campaignRef, {
              generatedLeads: admin.firestore.FieldValue.increment(-1),
              reservedBudget: admin.firestore.FieldValue.increment(-reservedAmt),
              completedLeads: admin.firestore.FieldValue.increment(-1),
            })
            if (advertiserRef && advertiserSnap?.exists) {
              t.update(advertiserRef, { balance: admin.firestore.FieldValue.increment(reservedAmt) })
            }
          } else {
            t.update(campaignRef, {
              generatedLeads: admin.firestore.FieldValue.increment(-1),
              reservedBudget: admin.firestore.FieldValue.increment(-reservedAmt),
              budget: admin.firestore.FieldValue.increment(reservedAmt),
              completedLeads: admin.firestore.FieldValue.increment(-1),
            })
          }
        } else {
          if (campaign?.status === "Deleted") {
            t.update(campaignRef, {
              generatedLeads: admin.firestore.FieldValue.increment(-1),
              completedLeads: admin.firestore.FieldValue.increment(-1),
            })
            if (advertiserRef && advertiserSnap?.exists) {
              t.update(advertiserRef, { balance: admin.firestore.FieldValue.increment(fullAmount) })
            }
          } else {
            t.update(campaignRef, {
              generatedLeads: admin.firestore.FieldValue.increment(-1),
              budget: admin.firestore.FieldValue.increment(fullAmount),
              completedLeads: admin.firestore.FieldValue.increment(-1),
            })
          }
        }
      }
      return
    }

    if (campaignRef && campaignSnap?.exists) {
      const reservedAmt = Number(submission.reservedAmount || 0)
      if (reservedAmt > 0) {
        if (campaign?.status === "Deleted") {
          t.update(campaignRef, {
            reservedBudget: admin.firestore.FieldValue.increment(-reservedAmt),
          })
          if (advertiserRef && advertiserSnap?.exists) {
            t.update(advertiserRef, { balance: admin.firestore.FieldValue.increment(reservedAmt) })
          }
        } else {
          t.update(campaignRef, {
            reservedBudget: admin.firestore.FieldValue.increment(-reservedAmt),
            budget: admin.firestore.FieldValue.increment(reservedAmt),
          })
        }
      }
    }
  })
}

async function deleteActivationFeeTransactions(
  dbAdmin: FirebaseFirestore.Firestore,
  role: UserRole,
  userId: string
) {
  const txCollection = role === "earner" ? "earnerTransactions" : "advertiserTransactions"
  const snap = await dbAdmin
    .collection(txCollection)
    .where("userId", "==", userId)
    .where("type", "==", "activation_fee")
    .get()

  for (const doc of snap.docs) {
    await doc.ref.delete()
  }
}

export async function POST(req: Request): Promise<Response> {
  console.log('[AdminActivation] Starting activation endpoint')
  let adminSession: { uid: string; email: string }
  try {
    adminSession = await requireAdminSession()
  } catch {
    console.error('[AdminActivation] Session validation failed')
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || "")
  const userId = String(body?.userId || "")
  if (!userId) {
    return NextResponse.json({ success: false, message: "Missing userId" }, { status: 400 })
  }

  console.log('[AdminActivation] Initializing Firebase...')
  const { dbAdmin, admin } = await initFirebaseAdmin()
  console.log(`[AdminActivation] Firebase init result: admin=${!!admin}, dbAdmin=${!!dbAdmin}`)
  if (!dbAdmin || !admin) {
    console.error('[AdminActivation] Firebase initialization failed')
    return NextResponse.json({ success: false, message: "Firebase not initialized" }, { status: 500 })
  }

  const earnerRef = dbAdmin.collection("earners").doc(userId)
  const earnerSnap = await earnerRef.get()
  const advertiserRef = dbAdmin.collection("advertisers").doc(userId)
  const advertiserSnap = earnerSnap.exists ? null : await advertiserRef.get()

  let role: UserRole | null = null
  let userRef: FirebaseFirestore.DocumentReference | null = null
  let userData: Record<string, unknown> = {}

  if (earnerSnap.exists) {
    role = "earner"
    userRef = earnerRef
    userData = earnerSnap.data() || {}
  } else if (advertiserSnap?.exists) {
    role = "advertiser"
    userRef = advertiserRef
    userData = advertiserSnap.data() || {}
  }

  if (!role || !userRef) {
    return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
  }

  if (action === "activate_user") {
    const now = admin.firestore.FieldValue.serverTimestamp()
    const provider = String(userData.activationPaymentProvider || userData.pendingActivationProvider || "admin_manual")

    const updates: Record<string, unknown> = {
      activated: true,
      activatedAt: now,
      activationPaymentProvider: provider,
      needsReactivation: false,
      pendingActivationReference: admin.firestore.FieldValue.delete(),
      pendingActivationReferences: admin.firestore.FieldValue.delete(),
      pendingActivationProvider: admin.firestore.FieldValue.delete(),
    }

    if (role === "earner") {
      const THREE_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 3
      updates.nextActivationDue = admin.firestore.Timestamp.fromMillis(Date.now() + THREE_MONTHS_MS)
    }

    await userRef.set(updates, { merge: true })
    await processPendingActivationReferrals(dbAdmin, admin, userId)

    const attemptRef = dbAdmin.collection("activationAttempts").doc(getActivationAttemptDocId(role, userId))
    const attemptSnap = await attemptRef.get()
    if (attemptSnap.exists) {
      await attemptRef.set({
        status: "completed",
        completedAt: now,
        provider,
        source: "admin_manual",
      }, { merge: true })
    }

    await dbAdmin.collection("adminNotifications").add({
      type: "activation_manual",
      title: "User activated",
      body: `${String(userData.fullName || userData.businessName || userData.name || userData.companyName || userId)} was manually activated`,
      link: role === "earner" ? `/admin/earners/${userId}` : `/admin/advertisers/${userId}`,
      read: false,
      createdAt: now,
      actor: adminSession.email,
      userId,
    })

    return NextResponse.json({ success: true, message: "User activated" })
  }

  if (action === "deactivate_user") {
    if (userData.activated) {
      await reverseReferralBonusesForUser(dbAdmin, admin, userId)
      await deleteActivationFeeTransactions(dbAdmin, role, userId)
    }

    await userRef.set({
      activated: false,
      activatedAt: admin.firestore.FieldValue.delete(),
      activationPaymentProvider: admin.firestore.FieldValue.delete(),
      activationReference: admin.firestore.FieldValue.delete(),
      activationReferences: admin.firestore.FieldValue.delete(),
      activationAttemptedAt: admin.firestore.FieldValue.delete(),
      pendingActivationReference: admin.firestore.FieldValue.delete(),
      pendingActivationReferences: admin.firestore.FieldValue.delete(),
      pendingActivationProvider: admin.firestore.FieldValue.delete(),
      needsReactivation: false,
      nextActivationDue: admin.firestore.FieldValue.delete(),
    }, { merge: true })

    const attemptRef = dbAdmin.collection("activationAttempts").doc(getActivationAttemptDocId(role, userId))
    const attemptSnap = await attemptRef.get()
    if (attemptSnap.exists) {
      await attemptRef.set({
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        provider: "admin_manual",
        source: "admin_deactivated",
      }, { merge: true })
    }

    await dbAdmin.collection("adminNotifications").add({
      type: "activation_deactivated",
      title: "User deactivated",
      body: `${String(userData.fullName || userData.businessName || userData.name || userData.companyName || userId)} was deactivated and reversed`,
      link: role === "earner" ? `/admin/earners/${userId}` : `/admin/advertisers/${userId}`,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      actor: adminSession.email,
      userId,
    })

    return NextResponse.json({ success: true, message: "User deactivated" })
  }

  return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 })
}
