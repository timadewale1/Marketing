import { NextResponse } from "next/server";
import { initFirebaseAdmin } from "@/lib/firebaseAdmin";

const PROFILE_COLLECTIONS = [
  "earners",
  "advertisers",
  "vendors",
  "customers",
] as const;

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
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    if (!email) {
      return NextResponse.json(
        { success: false, message: "Enter your existing Pamba email." },
        { status: 400 },
      );
    }

    let user;
    try {
      user = await admin.auth().getUserByEmail(email);
    } catch (error) {
      if ((error as { code?: string }).code === "auth/user-not-found") {
        return NextResponse.json(
          {
            success: false,
            message: "No existing Pamba account was found for this email.",
          },
          { status: 404 },
        );
      }
      throw error;
    }

    const serviceAccount = await dbAdmin
      .collection("serviceAccounts")
      .doc(user.uid)
      .get();
    if (serviceAccount.exists) {
      return NextResponse.json(
        {
          success: false,
          message: "This account already has a Skills & Services profile.",
        },
        { status: 409 },
      );
    }

    let source: Record<string, unknown> = {};
    for (const collection of PROFILE_COLLECTIONS) {
      const snap = await dbAdmin.collection(collection).doc(user.uid).get();
      if (snap.exists) {
        source = snap.data() || {};
        break;
      }
    }

    if (Object.keys(source).length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "No existing Pamba profile was found for this email.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      email: user.email || email,
      emailVerified: user.emailVerified,
      profile: {
        name: String(
          source.fullName ||
            source.name ||
            source.businessName ||
            source.companyName ||
            user.displayName ||
            "",
        ),
        email: user.email || email,
        phone: String(source.phone || source.phoneNumber || ""),
        location: String(source.location || ""),
        city: String(source.city || ""),
        state: String(source.state || ""),
      },
    });
  } catch (error) {
    console.error("[skills-services/signup/lookup]", error);
    return NextResponse.json(
      { success: false, message: "Could not find your Pamba account." },
      { status: 500 },
    );
  }
}
