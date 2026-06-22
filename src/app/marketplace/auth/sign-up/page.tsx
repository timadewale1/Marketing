import { redirect } from "next/navigation";

export default function MarketplaceSignUpRedirectPage() {
  redirect("/auth/sign-up?marketplace=1");
}
