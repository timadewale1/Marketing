import { NextResponse } from "next/server";
import { requireServiceUser } from "@/app/api/skills-services/_auth";
import { confirmMonnifyPaymentWithRetries } from "@/lib/monnify-confirmation";
import {
  SERVICE_CONNECTION_FEE,
  SERVICE_PROVIDER_FEE,
} from "@/lib/service-marketplace";

export async function POST(req: Request) {
  try {
    const { dbAdmin, admin, uid } = await requireServiceUser(req);
    const body = await req.json();
    const reference = String(body.reference || "").trim();
    if (!reference)
      return NextResponse.json(
        { success: false, message: "Missing reference" },
        { status: 400 },
      );
    const paymentRef = dbAdmin.collection("servicePayments").doc(reference);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists || paymentSnap.data()?.userId !== uid)
      return NextResponse.json(
        { success: false, message: "Payment not found" },
        { status: 404 },
      );
    const payment = paymentSnap.data() || {};
    if (payment.status === "paid")
      return NextResponse.json({ success: true, completed: true });
    const confirmation = await confirmMonnifyPaymentWithRetries(
      reference,
      [reference],
      [0, 2000, 5000],
    );
    if (!confirmation.confirmed)
      return NextResponse.json({
        success: true,
        completed: false,
        message: "Payment received and awaiting confirmation",
      });
    const feeType =
      payment.feeType === "connection" ? "connection" : "provider_activation";
    const expected =
      feeType === "connection" ? SERVICE_CONNECTION_FEE : SERVICE_PROVIDER_FEE;
    if (Number(payment.amount) !== expected)
      return NextResponse.json(
        { success: false, message: "Invalid payment amount" },
        { status: 400 },
      );
    const batch = dbAdmin.batch();
    batch.set(
      paymentRef,
      {
        status: "paid",
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        providerReference: confirmation.references[0] || reference,
      },
      { merge: true },
    );
    if (feeType === "connection") {
      const providerId = String(payment.providerId || "");
      const connectionRef = dbAdmin
        .collection("serviceConnections")
        .doc(`${uid}_${providerId}`);
      batch.set(
        connectionRef,
        {
          customerId: uid,
          providerId,
          status: "paid",
          paymentReference: reference,
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      batch.set(
        dbAdmin.collection("serviceAccounts").doc(providerId),
        { connectionCount: admin.firestore.FieldValue.increment(1) },
        { merge: true },
      );
    } else {
      batch.set(
        dbAdmin.collection("serviceAccounts").doc(uid),
        {
          activationPaid: true,
          activationPaidAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    await batch.commit();
    return NextResponse.json({ success: true, completed: true });
  } catch (error) {
    console.error("[skills-services/payment/verify]", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Could not verify payment",
      },
      { status: 500 },
    );
  }
}
