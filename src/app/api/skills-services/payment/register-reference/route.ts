import { NextResponse } from "next/server";
import { requireServiceUser } from "@/app/api/skills-services/_auth";
import {
  SERVICE_CONNECTION_FEE,
  SERVICE_PROVIDER_FEE,
} from "@/lib/service-marketplace";

export async function POST(req: Request) {
  try {
    const { dbAdmin, admin, uid, email } = await requireServiceUser(req);
    const body = await req.json();
    const feeType =
      body.feeType === "connection" ? "connection" : "provider_activation";
    const providerId = String(body.providerId || "");
    const amount =
      feeType === "connection" ? SERVICE_CONNECTION_FEE : SERVICE_PROVIDER_FEE;
    const reference = String(body.reference || "").trim();
    if (!reference || (feeType === "connection" && !providerId))
      return NextResponse.json(
        { success: false, message: "Missing payment details" },
        { status: 400 },
      );
    await dbAdmin
      .collection("servicePayments")
      .doc(reference)
      .set(
        {
          reference,
          userId: uid,
          email,
          feeType,
          providerId: providerId || null,
          amount,
          status: "pending",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unauthorized",
      },
      { status: 401 },
    );
  }
}
