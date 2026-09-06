import { NextResponse } from "next/server";
import { requireServiceUser } from "@/app/api/skills-services/_auth";
import { normalizeServiceAccount } from "@/lib/service-marketplace";

export async function GET(req: Request) {
  try {
    const { dbAdmin, uid } = await requireServiceUser(req);
    const snap = await dbAdmin
      .collection("serviceConnections")
      .where("customerId", "==", uid)
      .where("status", "==", "paid")
      .limit(100)
      .get();
    const providers = await Promise.all(
      snap.docs.map(async (connection) => {
        const providerId = String(connection.data().providerId || "");
        const provider = await dbAdmin
          .collection("serviceAccounts")
          .doc(providerId)
          .get();
        return provider.exists
          ? normalizeServiceAccount(providerId, provider.data() || {})
          : null;
      }),
    );
    return NextResponse.json({
      success: true,
      providers: providers.filter(Boolean),
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
