"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import {
  SERVICE_CONNECTION_FEE,
  SERVICE_ADMIN_WHATSAPP,
  type ServiceAccount,
} from "@/lib/service-marketplace";
import { PaymentSelector } from "@/components/payment-selector";
import toast from "react-hot-toast";

export default function ProviderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [provider, setProvider] = useState<ServiceAccount | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  useEffect(() => {
    const load = async () => {
      const headers: Record<string, string> = {};
      if (auth.currentUser)
        headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
      fetch(`/api/skills-services/providers/${id}`, { headers })
        .then((r) => r.json())
        .then((d) => {
          setProvider(d.provider || null);
          setConnected(Boolean(d.connected));
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    };
    void load();
  }, [id]);
  const pay = async (reference: string) => {
    const token = auth.currentUser?.getIdToken
      ? await auth.currentUser.getIdToken()
      : "";
    const res = await fetch("/api/skills-services/payment/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reference }),
    });
    const data = await res.json();
    if (!res.ok || !data.completed)
      throw new Error(data.message || "Payment is still being confirmed");
    setConnected(true);
    toast.success("Contact details unlocked");
  };
  if (loading)
    return (
      <main className="mx-auto max-w-5xl px-4 py-20 text-center">
        Loading profile...
      </main>
    );
  if (!provider)
    return (
      <main className="mx-auto max-w-5xl px-4 py-20 text-center">
        <p className="font-bold">Provider not found</p>
        <Link
          className="mt-4 inline-block text-amber-700"
          href="/skills-services"
        >
          Back to directory
        </Link>
      </main>
    );
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link
        href="/skills-services"
        className="inline-flex items-center gap-2 text-sm font-bold text-amber-700"
      >
        <ArrowLeft size={16} /> Back to directory
      </Link>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-3xl bg-amber-100 text-4xl font-black text-amber-800">
              {provider.profileImageUrl ? (
                <img src={provider.profileImageUrl} alt={`${provider.name} profile`} className="h-full w-full object-cover" />
              ) : provider.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-black">{provider.name}</h1>
                <ShieldCheck className="text-amber-600" size={20} />
              </div>
              <p className="mt-2 flex items-center gap-1 text-stone-500">
                <MapPin size={16} />
                {provider.location || provider.state || "Nigeria"}
              </p>
              <p className="mt-4 leading-7 text-stone-600">
                {provider.bio ||
                  "A skilled professional ready to discuss your project."}
              </p>
            </div>
          </div>
          <div className="mt-8 grid gap-6 border-t border-[#e4ece5] pt-7 md:grid-cols-2">
            <div>
              <h2 className="font-black">Skills & services</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {[...(provider.skills || []), ...(provider.services || [])].map(
                  (item) => (
                    <span
                      key={item}
                      className="rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700"
                    >
                      {item}
                    </span>
                  ),
                )}
              </div>
            </div>
            <div>
              <h2 className="font-black">Experience & availability</h2>
              <p className="mt-3 text-sm leading-7 text-stone-500">
                {provider.experience ||
                  "Experience details available on request."}
              </p>
              <p className="mt-2 text-sm font-semibold text-amber-700">
                {provider.availability || "Availability to be confirmed"}
              </p>
            </div>
          </div>
          <div className="mt-8">
            <h2 className="font-black">Past work</h2>
            {provider.portfolio?.length ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {provider.portfolio.map((item) => (
                  <a
                    key={item.url}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-2xl border border-stone-200 p-4 text-sm font-semibold text-amber-700"
                  >
                    <ExternalLink size={15} className="mr-2 inline" />
                    {item.caption || item.type}
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-stone-500">
                This provider has not added portfolio items yet.
              </p>
            )}
          </div>
        </section>
        <aside className="h-fit rounded-[2rem] bg-stone-900 p-6 text-white">
          <p className="text-sm font-bold uppercase tracking-[.15em] text-amber-400">
            Connect safely
          </p>
          <h2 className="mt-3 text-2xl font-black">
            Contact details are protected
          </h2>
          <p className="mt-3 text-sm leading-6 text-stone-300">
            Create or sign in to a service account, then pay the one-time ₦
            {SERVICE_CONNECTION_FEE.toLocaleString()} connection fee to unlock
            this provider.
          </p>
          {connected ? (
            <div className="mt-6 space-y-3 rounded-2xl bg-white/10 p-4">
              <p className="font-bold text-amber-400">Contact unlocked</p>
              {provider.phone && (
                <p>
                  <Phone size={15} className="mr-2 inline" />
                  {provider.phone}
                </p>
              )}
              {provider.whatsapp && (
                <a
                  href={provider.whatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="block"
                >
                  <MessageCircle size={15} className="mr-2 inline" />
                  WhatsApp
                </a>
              )}
              <a
                href={`https://wa.me/${SERVICE_ADMIN_WHATSAPP.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block rounded-xl bg-amber-500 px-4 py-3 text-center font-bold text-stone-900"
              >
                Message PAMBA admin first
              </a>
            </div>
          ) : (
            <>
              <Link
                href={`/skills-services/sign-in?returnTo=/skills-services/providers/${id}`}
                className="mt-6 block rounded-xl border border-white/30 px-4 py-3 text-center font-bold"
              >
                Sign in to connect
              </Link>
              <button
                onClick={() =>
                  auth.currentUser
                    ? setPayOpen(true)
                    : toast.error("Sign in first to unlock contact details")
                }
                className="mt-3 w-full rounded-xl bg-amber-500 px-4 py-3 font-bold text-stone-900"
              >
                Pay ₦{SERVICE_CONNECTION_FEE.toLocaleString()} connection fee
              </button>
            </>
          )}
          <PaymentSelector
            open={payOpen}
            amount={SERVICE_CONNECTION_FEE}
            description="PAMBA service provider connection fee"
            onClose={() => setPayOpen(false)}
            onMonnifyReferenceCreated={async (reference) => {
              const token = await auth.currentUser?.getIdToken();
              await fetch("/api/skills-services/payment/register-reference", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  reference,
                  feeType: "connection",
                  providerId: id,
                }),
              });
            }}
            onPaymentSuccess={async (reference) => {
              setPayOpen(false);
              await pay(reference);
            }}
          />
        </aside>
      </div>
    </main>
  );
}
