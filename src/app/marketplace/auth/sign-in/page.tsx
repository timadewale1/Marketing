import { redirect } from "next/navigation";

export default function MarketplaceSignInRedirectPage() {
  redirect("/auth/sign-in?marketplace=1");
}
