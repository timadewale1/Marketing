"use client"

import { auth } from "@/lib/firebase"

export async function registerWalletFundingReference({
  reference,
  amount,
  provider = "monnify",
}: {
  reference: string
  amount: number
  provider?: "monnify" | "paystack"
}) {
  const user = auth.currentUser
  if (!user) {
    throw new Error("You must be signed in to prepare wallet funding")
  }

  const idToken = await user.getIdToken()
  const response = await fetch("/api/wallet/register-funding-reference", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      userId: user.uid,
      reference,
      amount,
      provider,
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data?.success) {
    throw new Error(data?.message || "Failed to prepare wallet funding")
  }
}
