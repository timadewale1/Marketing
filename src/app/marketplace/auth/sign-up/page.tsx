import { redirect } from "next/navigation"

export default async function MarketplaceSignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const roleRaw = params?.role
  const role = Array.isArray(roleRaw) ? roleRaw[0] : roleRaw
  const safeRole = role === "vendor" || role === "customer" ? `&role=${role}` : ""
  redirect(`/auth/sign-up?marketplace=1${safeRole}`)
}
