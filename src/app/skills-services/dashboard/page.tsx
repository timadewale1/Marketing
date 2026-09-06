"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { PaymentSelector } from "@/components/payment-selector";
import {
  SERVICE_PROVIDER_FEE,
  type ServiceAccount,
} from "@/lib/service-marketplace";
import toast from "react-hot-toast";
import { onAuthStateChanged } from "firebase/auth";

export default function ServiceDashboard() {
  const router = useRouter();
  const [account, setAccount] = useState<ServiceAccount | null>(null);
  const [saved, setSaved] = useState<ServiceAccount[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const token = async () =>
    auth.currentUser?.getIdToken() || Promise.resolve("");
  const load = async () => {
    const t = await token();
    const headers = { Authorization: `Bearer ${t}` };
    const [a, s] = await Promise.all([
      fetch("/api/skills-services/account", { headers }),
      fetch("/api/skills-services/connections", { headers }),
    ]);
    const ad = await a.json();
    const sd = await s.json();
    setAccount(ad.account);
    setSaved(sd.providers || []);
    setLoading(false);
  };
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/skills-services/sign-in");
        return;
      }
      void load();
    });
    return () => unsubscribe();
  }, [router]);
  const activate = async (reference: string) => {
    const t = await token();
    const res = await fetch("/api/skills-services/payment/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${t}`,
      },
      body: JSON.stringify({ reference }),
    });
    const data = await res.json();
    if (!res.ok || !data.completed)
      throw new Error(data.message || "Payment pending");
    toast.success("Service account activated");
    await load();
  };
  if (loading)
    return <main className="p-12 text-center">Loading dashboard...</main>;
  if (!account)
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-3xl font-black">Finish your service account</h1>
        <p className="mt-2 text-stone-600">
          Complete onboarding before accessing your dashboard.
        </p>
        <Link
          href="/skills-services/onboarding"
          className="mt-6 inline-block rounded-xl bg-amber-500 px-5 py-3 font-bold text-stone-900"
        >
          Start onboarding
        </Link>
      </main>
    );
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[.18em] text-amber-700">
            Service account
          </p>
          <h1 className="mt-2 text-3xl font-black">Hello, {account.name}</h1>
          <p className="mt-2 text-stone-600">
            Manage your public profile and connections from here.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/skills-services/onboarding"
            className="rounded-xl border border-amber-300 px-4 py-3 text-sm font-bold text-amber-800"
          >
            Edit profile
          </Link>
          <Link
            href="/skills-services"
            className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-stone-900"
          >
            Browse directory
          </Link>
        </div>
      </div>
      {account.accountType === "provider" && !account.activationPaid && (
        <div className="mt-8 rounded-3xl bg-stone-900 p-6 text-white">
          <p className="text-sm font-bold uppercase tracking-[.15em] text-amber-400">
            One-time activation
          </p>
          <h2 className="mt-2 text-2xl font-black">
            Make your profile discoverable
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">
            Pay ₦{SERVICE_PROVIDER_FEE.toLocaleString()} once to activate your
            provider profile. Your listing will appear in the public directory
            after payment confirmation.
          </p>
          <button
            onClick={() => setPayOpen(true)}
            className="mt-5 rounded-xl bg-amber-500 px-5 py-3 font-bold text-stone-900"
          >
            Activate service account
          </button>
          <PaymentSelector
            open={payOpen}
            amount={SERVICE_PROVIDER_FEE}
            description="PAMBA Skills & Services provider activation"
            onClose={() => setPayOpen(false)}
            onMonnifyReferenceCreated={async (reference) => {
              const t = await token();
              await fetch("/api/skills-services/payment/register-reference", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${t}`,
                },
                body: JSON.stringify({
                  reference,
                  feeType: "provider_activation",
                }),
              });
            }}
            onPaymentSuccess={async (reference) => {
              setPayOpen(false);
              await activate(reference);
            }}
          />
        </div>
      )}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">Profile views</p>
          <p className="mt-2 text-3xl font-black">
            {account.profileViews || 0}
          </p>
        </div>
        <div className="rounded-3xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">Connections unlocked</p>
          <p className="mt-2 text-3xl font-black">
            {account.connectionCount || 0}
          </p>
        </div>
        <div className="rounded-3xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">Account status</p>
          <p className="mt-2 text-xl font-black text-amber-700">
            {account.accountType === "provider"
              ? account.activationPaid
                ? "Live"
                : "Pending activation"
              : "Customer"}
          </p>
        </div>
      </div>
      {account.accountType === "customer" && (
        <section className="mt-10">
          <h2 className="text-2xl font-black">Saved service providers</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {saved.length ? (
              saved.map((provider) => (
                <Link
                  key={provider.id}
                  href={`/skills-services/providers/${provider.id}`}
                  className="rounded-3xl border border-stone-200 bg-white p-5"
                >
                  <p className="font-black">{provider.name}</p>
                  <p className="mt-2 text-sm text-stone-500">
                    {provider.location || provider.state}
                  </p>
                  <p className="mt-4 text-sm font-bold text-amber-700">
                    View contact
                  </p>
                </Link>
              ))
            ) : (
              <p className="text-stone-500">
                Providers you connect with will appear here.
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
