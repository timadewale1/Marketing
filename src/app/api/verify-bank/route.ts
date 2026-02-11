import { NextResponse } from "next/server"
import { NIGERIAN_BANKS } from "@/lib/banks"

// Build bank code mappings from NIGERIAN_BANKS
const BANK_CODES: Record<string, string> = NIGERIAN_BANKS.reduce((acc, bank) => {
  acc[bank.code] = bank.name
  return acc
}, {} as Record<string, string>)

export async function POST(req: Request) {
  try {
    const { accountNumber, bankCode } = await req.json()

    if (!accountNumber || !bankCode) {
      return NextResponse.json(
        { status: false, message: "Missing account number or bank code" },
        { status: 400 }
      )
    }

    // Validate account number format (10–13 digits)
    const accountRegex = /^\d{10,13}$/
    if (!accountRegex.test(accountNumber)) {
      return NextResponse.json(
        { status: false, message: "Invalid account number format" },
        { status: 400 }
      )
    }

    // Validate bank code
    const bankName = BANK_CODES[bankCode]
    if (!bankName) {
      return NextResponse.json(
        { status: false, message: "Invalid bank code" },
        { status: 400 }
      )
    }

    let accountName: string | null = null

    /**
     * 🔐 Attempt Monnify account resolution
     */
    try {
      const apiKey =
        process.env.MONNIFY_API_KEY ||
        process.env.MONNIFY_CONSUMER_KEY ||
        process.env.MONNIFY_CLIENT_ID

      const secret =
        process.env.MONNIFY_SECRET_KEY ||
        process.env.MONNIFY_CONSUMER_SECRET ||
        process.env.MONNIFY_CLIENT_SECRET

      if (apiKey && secret) {
        const auth = Buffer.from(`${apiKey}:${secret}`).toString("base64")
        const base = process.env.MONNIFY_BASE_URL || "https://sandbox.monnify.com"

        // 1️⃣ Authenticate
        const authRes = await fetch(`${base}/api/v1/auth/login`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
          },
        })

        const authRaw = await authRes.text()
        const authJson = JSON.parse(authRaw)

        const token = authJson?.responseBody?.accessToken
        if (!token) {
          console.warn("Monnify auth failed:", authRaw)
          throw new Error("Unable to authenticate with Monnify")
        }

        // 2️⃣ Validate account
      const validateRes = await fetch(
  `${base}/api/v1/disbursements/account/validate?accountNumber=${accountNumber}&bankCode=${bankCode}`,
  {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  }
)


        // ✅ READ BODY ONCE
        const raw = await validateRes.text()

        let data: Record<string, unknown> | null = null
        try {
          data = JSON.parse(raw)
        } catch {
          data = null
        }

        if (validateRes.ok && data?.requestSuccessful) {
          const responseBody = data?.responseBody as Record<string, unknown> | undefined
          accountName = (responseBody?.accountName as string) || null

          if (!accountName) {
            console.warn(
              "Monnify response missing accountName:",
              raw
            )
          }
        } else {
          console.warn(
            "Monnify account validation failed",
            validateRes.status,
            raw
          )
        }
      } else {
        console.warn(
          "Monnify credentials not configured; skipping remote account resolution"
        )
      }
    } catch (error) {
      console.warn("Monnify account validation error:", error)
    }

    console.log(`Bank verification: Account ${accountNumber} with ${bankName}`)

    return NextResponse.json({
      status: true,
      data: {
        account_number: accountNumber,
        account_name: accountName, // may be null
        bank_name: bankName,
        bank_code: bankCode,
      },
    })
  } catch (err) {
    console.error("Verify Bank API error:", err)
    return NextResponse.json(
      { status: false, message: "Internal server error" },
      { status: 500 }
    )
  }
}
