import { NextResponse } from "next/server";
import { requireServiceUser } from "@/app/api/skills-services/_auth";
import { normalizeServiceAccount } from "@/lib/service-marketplace";
import { notifyAdminOfServiceListing } from "@/lib/skills-services-admin-alerts";

export async function GET(req: Request) {
  try {
    const { dbAdmin, uid } = await requireServiceUser(req);
    const snap = await dbAdmin.collection("serviceAccounts").doc(uid).get();
    return NextResponse.json({
      success: true,
      account: snap.exists
        ? normalizeServiceAccount(uid, snap.data() || {})
        : null,
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

export async function POST(req: Request) {
  try {
    const { dbAdmin, admin, uid, email } = await requireServiceUser(req);
    const body = await req.json();
    const type = body.accountType === "customer" ? "customer" : "provider";
    const ref = dbAdmin.collection("serviceAccounts").doc(uid);
    const existing = await ref.get();
    const data = {
      accountType: type,
      name: String(body.name || "").trim(),
      email: String(body.email || email)
        .trim()
        .toLowerCase(),
      phone: String(body.phone || "").trim(),
      location: String(body.location || "").trim(),
      city: String(body.city || "").trim(),
      state: String(body.state || "").trim(),
      bio: String(body.bio || "").trim(),
      profileImageUrl: String(body.profileImageUrl || "").trim(),
      skills: Array.isArray(body.skills)
        ? body.skills.map(String).slice(0, 30)
        : [],
      categories: Array.isArray(body.categories)
        ? body.categories.map(String).slice(0, 10)
        : [],
      services: Array.isArray(body.services)
        ? body.services.map(String).slice(0, 30)
        : [],
      experience: String(body.experience || "").trim(),
      availability: String(body.availability || "").trim(),
      portfolio: Array.isArray(body.portfolio)
        ? body.portfolio.slice(0, 12)
        : [],
      whatsapp: String(body.whatsapp || "").trim(),
      contactPreference: String(body.contactPreference || "").trim(),
      onboardingComplete: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(existing.exists
        ? {}
        : {
            activationPaid: false,
            profileViews: 0,
            connectionCount: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          }),
    };
    await ref.set(data, { merge: true });
    if (!existing.exists && type === "provider") {
      await notifyAdminOfServiceListing({
        providerId: uid,
        providerName: data.name,
        providerEmail: data.email,
        categories: data.categories,
        services: data.services,
      });
    }
    return NextResponse.json({
      success: true,
      account: normalizeServiceAccount(uid, {
        ...(existing.data() || {}),
        ...data,
        accountType: type,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Could not save account",
      },
      { status: 400 },
    );
  }
}
