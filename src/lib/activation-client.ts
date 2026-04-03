"use client"

import { auth } from "@/lib/firebase"

export async function registerActivationReference({
  role,
  reference,
  provider = "monnify",
}: {
  role: "earner" | "advertiser"
  reference: string
  provider?: "monnify" | "paystack"
}) {
  const user = auth.currentUser
  if (!user) {
    throw new Error("You must be signed in to prepare activation")
  }

  const idToken = await user.getIdToken()
  const response = await fetch("/api/activation/register-reference", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      userId: user.uid,
      role,
      reference,
      provider,
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data?.success) {
    throw new Error(data?.message || "Failed to prepare activation")
  }
}
