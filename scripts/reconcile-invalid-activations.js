const fs = require("fs")
const path = require("path")
const admin = require("firebase-admin")

function loadEnvFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8")
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const idx = trimmed.indexOf("=")
    const key = trimmed.slice(0, idx)
    const value = trimmed.slice(idx + 1)
    if (!(key in process.env)) process.env[key] = value
  }
}

function asDate(value) {
  if (value && typeof value === "object" && typeof value.toDate === "function") return value.toDate()
  if (value instanceof Date) return value
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

function normalizeAmount(value) {
  const amount = Math.floor(Number(value || 0))
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

async function reverseReferralBonusesForUser(db, adminModule, userId) {
  const refsSnap = await db.collection("referrals")
    .where("referredId", "==", userId)
    .where("bonusPaid", "==", true)
    .get()

  for (const rDoc of refsSnap.docs) {
    const r = rDoc.data() || {}
    const bonus = normalizeAmount(r.amount)
    const referrerId = String(r.referrerId || "").trim()

    await db.runTransaction(async (t) => {
      const referralRef = db.collection("referrals").doc(rDoc.id)
      const snap = await t.get(referralRef)
      if (!snap.exists) return
      const data = snap.data() || {}
      if (!data.bonusPaid) return

      const advRef = db.collection("advertisers").doc(referrerId)
      const earnerRef = db.collection("earners").doc(referrerId)
      const [advSnap, earnerSnap] = await Promise.all([t.get(advRef), t.get(earnerRef)])
      const userRef = advSnap.exists ? advRef : earnerSnap.exists ? earnerRef : null
      const txCollection = advSnap.exists ? "advertiserTransactions" : earnerSnap.exists ? "earnerTransactions" : null
      if (!userRef || !txCollection) return

      if (bonus <= 0 || !referrerId) return

      const userData = (advSnap.exists ? advSnap.data() : earnerSnap.data()) || {}
      const currentBalance = Math.max(0, Number(userData.balance || 0))
      const pendingRecovery = Math.max(0, Number(userData.pendingBalanceRecovery || 0))
      const deductedNow = Math.min(currentBalance, bonus)
      const addedDebt = Math.max(0, bonus - deductedNow)
      const nextDebt = pendingRecovery + addedDebt
      const timestamp = adminModule.firestore.FieldValue.serverTimestamp()

      if (deductedNow > 0) {
        t.set(db.collection(txCollection).doc(), {
          userId: referrerId,
          type: "referral_bonus_reversal",
          amount: -deductedNow,
          status: "completed",
          note: `Reversal of referral bonus for ${userId}`,
          referralId: rDoc.id,
          reversedForUserId: userId,
          createdAt: timestamp,
          source: "recovery-reconciliation",
          recoveredAmount: deductedNow,
        })
      }

      const updates = { updatedAt: timestamp }
      if (deductedNow > 0) {
        updates.balance = adminModule.firestore.FieldValue.increment(-deductedNow)
      }
      if (nextDebt > 0) {
        updates.pendingBalanceRecovery = nextDebt
        updates.pendingBalanceRecoveryUpdatedAt = timestamp
      } else if (pendingRecovery > 0) {
        updates.pendingBalanceRecovery = adminModule.firestore.FieldValue.delete()
        updates.pendingBalanceRecoveryUpdatedAt = adminModule.firestore.FieldValue.delete()
      }

      t.update(userRef, updates)
      t.update(referralRef, {
        status: "pending",
        bonusPaid: false,
        paidAt: adminModule.firestore.FieldValue.delete(),
        paidAmount: adminModule.firestore.FieldValue.delete(),
        completedAt: adminModule.firestore.FieldValue.delete(),
      })
    })
  }
}

async function reverseSubmissionForDeactivation(db, adminModule, submissionRef, submission, adminUid) {
  const now = new Date()

  await db.runTransaction(async (t) => {
    const prevStatus = String(submission.status || "")
    const campaignId = submission.campaignId ? String(submission.campaignId) : ""
    const userId = submission.userId ? String(submission.userId) : ""
    if (!userId) return

    let campaignRef = null
    let campaignSnap = null
    let campaign = null

    if (campaignId) {
      campaignRef = db.collection("campaigns").doc(campaignId)
      campaignSnap = await t.get(campaignRef)
      campaign = campaignSnap.exists ? (campaignSnap.data() || null) : null
    }

    const advertiserId = String(submission.advertiserId || (campaign && campaign.ownerId) || "").trim()
    const earnerRef = db.collection("earners").doc(userId)
    const earnerSnap = await t.get(earnerRef)
    const advertiserRef = advertiserId ? db.collection("advertisers").doc(advertiserId) : null
    const advertiserSnap = advertiserRef ? await t.get(advertiserRef) : null

    let earnerAmount = normalizeAmount(submission.earnerPrice)
    let fullAmount = earnerAmount * 2
    if ((!earnerAmount || earnerAmount === 0) && campaign) {
      const costPerLeadTmp = normalizeAmount(campaign.costPerLead)
      if (costPerLeadTmp > 0) earnerAmount = Math.round(costPerLeadTmp / 2)
      fullAmount = normalizeAmount(submission.reservedAmount || (earnerAmount * 2))
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
        t.set(db.collection("earnerTransactions").doc(), {
          userId,
          campaignId: campaignId || null,
          type: "reversal",
          amount: -earnerAmount,
          status: "completed",
          note: `Reversal for activation invalidation ${String(submission.campaignTitle || "")}`,
          createdAt: now,
          source: "recovery-reconciliation",
        })
        t.update(earnerRef, {
          balance: adminModule.firestore.FieldValue.increment(-earnerAmount),
          leadsPaidFor: adminModule.firestore.FieldValue.increment(-1),
          totalEarned: adminModule.firestore.FieldValue.increment(-earnerAmount),
        })
      }

      if (advertiserRef && advertiserSnap && advertiserSnap.exists) {
        t.set(db.collection("advertiserTransactions").doc(), {
          userId: advertiserId,
          campaignId: campaignId || null,
          type: "refund",
          amount: fullAmount,
          status: "completed",
          note: `Refund for activation invalidation ${String(submission.campaignTitle || "")}`,
          createdAt: now,
          source: "recovery-reconciliation",
        })
        t.update(advertiserRef, {
          totalSpent: adminModule.firestore.FieldValue.increment(-fullAmount),
          leadsGenerated: adminModule.firestore.FieldValue.increment(-1),
        })
      }

      if (campaignRef && campaignSnap && campaignSnap.exists) {
        const reservedAmt = normalizeAmount(submission.reservedAmount)
        if (reservedAmt > 0) {
          if (campaign && campaign.status === "Deleted") {
            t.update(campaignRef, {
              generatedLeads: adminModule.firestore.FieldValue.increment(-1),
              reservedBudget: adminModule.firestore.FieldValue.increment(-reservedAmt),
              completedLeads: adminModule.firestore.FieldValue.increment(-1),
            })
            if (advertiserRef && advertiserSnap && advertiserSnap.exists) {
              t.update(advertiserRef, { balance: adminModule.firestore.FieldValue.increment(reservedAmt) })
            }
          } else {
            t.update(campaignRef, {
              generatedLeads: adminModule.firestore.FieldValue.increment(-1),
              reservedBudget: adminModule.firestore.FieldValue.increment(-reservedAmt),
              budget: adminModule.firestore.FieldValue.increment(reservedAmt),
              completedLeads: adminModule.firestore.FieldValue.increment(-1),
            })
          }
        } else {
          if (campaign && campaign.status === "Deleted") {
            t.update(campaignRef, {
              generatedLeads: adminModule.firestore.FieldValue.increment(-1),
              completedLeads: adminModule.firestore.FieldValue.increment(-1),
            })
            if (advertiserRef && advertiserSnap && advertiserSnap.exists) {
              t.update(advertiserRef, { balance: adminModule.firestore.FieldValue.increment(fullAmount) })
            }
          } else {
            t.update(campaignRef, {
              generatedLeads: adminModule.firestore.FieldValue.increment(-1),
              budget: adminModule.firestore.FieldValue.increment(fullAmount),
              completedLeads: adminModule.firestore.FieldValue.increment(-1),
            })
          }
        }
      }
      return
    }

    if (campaignRef && campaignSnap && campaignSnap.exists) {
      const reservedAmt = normalizeAmount(submission.reservedAmount)
      if (reservedAmt > 0) {
        if (campaign && campaign.status === "Deleted") {
          t.update(campaignRef, {
            reservedBudget: adminModule.firestore.FieldValue.increment(-reservedAmt),
          })
          if (advertiserRef && advertiserSnap && advertiserSnap.exists) {
            t.update(advertiserRef, { balance: adminModule.firestore.FieldValue.increment(reservedAmt) })
          }
        } else {
          t.update(campaignRef, {
            reservedBudget: adminModule.firestore.FieldValue.increment(-reservedAmt),
            budget: adminModule.firestore.FieldValue.increment(reservedAmt),
          })
        }
      }
    }
  })
}

async function deleteActivationFeeTransactions(db, role, userId) {
  const txCollection = role === "earner" ? "earnerTransactions" : "advertiserTransactions"
  const snap = await db.collection(txCollection)
    .where("userId", "==", userId)
    .where("type", "==", "activation_fee")
    .get()

  for (const doc of snap.docs) {
    await doc.ref.delete()
  }
}

async function deactivateUser(db, adminModule, userId, adminUid) {
  const earnerRef = db.collection("earners").doc(userId)
  const earnerSnap = await earnerRef.get()
  const advertiserRef = db.collection("advertisers").doc(userId)
  const advertiserSnap = earnerSnap.exists ? null : await advertiserRef.get()

  let role = null
  let userRef = null
  let userData = {}

  if (earnerSnap.exists) {
    role = "earner"
    userRef = earnerRef
    userData = earnerSnap.data() || {}
  } else if (advertiserSnap && advertiserSnap.exists) {
    role = "advertiser"
    userRef = advertiserRef
    userData = advertiserSnap.data() || {}
  }

  if (!role || !userRef) return { found: false }

    if (userData.activated) {
    await reverseReferralBonusesForUser(db, adminModule, userId)
    await deleteActivationFeeTransactions(db, role, userId)
  }

  await userRef.set({
    activated: false,
    activatedAt: adminModule.firestore.FieldValue.delete(),
    activationPaymentProvider: adminModule.firestore.FieldValue.delete(),
    activationReference: adminModule.firestore.FieldValue.delete(),
    activationReferences: adminModule.firestore.FieldValue.delete(),
    activationAttemptedAt: adminModule.firestore.FieldValue.delete(),
    pendingActivationReference: adminModule.firestore.FieldValue.delete(),
    pendingActivationReferences: adminModule.firestore.FieldValue.delete(),
    pendingActivationProvider: adminModule.firestore.FieldValue.delete(),
    needsReactivation: false,
    nextActivationDue: adminModule.firestore.FieldValue.delete(),
    updatedAt: adminModule.firestore.FieldValue.serverTimestamp(),
  }, { merge: true })

  return { found: true, role }
}

async function main() {
  const cwd = process.cwd()
  loadEnvFile(path.join(cwd, ".env"))
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    })
  }

  const db = admin.firestore()
  const report = JSON.parse(fs.readFileSync(path.join(cwd, "reports/activation_monnify_remaining_split_2026-06-08.json"), "utf8"))
  const targets = Array.isArray(report.noLabel) ? report.noLabel : []
  const targetRefs = targets
    .map((item) => String(item.userId || "").trim())
    .filter(Boolean)
    .map((userId) => ({ userId, ref: db.collection("earners").doc(userId) }))
  const targetSnaps = targetRefs.length ? await db.getAll(...targetRefs.map((item) => item.ref)) : []
  const deactivated = []
  const skipped = []

  for (let index = 0; index < targetRefs.length; index++) {
    const item = targets[index]
    const userId = targetRefs[index].userId
    const liveSnap = targetSnaps[index]
    if (!liveSnap || !liveSnap.exists) {
      skipped.push({ userId, name: item.name || null, email: item.email || null, reason: "not_found" })
      continue
    }
    const liveData = liveSnap.data() || {}
    if (!liveData.activated) {
      skipped.push({ userId, name: item.name || null, email: item.email || null, reason: "already_deactivated" })
      continue
    }

    const result = await deactivateUser(db, admin, userId, "codex-reconciliation")
    if (result.found) {
      deactivated.push({
        userId,
        name: item.name || null,
        email: item.email || null,
        role: result.role,
      })
    } else {
      skipped.push({ userId, name: item.name || null, email: item.email || null })
    }
  }

  console.log(JSON.stringify({
    deactivated,
    skipped,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
