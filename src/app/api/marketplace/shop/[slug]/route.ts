import { NextResponse } from "next/server"
import { initFirebaseAdmin } from "@/lib/firebaseAdmin"

export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params
    const normalized = String(slug || "").trim().toLowerCase()
    if (!normalized) return NextResponse.json({ success: false, message: "Missing shop slug" }, { status: 400 })

    const { dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin) return NextResponse.json({ success: false, message: "Firebase admin unavailable" }, { status: 500 })

    const vendorBySlug = await dbAdmin
      .collection("vendors")
      .where("storefrontSlug", "==", normalized)
      .limit(1)
      .get()

    if (vendorBySlug.empty) {
      return NextResponse.json({ success: false, message: "Shop not found" }, { status: 404 })
    }

    const vendorDoc = vendorBySlug.docs[0]
    return NextResponse.json({ success: true, vendorId: vendorDoc.id })
  } catch (error) {
    console.error("[marketplace][shop] load error:", error)
    return NextResponse.json({ success: false, message: "Failed to load shop" }, { status: 500 })
  }
}
