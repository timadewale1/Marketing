const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.pambaadverts.com"

type SupportedMode = "verifyEmail" | "resetPassword"

export function buildCustomFirebaseActionLink(
  firebaseLink: string,
  mode: SupportedMode,
  continuePath?: string
) {
  const parsed = new URL(firebaseLink)
  const oobCode = parsed.searchParams.get("oobCode")
  const apiKey = parsed.searchParams.get("apiKey")
  const lang = parsed.searchParams.get("lang")

  if (!oobCode || !apiKey) {
    throw new Error("Firebase action link is missing required parameters")
  }

  const customUrl = new URL("/auth/action", APP_URL)
  customUrl.searchParams.set("mode", mode)
  customUrl.searchParams.set("oobCode", oobCode)
  customUrl.searchParams.set("apiKey", apiKey)

  if (lang) {
    customUrl.searchParams.set("lang", lang)
  }

  if (continuePath) {
    customUrl.searchParams.set("continueUrl", new URL(continuePath, APP_URL).toString())
  }

  return customUrl.toString()
}
