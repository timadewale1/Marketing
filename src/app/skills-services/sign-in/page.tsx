"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import Link from "next/link";
import toast from "react-hot-toast";

function SignInForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      if (!cred.user.emailVerified) {
        toast.error("Verify your email before signing in");
        return;
      }
      const token = await cred.user.getIdToken();
      const res = await fetch("/api/skills-services/account", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.account)
        router.push(
          `/skills-services/onboarding?type=${params?.get("type") || "customer"}`,
        );
      else router.push(params?.get("returnTo") || "/skills-services/dashboard");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message.replace("Firebase: ", "")
          : "Could not sign in",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-[2rem] border border-stone-200 bg-white p-7 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[.18em] text-amber-700">
          PAMBA Skills & Services
        </p>
        <h1 className="mt-2 text-3xl font-black">Welcome back</h1>
        <p className="mt-2 text-stone-600">
          Sign in to manage your profile or connect with a provider.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <input
            required
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-amber-500"
          />
          <input
            required
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-amber-500"
          />
          <button
            disabled={loading}
            className="w-full rounded-xl bg-amber-500 px-5 py-3 font-bold text-stone-900 hover:bg-amber-400"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-stone-600">
          New here?{" "}
          <Link
            href="/skills-services/sign-up"
            className="font-bold text-amber-700"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
export default function SignInPage() {
  return (
    <Suspense fallback={<main className="p-10 text-center">Loading...</main>}>
      <SignInForm />
    </Suspense>
  );
}
