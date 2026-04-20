import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { buildCustomFirebaseActionLink } from "@/lib/firebase-action-links"
import { sendVerificationEmail } from "@/lib/mailer"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.pambaadverts.com"

function mapSignupErrorMessage(error: unknown) {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "We could not create your account right now. Please try again."

  const normalized = rawMessage.toLowerCase()

  if (
    normalized.includes("daily user sending limit exceeded") ||
    normalized.includes("sending limit exceeded") ||
    normalized.includes("550-5.4.5")
  ) {
    return "We could not send your verification email right now because our email limit has been reached. Please try again in 24 hours."
  }

  return rawMessage
}

export async function POST(req: Request) {
  let createdUid: string | null = null

  try {
    const body = await req.json()
    const name = String(body?.name || "").trim()
    const email = String(body?.email || "").trim().toLowerCase()
    const phone = String(body?.phone || "").trim()
    const password = String(body?.password || "")
    const action = body?.action === "advertiser" ? "advertiser" : body?.action === "earner" ? "earner" : ""
    const referralId = String(body?.referralId || "").trim() || null

    if (!name || !email || !phone || !password || !action) {
      return NextResponse.json({ success: false, message: "Missing required signup fields" }, { status: 400 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ success: false, message: "Firebase admin unavailable" }, { status: 500 })
    }

    for (const collectionName of ["advertisers", "earners"]) {
      const [emailSnap, phoneSnap] = await Promise.all([
        dbAdmin.collection(collectionName).where("email", "==", email).limit(1).get(),
        dbAdmin.collection(collectionName).where("phone", "==", phone).limit(1).get(),
      ])

      if (!emailSnap.empty) {
        return NextResponse.json({ success: false, message: "This email is already registered." }, { status: 409 })
      }

      if (!phoneSnap.empty) {
        return NextResponse.json({ success: false, message: "That phone number is already in use." }, { status: 409 })
      }
    }

    try {
      await admin.auth().getUserByEmail(email)
      return NextResponse.json({ success: false, message: "This email is already registered." }, { status: 409 })
    } catch (error) {
      const authError = error as { code?: string }
      if (authError?.code !== "auth/user-not-found") {
        throw error
      }
    }

    const userRecord = await admin.auth().createUser({
      displayName: name,
      email,
      password,
    })
    createdUid = userRecord.uid

    const profileRef = dbAdmin.collection(`${action}s`).doc(createdUid)
    const referralRef = referralId ? dbAdmin.collection("referrals").doc(`${referralId}-${createdUid}`) : null
    const batch = dbAdmin.batch()

    batch.set(profileRef, {
      name,
      email,
      phone,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      verified: false,
      onboarded: false,
      referredBy: referralId,
    })

    if (referralRef) {
      batch.set(referralRef, {
        referrerId: referralId,
        referredId: createdUid,
        userType: action,
        email,
        name,
        amount: 500,
        status: "pending",
        bonusPaid: false,
        condition: "activation",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }

    await batch.commit()

    const firebaseLink = await admin.auth().generateEmailVerificationLink(email, {
      url: `${APP_URL}/auth/sign-in?verified=1`,
      handleCodeInApp: false,
    })
    const verificationUrl = buildCustomFirebaseActionLink(
      firebaseLink,
      "verifyEmail",
      "/auth/sign-in?verified=1"
    )

    await sendVerificationEmail({
      email,
      name,
      verificationUrl,
    })

    return NextResponse.json({
      success: true,
      uid: createdUid,
      message: "Signup successful! Please verify your email.",
    })
  } catch (error) {
    console.error("Server signup error:", error)

    if (createdUid) {
      try {
        const { admin, dbAdmin } = await initFirebaseAdmin()
        if (dbAdmin) {
          const batch = dbAdmin.batch()
          batch.delete(dbAdmin.collection("advertisers").doc(createdUid))
          batch.delete(dbAdmin.collection("earners").doc(createdUid))
          await batch.commit().catch(() => null)

          const referralSnaps = await dbAdmin.collection("referrals").where("referredId", "==", createdUid).get()
          if (!referralSnaps.empty) {
            const referralBatch = dbAdmin.batch()
            referralSnaps.docs.forEach((doc) => referralBatch.delete(doc.ref))
            await referralBatch.commit().catch(() => null)
          }
        }
        if (admin) {
          await admin.auth().deleteUser(createdUid).catch(() => null)
        }
      } catch (rollbackError) {
        console.error("Server signup rollback error:", rollbackError)
      }
    }

    const message = mapSignupErrorMessage(error)

    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}
