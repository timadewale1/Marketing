import { NextResponse } from "next/server";
import { initFirebaseAdmin } from "@/lib/firebaseAdmin";
import { normalizeServiceAccount } from "@/lib/service-marketplace";

export async function GET(req: Request) {
  try {
    const { dbAdmin } = await initFirebaseAdmin();
    if (!dbAdmin)
      return NextResponse.json(
        { success: false, message: "Service unavailable" },
        { status: 500 },
      );
    const url = new URL(req.url);
    const search = String(url.searchParams.get("q") || "")
      .trim()
      .toLowerCase();
    const category = String(url.searchParams.get("category") || "").trim();
    const location = String(url.searchParams.get("location") || "")
      .trim()
      .toLowerCase();
    const snap = await dbAdmin
      .collection("serviceAccounts")
      .where("accountType", "==", "provider")
      .where("activationPaid", "==", true)
      .limit(200)
      .get();
    const providers = snap.docs
      .map((item) => normalizeServiceAccount(item.id, item.data()))
      .filter((provider) => {
        const haystack = [
          provider.name,
          provider.bio,
          ...(provider.skills || []),
          ...(provider.services || []),
          ...(provider.categories || []),
        ]
          .join(" ")
          .toLowerCase();
        return (
          (!search || haystack.includes(search)) &&
          (!category || (provider.categories || []).includes(category)) &&
          (!location ||
            [provider.location, provider.city, provider.state]
              .join(" ")
              .toLowerCase()
              .includes(location))
        );
      })
      .map(({ email, phone, whatsapp, ...publicProfile }) => publicProfile);
    return NextResponse.json({ success: true, providers });
  } catch (error) {
    console.error("[skills-services/providers]", error);
    return NextResponse.json(
      { success: false, message: "Could not load providers" },
      { status: 500 },
    );
  }
}
