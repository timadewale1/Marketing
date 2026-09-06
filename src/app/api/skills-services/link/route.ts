import { NextResponse } from "next/server";
import { initFirebaseAdmin } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const { admin, dbAdmin } = await initFirebaseAdmin();
    if (!admin || !dbAdmin) {
      return NextResponse.json(
        { success: false, message: "Service unavailable" },
        { status: 500 },
      );
    }

    const body = await req.json();
    const token = String(body.token || "").trim();
    if (!token) {
      return NextResponse.json(
        { success: false, message: "Missing confirmation token" },
        { status: 400 },
      );
    }

    const requestRef = dbAdmin.collection("serviceLinkRequests").doc(token);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) {
      return NextResponse.json(
        { success: false, message: "This link is invalid or has expired." },
        { status: 400 },
      );
    }

    const request = requestSnap.data() || {};
    const expiresAt = request.expiresAt?.toMillis?.() || 0;
    if (request.used === true || (expiresAt && expiresAt < Date.now())) {
      return NextResponse.json(
        { success: false, message: "This link is invalid or has expired." },
        { status: 400 },
      );
    }

    const accountRef = dbAdmin
      .collection("serviceAccounts")
      .doc(String(request.uid));
    const accountSnap = await accountRef.get();
    if (accountSnap.exists) {
      await requestRef.set(
        {
          used: true,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return NextResponse.json({
        success: true,
        alreadyLinked: true,
        message: "This account is already linked.",
      });
    }

    const profile = (request.profile || {}) as Record<string, unknown>;
    await accountRef.set({
      accountType: request.accountType === "customer" ? "customer" : "provider",
      ...profile,
      onboardingComplete: false,
      activationPaid: false,
      profileViews: 0,
      connectionCount: 0,
      linkedFromPamba: true,
      linkedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await requestRef.set(
      { used: true, completedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );

    return NextResponse.json({
      success: true,
      message: "Your Pamba account is now linked.",
    });
  } catch (error) {
    console.error("[skills-services/link]", error);
    return NextResponse.json(
      { success: false, message: "Could not complete account linking." },
      { status: 500 },
    );
  }
}
