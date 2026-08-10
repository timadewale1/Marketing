import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-session";
import { initFirebaseAdmin } from "@/lib/firebaseAdmin";

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export async function POST(req: Request) {
  let adminSession;
  try {
    adminSession = await requireAdminSession();
  } catch (error) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const email = normalizeEmail(body.email);
  const action = String(body.action || "").trim().toLowerCase();
  const amount = Number(body.amount || 0);

  if (!email) {
    return NextResponse.json({ success: false, message: "Email is required." }, { status: 400 });
  }

  if (!amount || amount <= 0) {
    return NextResponse.json({ success: false, message: "Amount must be greater than zero." }, { status: 400 });
  }

  if (action !== "fund" && action !== "decrease") {
    return NextResponse.json({ success: false, message: "Invalid action." }, { status: 400 });
  }

  const { admin, dbAdmin } = await initFirebaseAdmin();
  if (!admin || !dbAdmin) {
    return NextResponse.json({ success: false, message: "Firebase not initialized." }, { status: 500 });
  }

  try {
    const earnerQuery = dbAdmin.collection("earners").where("email", "==", email).limit(1);
    const advertiserQuery = dbAdmin.collection("advertisers").where("email", "==", email).limit(1);
    const [earnerSnap, advertiserSnap] = await Promise.all([earnerQuery.get(), advertiserQuery.get()]);

    const earnerDoc = earnerSnap.docs[0];
    const advertiserDoc = advertiserSnap.docs[0];
    const targetDoc = earnerDoc || advertiserDoc;
    const role = earnerDoc ? "earner" : advertiserDoc ? "advertiser" : null;

    if (!targetDoc || !role) {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }

    const collectionName = role === "earner" ? "earners" : "advertisers";
    const transactionCollection = role === "earner" ? "earnerTransactions" : "advertiserTransactions";
    const transactionType = action === "fund" ? "admin_credit" : "admin_debit";
    const note = action === "fund"
      ? "Wallet funding"
      : "Admin wallet deduction";
    const amountAdjustment = action === "fund" ? amount : -amount;

    const userRef = dbAdmin.collection(collectionName).doc(targetDoc.id);
    const txRef = dbAdmin.collection(transactionCollection).doc();

    await dbAdmin.runTransaction(async (transaction) => {
      const userSnapshot = await transaction.get(userRef);
      if (!userSnapshot.exists) {
        throw new Error("User document not found.");
      }

      const currentBalance = Number(userSnapshot.data()?.balance || userSnapshot.data()?.walletBalance || 0);
      if (action === "decrease" && currentBalance < amount) {
        throw new Error("Insufficient wallet balance for this deduction.");
      }

      transaction.update(userRef, {
        balance: admin.firestore.FieldValue.increment(amountAdjustment),
      });

      transaction.set(txRef, {
        userId: targetDoc.id,
        type: transactionType,
        amount: amountAdjustment,
        status: "completed",
        note,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        performedBy: adminSession.email,
        adminAction: action,
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin][funder-users] balance adjustment failed", error);
    const message = error instanceof Error ? error.message : "Failed to update balance.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
