import { NextResponse } from "next/server";
import { initFirebaseAdmin } from "@/lib/firebaseAdmin";
import { requireServiceUser } from "@/app/api/skills-services/_auth";
import { normalizeServiceAccount } from "@/lib/service-marketplace";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { dbAdmin } = await initFirebaseAdmin();
    if (!dbAdmin)
      return NextResponse.json(
        { success: false, message: "Service unavailable" },
        { status: 500 },
      );
    const ref = dbAdmin.collection("serviceAccounts").doc(id);
    const snap = await ref.get();
    if (
      !snap.exists ||
      snap.data()?.accountType !== "provider" ||
      snap.data()?.activationPaid !== true
    )
      return NextResponse.json(
        { success: false, message: "Provider not found" },
        { status: 404 },
      );
    const data = normalizeServiceAccount(id, snap.data() || {});
    await ref.set(
      { profileViews: (data.profileViews || 0) + 1 },
      { merge: true },
    );
    let connected = false;
    const token = req.headers.get("authorization");
    if (token) {
      try {
        const user = await requireServiceUser(req);
        connected = (
          await user.dbAdmin
            .collection("serviceConnections")
            .doc(`${user.uid}_${id}`)
            .get()
        ).exists;
      } catch {
        connected = false;
      }
    }
    const { email, phone, whatsapp, ...publicProfile } = data;
    return NextResponse.json({
      success: true,
      provider: connected ? data : publicProfile,
      connected,
    });
  } catch (error) {
    console.error("[skills-services/provider]", error);
    return NextResponse.json(
      { success: false, message: "Could not load provider" },
      { status: 500 },
    );
  }
}
