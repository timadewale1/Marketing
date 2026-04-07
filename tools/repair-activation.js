const fs = require("fs")
const admin = require("firebase-admin")

function loadServiceAccount() {
  const raw = fs.readFileSync("serviceAccountKey.json.json", "utf8")
  return JSON.parse(raw)
}

async function processPendingActivationReferrals(db, userId) {
  const refsSnap = await db.collection("referrals")
    .where("referredId", "==", userId)
    .where("status", "==", "pending")
    .get()

  for (const referralDoc of refsSnap.docs) {
    const referral = referralDoc.data()
    const amount = Number(referral.amount || 0)
    const referrerId = String(referral.referrerId || "")
    if (!referrerId || amount <= 0) continue

    await db.runTransaction(async (transaction) => {
      const referralRef = db.collection("referrals").doc(referralDoc.id)
      const freshReferral = await transaction.get(referralRef)
      if (!freshReferral.exists || freshReferral.data()?.status !== "pending") return

      const advertiserRef = db.collection("advertisers").doc(referrerId)
      const earnerRef = db.collection("earners").doc(referrerId)
      const [advertiserSnap, earnerSnap] = await Promise.all([
        transaction.get(advertiserRef),
        transaction.get(earnerRef),
      ])

      transaction.update(referralRef, {
        status: "completed",
        bonusPaid: true,
        paidAmount: amount,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      if (advertiserSnap.exists) {
        transaction.update(advertiserRef, {
          balance: admin.firestore.FieldValue.increment(amount),
        })
        transaction.set(db.collection("advertiserTransactions").doc(), {
          userId: referrerId,
          type: "referral_bonus",
          amount,
          status: "completed",
          note: `Referral bonus for referring ${userId}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      } else if (earnerSnap.exists) {
        transaction.update(earnerRef, {
          balance: admin.firestore.FieldValue.increment(amount),
        })
        transaction.set(db.collection("earnerTransactions").doc(), {
          userId: referrerId,
          type: "referral_bonus",
          amount,
          status: "completed",
          note: `Referral bonus for referring ${userId}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      }
    })
  }
}

async function main() {
  const userId = String(process.argv[2] || "").trim()
  if (!userId) {
    throw new Error("Usage: node tools/repair-activation.js <userId>")
  }

  const serviceAccount = loadServiceAccount()
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })

  const db = admin.firestore()
  const [earnerSnap, advertiserSnap] = await Promise.all([
    db.collection("earners").doc(userId).get(),
    db.collection("advertisers").doc(userId).get(),
  ])

  const userSnap = earnerSnap.exists ? earnerSnap : advertiserSnap
  if (!userSnap.exists) {
    throw new Error(`User ${userId} not found in earners or advertisers`)
  }

  const role = earnerSnap.exists ? "earner" : "advertiser"
  const userCollection = role === "earner" ? "earners" : "advertisers"
  const txCollection = role === "earner" ? "earnerTransactions" : "advertiserTransactions"
  const user = userSnap.data() || {}
  const references = [...new Set([
    user.pendingActivationReference,
    ...(Array.isArray(user.pendingActivationReferences) ? user.pendingActivationReferences : []),
    user.activationReference,
    ...(Array.isArray(user.activationReferences) ? user.activationReferences : []),
  ].map((value) => String(value || "").trim()).filter(Boolean))]
  const primaryReference = references[0] || "manual_admin_recovery"

  if (!user.activated) {
    const updateData = {
      activated: true,
      activatedAt: admin.firestore.FieldValue.serverTimestamp(),
      activationPaymentProvider: String(user.pendingActivationProvider || user.activationPaymentProvider || "monnify"),
      activationReference: primaryReference,
      activationReferences: references,
      pendingActivationReference: admin.firestore.FieldValue.delete(),
      pendingActivationReferences: admin.firestore.FieldValue.delete(),
      pendingActivationProvider: admin.firestore.FieldValue.delete(),
      activationAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(role === "earner"
        ? {
            nextActivationDue: admin.firestore.Timestamp.fromMillis(Date.now() + 1000 * 60 * 60 * 24 * 30 * 3),
          }
        : {}),
    }

    await db.collection(userCollection).doc(userId).update(updateData)
  }

  const existingTx = await db.collection(txCollection)
    .where("userId", "==", userId)
    .where("type", "==", "activation_fee")
    .where("status", "==", "completed")
    .limit(1)
    .get()

  if (existingTx.empty) {
    await db.collection(txCollection).add({
      userId,
      type: "activation_fee",
      amount: -2000,
      provider: String(user.pendingActivationProvider || user.activationPaymentProvider || "monnify"),
      reference: primaryReference,
      status: "completed",
      note: "Activation fee payment",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  }

  await db.collection("activationAttempts").doc(`${role}_${userId}`).set({
    userId,
    role,
    provider: String(user.pendingActivationProvider || user.activationPaymentProvider || "monnify"),
    email: String(user.email || "").trim().toLowerCase(),
    name: String(user.fullName || user.businessName || user.name || user.companyName || "Unnamed user"),
    reference: primaryReference,
    references,
    status: "completed",
    completedReference: primaryReference,
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    pendingReference: admin.firestore.FieldValue.delete(),
  }, { merge: true })

  await processPendingActivationReferrals(db, userId)

  console.log(JSON.stringify({
    success: true,
    userId,
    role,
    reference: primaryReference,
    references,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
