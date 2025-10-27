import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const { accountNumber, bankCode } = await req.json()

    if (!accountNumber || !bankCode) {
      return NextResponse.json(
        { status: false, message: "Missing account number or bank code" },
        { status: 400 }
      )
    }

    const res = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, // use secret key here
          "Content-Type": "application/json",
        },
      }
    )

    const data = await res.json()

    if (!res.ok) {
      console.error('Bank verification failed:', data)
      return NextResponse.json(
        { status: false, message: "Could not verify bank account. Please check the details and try again." },
        { status: 400 }
      )
    }

    if (!data.status) {
      console.error('Bank verification error:', data)
      return NextResponse.json(
        { status: false, message: data.message || "Bank account verification failed" },
        { status: 400 }
      )
    }

    return NextResponse.json({ status: true, data: data.data })
  } catch (err) {
    console.error("Verify Bank API error:", err)
    return NextResponse.json(
      { status: false, message: "Internal server error" },
      { status: 500 }
    )
  }
}
