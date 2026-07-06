import { redirect } from "next/navigation"

export default function MarketplaceSignInPage() {
  redirect("/auth/sign-in?marketplace=1")
}
