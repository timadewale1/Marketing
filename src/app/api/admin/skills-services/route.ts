import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-session";
import { initFirebaseAdmin } from "@/lib/firebaseAdmin";

export async function GET() {
  try {
    await requireAdminSession();
    const { dbAdmin } = await initFirebaseAdmin();
    if (!dbAdmin)
      return NextResponse.json(
        { success: false, message: "Service unavailable" },
        { status: 500 },
      );
    const snap = await dbAdmin
      .collection("serviceAccounts")
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();
    return NextResponse.json({
      success: true,
      accounts: snap.docs.map((item) => ({ id: item.id, ...item.data() })),
    });
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

export async function PATCH(req: Request) {
  try {
    await requireAdminSession();
    const { dbAdmin, admin } = await initFirebaseAdmin();
    if (!dbAdmin || !admin)
      return NextResponse.json(
        { success: false, message: "Service unavailable" },
        { status: 500 },
      );
    const body = await req.json();
    const id = String(body.id || "");
    if (!id)
      return NextResponse.json(
        { success: false, message: "Missing account id" },
        { status: 400 },
      );
    await dbAdmin
      .collection("serviceAccounts")
      .doc(id)
      .set(
        {
          status: String(body.status || "active"),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
