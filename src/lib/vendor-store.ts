import type { Firestore } from "firebase-admin/firestore"
import { FieldValue, Timestamp } from "firebase-admin/firestore"

type VendorLike = Record<string, unknown>

function toMillis(value: unknown): number {
  if (!value) return 0
  if (typeof value === "object" && value !== null && "seconds" in value) {
    return Number((value as { seconds?: number }).seconds || 0) * 1000
  }
  if (value instanceof Date) return value.getTime()
  if (value instanceof Timestamp) return value.toMillis()
  return 0
}

export function computeVendorStoreState(vendorData: VendorLike, nowMs: number = Date.now()) {
  const verificationStatus = String(vendorData.vendorVerificationStatus || "").toLowerCase()
  const verified = verificationStatus === "verified" || verificationStatus === "approved"
  const setupPaid = String(vendorData.vendorPaymentStatus || "").toLowerCase() === "paid"
  const rawRentPaid = String(vendorData.monthlyRentStatus || "").toLowerCase() === "paid"
  const dueAtMs = toMillis(vendorData.monthlyRentDueAt)
  const rentRequiredNow = setupPaid && dueAtMs > 0 && nowMs >= dueAtMs
  const rentOverdue = rentRequiredNow && !rawRentPaid
  const rentPaid = !rentRequiredNow || rawRentPaid
  const canShowProducts = verified && setupPaid && rentPaid

  const normalizedStoreStatus = canShowProducts
    ? "active"
    : rentOverdue
      ? "on_hold"
      : !verified
        ? "awaiting_verification"
        : !setupPaid
          ? "pending_payment"
          : "on_hold"

  return {
    verified,
    setupPaid,
    rentPaid,
    rentRequiredNow,
    rentOverdue,
    canShowProducts,
    normalizedStoreStatus,
  }
}

export async function syncVendorStoreEligibility(
  dbAdmin: Firestore,
  vendorId: string,
  vendorData: VendorLike
) {
  const state = computeVendorStoreState(vendorData)
  const vendorRef = dbAdmin.collection("vendors").doc(vendorId)

  const vendorUpdates: Record<string, unknown> = {
    storeStatus: state.normalizedStoreStatus,
    updatedAt: FieldValue.serverTimestamp(),
  }

  if (state.rentOverdue) {
    vendorUpdates.monthlyRentStatus = "unpaid"
  }

  await vendorRef.set(vendorUpdates, { merge: true })

  const productSnap = await dbAdmin
    .collection("vendorProducts")
    .where("vendorId", "==", vendorId)
    .limit(400)
    .get()

  if (!productSnap.empty) {
    const batch = dbAdmin.batch()
    productSnap.docs.forEach((docItem) => {
      batch.set(
        docItem.ref,
        {
          visibleOnMarketplace: state.canShowProducts,
          status: state.canShowProducts ? "active" : "hidden",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    })
    await batch.commit()
  }

  return state
}
