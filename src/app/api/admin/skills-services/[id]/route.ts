import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-session";
import { initFirebaseAdmin } from "@/lib/firebaseAdmin";
import { normalizeServiceAccount } from "@/lib/service-marketplace";

function serializeTimestamp(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

function serializeRecord(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function"
        ? serializeTimestamp(value)
        : value,
    ]),
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSession();
    const { dbAdmin, admin } = await initFirebaseAdmin();
    if (!dbAdmin || !admin) {
      return NextResponse.json({ success: false, message: "Service unavailable" }, { status: 500 });
    }

    const { id } = await params;
    const accountSnap = await dbAdmin.collection("serviceAccounts").doc(id).get();
    if (!accountSnap.exists) {
      return NextResponse.json({ success: false, message: "Service account not found" }, { status: 404 });
    }

    const account = normalizeServiceAccount(id, accountSnap.data() || {});
    const [paymentsByUser, paymentsByProvider, connectionsAsCustomer, connectionsAsProvider] = await Promise.all([
      dbAdmin.collection("servicePayments").where("userId", "==", id).limit(200).get(),
      dbAdmin.collection("servicePayments").where("providerId", "==", id).limit(200).get(),
      dbAdmin.collection("serviceConnections").where("customerId", "==", id).limit(200).get(),
      dbAdmin.collection("serviceConnections").where("providerId", "==", id).limit(200).get(),
    ]);

    const paymentMap = new Map<string, Record<string, unknown>>();
    [...paymentsByUser.docs, ...paymentsByProvider.docs].forEach((doc) => {
      paymentMap.set(doc.id, { id: doc.id, ...serializeRecord(doc.data()) });
    });

    const customerConnections = await Promise.all(
      connectionsAsCustomer.docs.map(async (doc) => {
        const data = doc.data();
        const providerId = String(data.providerId || "");
        const providerSnap = providerId ? await dbAdmin.collection("serviceAccounts").doc(providerId).get() : null;
        return {
          id: doc.id,
          ...serializeRecord(data),
          provider: providerSnap?.exists ? normalizeServiceAccount(providerId, providerSnap.data() || {}) : null,
        };
      }),
    );

    const providerConnections = await Promise.all(
      connectionsAsProvider.docs.map(async (doc) => {
        const data = doc.data();
        const customerId = String(data.customerId || "");
        const customerSnap = customerId ? await dbAdmin.collection("serviceAccounts").doc(customerId).get() : null;
        return {
          id: doc.id,
          ...serializeRecord(data),
          customer: customerSnap?.exists ? normalizeServiceAccount(customerId, customerSnap.data() || {}) : null,
        };
      }),
    );

    let authUser: Record<string, unknown> | null = null;
    try {
      const firebaseUser = await admin.auth().getUser(id);
      authUser = {
        uid: firebaseUser.uid,
        emailVerified: firebaseUser.emailVerified,
        disabled: firebaseUser.disabled,
        creationTime: firebaseUser.metadata.creationTime || null,
        lastSignInTime: firebaseUser.metadata.lastSignInTime || null,
        providerData: firebaseUser.providerData.map((provider) => ({ providerId: provider.providerId, email: provider.email })),
      };
    } catch {
      authUser = null;
    }

    return NextResponse.json({
      success: true,
      account,
      authUser,
      payments: Array.from(paymentMap.values()),
      customerConnections,
      providerConnections,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
