import { NextResponse } from "next/server"
import { db } from "@/lib/firebase"
import { collection, addDoc } from "firebase/firestore"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { reference, campaignData } = body

    // Call Paystack Verify API
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, // 👈 Secret key (NOT public key)
        },
      }
    )

    const verifyData = await verifyRes.json()

    if (
      verifyData.status &&
      verifyData.data.status === "success" &&
      verifyData.data.amount >= campaignData.budget * 100
    ) {
      // Save campaign to Firestore
      await addDoc(collection(db, "campaigns"), campaignData)

      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json(
        { success: false, message: "Payment verification failed" },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error("Verify payment error:", error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
