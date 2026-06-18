import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"

const ORDER_CAP_NAIRA = 50000
const CASHBACK_RATE = 0.1

async function requireUser(req: Request) {
  const idToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  if (!idToken) return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) }

  const { admin, dbAdmin } = await initFirebaseAdmin()
  if (!admin || !dbAdmin) {
    return { error: NextResponse.json({ success: false, message: "Firebase admin unavailable" }, { status: 500 }) }
  }

  const decoded = await admin.auth().verifyIdToken(idToken).catch(() => null)
  if (!decoded?.uid) return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) }

  const [earnerSnap, advertiserSnap] = await Promise.all([
    dbAdmin.collection("earners").doc(decoded.uid).get(),
    dbAdmin.collection("advertisers").doc(decoded.uid).get(),
  ])
  const role = earnerSnap.exists ? "earner" : advertiserSnap.exists ? "advertiser" : null
  const profile = earnerSnap.exists ? earnerSnap.data() : advertiserSnap.data()

  if (!role || !profile) return { error: NextResponse.json({ success: false, message: "User profile not found" }, { status: 404 }) }

  return { admin, dbAdmin, userId: decoded.uid, role, profile }
}

async function getApprovedOrderAmount(dbAdmin: Awaited<ReturnType<typeof initFirebaseAdmin>>["dbAdmin"], userId: string) {
  if (!dbAdmin) return 0
  const snap = await dbAdmin
    .collection("vendorPurchaseSubmissions")
    .where("userId", "==", userId)
    .where("status", "==", "approved")
    .limit(500)
    .get()
  return snap.docs.reduce((sum, docItem) => sum + Number(docItem.data()?.eligibleOrderAmount || 0), 0)
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser(req)
    if ("error" in auth) return auth.error

    const [approvedOrderAmount, userSubmissionsSnap, productSnap] = await Promise.all([
      getApprovedOrderAmount(auth.dbAdmin, auth.userId),
      auth.dbAdmin
        .collection("vendorPurchaseSubmissions")
        .where("userId", "==", auth.userId)
        .orderBy("createdAt", "desc")
        .limit(100)
        .get(),
      auth.dbAdmin
        .collection("vendorProducts")
        .where("visibleOnMarketplace", "==", true)
        .limit(1)
        .get(),
    ])

    const submissions = userSubmissionsSnap.docs.map((docItem) => {
      const data = docItem.data() as Record<string, unknown>
      return {
        id: docItem.id,
        vendorName: String(data.vendorName || ""),
        productId: String(data.productId || ""),
        amount: Number(data.amount || 0),
        cashbackAmount: Number(data.cashbackAmount || 0),
        status: String(data.status || "pending"),
        reviewerReason: String(data.reviewerReason || ""),
        createdAtMs: typeof data.createdAt === "object" && data.createdAt && "seconds" in data.createdAt ? Number((data.createdAt as { seconds?: number }).seconds || 0) * 1000 : 0,
      }
    })

    return NextResponse.json({
      success: true,
      role: auth.role,
      hasLiveProducts: !productSnap.empty,
      approvedOrderAmount,
      remainingOrderCap: Math.max(0, ORDER_CAP_NAIRA - approvedOrderAmount),
      canSubmit: !productSnap.empty && approvedOrderAmount < ORDER_CAP_NAIRA,
      submissions,
    })
  } catch (error) {
    console.error("[vendor][cashback][GET] error:", error)
    return NextResponse.json({ success: false, message: "Failed to load cashback status" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser(req)
    if ("error" in auth) return auth.error

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const vendorName = String(body.vendorName || "").trim()
    const productId = String(body.productId || "").trim()
    const amount = Math.floor(Number(body.amount || 0))
    const proofUrls = Array.isArray(body.proofUrls)
      ? body.proofUrls.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 8)
      : []

    if (!vendorName || !productId || amount <= 0 || proofUrls.length === 0) {
      return NextResponse.json({ success: false, message: "Vendor name, product id, amount, and proofs are required" }, { status: 400 })
    }

    const [approvedOrderAmount, productSnap] = await Promise.all([
      getApprovedOrderAmount(auth.dbAdmin, auth.userId),
      auth.dbAdmin.collection("vendorProducts").doc(productId).get(),
    ])

    if (!productSnap.exists) {
      return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 })
    }
    if (!Boolean(productSnap.data()?.visibleOnMarketplace)) {
      return NextResponse.json({ success: false, message: "This product is not currently eligible for cashback" }, { status: 400 })
    }

    const remainingOrderCap = Math.max(0, ORDER_CAP_NAIRA - approvedOrderAmount)
    if (remainingOrderCap <= 0) {
      return NextResponse.json({ success: false, message: "You have reached the cashback order limit" }, { status: 400 })
    }

    const eligibleOrderAmount = Math.min(amount, remainingOrderCap)
    const cashbackAmount = Math.floor(eligibleOrderAmount * CASHBACK_RATE)
    const now = auth.admin.firestore.FieldValue.serverTimestamp()
    const claimRef = auth.dbAdmin.collection("vendorPurchaseSubmissions").doc()

    await claimRef.set({
      id: claimRef.id,
      userId: auth.userId,
      userType: auth.role,
      userName: String(auth.profile?.name || auth.profile?.fullName || "User"),
      userEmail: String(auth.profile?.email || ""),
      vendorName,
      productId,
      amount,
      eligibleOrderAmount,
      cashbackAmount,
      proofUrls,
      status: "pending",
      reviewerReason: null,
      createdAt: now,
      updatedAt: now,
    })

    return NextResponse.json({ success: true, claimId: claimRef.id, cashbackAmount, eligibleOrderAmount })
  } catch (error) {
    console.error("[vendor][cashback][POST] error:", error)
    return NextResponse.json({ success: false, message: "Failed to submit cashback claim" }, { status: 500 })
  }
}
