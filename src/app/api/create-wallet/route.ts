import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const { email, name, phone } = await req.json()

    // ✅ Check if we’re in dev or prod
    const isDev = process.env.NEXT_PUBLIC_ENV === "dev"

    if (isDev) {
      // 🔹 Return a fake wallet for testing
      return NextResponse.json({
        wallet: {
          account_number: "1234567890",
          bank: { name: "Test Bank" },
        },
        customer: {
          customer_code: "CUS_TEST123",
        },
        isTest: true,
      })
    }

    // ✅ Otherwise create a real Paystack DVA
    const res = await fetch("https://api.paystack.co/customer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        first_name: name.split(" ")[0],
        last_name: name.split(" ")[1] || "",
        phone,
      }),
    })

    const customer = await res.json()
    if (!customer.status) {
      throw new Error(customer.message || "Customer creation failed")
    }

    // Create a dedicated virtual account (DVA)
    const dvaRes = await fetch("https://api.paystack.co/dedicated_account", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer: customer.data.customer_code,
        preferred_bank: "wema-bank", // you can leave this out for random
      }),
    })

    const dva = await dvaRes.json()
    if (!dva.status) {
      throw new Error(dva.message || "Wallet creation failed")
    }

    return NextResponse.json({
      wallet: dva.data,
      customer: customer.data,
      isTest: false,
    })
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err))
    console.error("Wallet API error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
