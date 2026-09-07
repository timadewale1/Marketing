"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, FileText, Mail, MapPin, Phone, Users } from "lucide-react";
import { AdminPageHeader, SectionCard, StatusBadge } from "@/app/admin/_components/admin-primitives";

type Account = {
  id: string; accountType: "provider" | "customer"; name: string; email: string; phone: string;
  location?: string; city?: string; state?: string; bio?: string; skills?: string[]; categories?: string[];
  services?: string[]; experience?: string; availability?: string; whatsapp?: string; contactPreference?: string;
  activationPaid?: boolean; activationPaidAt?: string | null; onboardingComplete?: boolean; profileViews?: number;
  connectionCount?: number; status?: string; createdAt?: string | null; updatedAt?: string | null;
  portfolio?: { url: string; type: string; caption?: string }[];
};
type Relationship = Record<string, unknown> & { provider?: Account | null; customer?: Account | null };
type Details = { account: Account; authUser: { emailVerified?: boolean; disabled?: boolean; creationTime?: string; lastSignInTime?: string } | null; payments: Record<string, unknown>[]; customerConnections: Relationship[]; providerConnections: Relationship[] };

function dateText(value: unknown) {
  if (!value) return "Not available";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
function Detail({ label, value }: { label: string; value: unknown }) {
  return <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p><p className="mt-1 break-words text-sm font-bold text-stone-900">{String(value || "Not provided")}</p></div>;
}
function Tags({ values }: { values?: string[] }) {
  return values?.length ? <div className="mt-2 flex flex-wrap gap-2">{values.map((value) => <span key={value} className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">{value}</span>)}</div> : <p className="mt-2 text-sm text-stone-500">None provided</p>;
}

export default function AdminSkillsServicesDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/admin/skills-services/${id}`, { cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Could not load details");
      setDetails(payload);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load details"));
  }, [id]);
  if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">{error}</div>;
  if (!details) return <div className="p-8 text-center text-stone-500">Loading service account details...</div>;
  const { account, authUser, payments, customerConnections, providerConnections } = details;
  const provider = account.accountType === "provider";
  const relationships = provider ? providerConnections : customerConnections;
  return <div className="space-y-6">
    <Link href="/admin/skills-services" className="inline-flex items-center gap-2 text-sm font-bold text-amber-700"><ArrowLeft size={16} /> Back to service directory</Link>
    <AdminPageHeader eyebrow={provider ? "Provider details" : "Customer details"} title={account.name || account.email} description="Complete Skills & Services account record, uploaded content, payment history, and access relationships." />
    <section className="rounded-3xl bg-stone-950 p-6 text-white shadow-xl sm:p-8"><div className="flex flex-col justify-between gap-5 md:flex-row"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-black">{account.name || "Unnamed account"}</h2><StatusBadge label={account.accountType} tone={provider ? "green" : "blue"} /><StatusBadge label={account.status || "active"} tone={account.status === "suspended" ? "red" : "green"} /></div><div className="mt-4 space-y-2 text-sm text-stone-300"><p><Mail size={15} className="mr-2 inline text-amber-300" />{account.email}</p><p><Phone size={15} className="mr-2 inline text-amber-300" />{account.phone || "No phone provided"}</p><p><MapPin size={15} className="mr-2 inline text-amber-300" />{account.location || account.city || account.state || "Location not provided"}</p></div></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-stone-400">Views</p><p className="mt-1 text-xl font-black">{account.profileViews || 0}</p></div><div className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-stone-400">Connections</p><p className="mt-1 text-xl font-black">{account.connectionCount || 0}</p></div><div className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-stone-400">Activated</p><p className="mt-1 text-xl font-black">{account.activationPaid ? "Yes" : "No"}</p></div><div className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-stone-400">Payments</p><p className="mt-1 text-xl font-black">{payments.length}</p></div></div></div></section>
    <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]"><div className="space-y-6">
      <SectionCard title="Profile and account information" description="The complete information submitted by this account."><div className="grid gap-3 sm:grid-cols-2"><Detail label="Account ID" value={account.id} /><Detail label="Account type" value={account.accountType} /><Detail label="City" value={account.city} /><Detail label="State" value={account.state} /><Detail label="Experience" value={account.experience} /><Detail label="Availability" value={account.availability} /><Detail label="WhatsApp" value={account.whatsapp} /><Detail label="Contact preference" value={account.contactPreference} /><Detail label="Onboarding" value={account.onboardingComplete ? "Complete" : "Incomplete"} /><Detail label="Activation paid" value={account.activationPaid ? dateText(account.activationPaidAt) : "Not paid"} /><Detail label="Created" value={dateText(account.createdAt)} /><Detail label="Last updated" value={dateText(account.updatedAt)} /></div><div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Bio / description</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">{account.bio || "No description provided."}</p></div></SectionCard>
      {provider && <SectionCard title="Services, skills, and categories" description="Everything the provider used to describe their offering."><div className="space-y-4"><div><p className="text-sm font-black">Categories</p><Tags values={account.categories} /></div><div><p className="text-sm font-black">Skills</p><Tags values={account.skills} /></div><div><p className="text-sm font-black">Services</p><Tags values={account.services} /></div></div></SectionCard>}
      {provider && <SectionCard title="Uploaded portfolio and work samples" description="Files and links submitted during onboarding.">{account.portfolio?.length ? <div className="grid gap-3 sm:grid-cols-2">{account.portfolio.map((item, index) => <a key={`${item.url}-${index}`} href={item.url} target="_blank" rel="noreferrer" className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm hover:border-amber-300"><FileText className="mt-0.5 shrink-0 text-amber-600" size={18} /><span className="min-w-0"><strong className="block text-stone-900">{item.caption || `Portfolio ${index + 1}`}</strong><span className="mt-1 block break-all text-xs text-stone-500">{item.type}: {item.url}</span><ExternalLink size={13} className="mt-2 text-amber-700" /></span></a>)}</div> : <p className="text-sm text-stone-500">No portfolio items uploaded.</p>}</SectionCard>}
    </div><div className="space-y-6">
      <SectionCard title="Authentication and access" description="Firebase account status and sign-in metadata."><div className="space-y-3"><Detail label="Email verified" value={authUser?.emailVerified ? "Yes" : "No"} /><Detail label="Auth account disabled" value={authUser?.disabled ? "Yes" : "No"} /><Detail label="Created in Auth" value={dateText(authUser?.creationTime)} /><Detail label="Last sign-in" value={dateText(authUser?.lastSignInTime)} /></div></SectionCard>
      <SectionCard title="Payment history" description="Activation and connection payments linked to this account.">{payments.length ? <div className="space-y-3">{payments.map((payment) => <div key={String(payment.id)} className="rounded-2xl border border-stone-200 bg-stone-50 p-4"><div className="flex items-center justify-between gap-3"><p className="font-bold">{String(payment.feeType || "Service payment")}</p><span className="font-black text-amber-700">₦{Number(payment.amount || 0).toLocaleString()}</span></div><p className="mt-1 break-all text-xs text-stone-500">{String(payment.status || "unknown")} • {String(payment.reference || payment.id)}</p><p className="mt-1 text-xs text-stone-500">{dateText(payment.paidAt || payment.createdAt)}</p></div>)}</div> : <p className="text-sm text-stone-500">No service payments found.</p>}</SectionCard>
      <SectionCard title={provider ? "Customers with access" : "Providers accessed"} description={provider ? "Customers who completed connection payment for this provider." : "Providers this customer paid to contact."}>{relationships.length ? <div className="space-y-3">{relationships.map((connection) => { const person = provider ? connection.customer : connection.provider; return <div key={String(connection.id)} className="rounded-2xl border border-stone-200 bg-stone-50 p-4"><div className="flex items-center gap-2"><Users size={16} className="text-amber-600" /><p className="font-bold">{person?.name || person?.email || "Account unavailable"}</p></div><p className="mt-1 text-xs text-stone-500">{person?.email || "No email"} • {dateText(connection.paidAt)}</p><p className="mt-2 text-xs font-semibold text-emerald-700">Status: {String(connection.status || "unknown")}</p></div> })}</div> : <p className="text-sm text-stone-500">No paid connections found.</p>}</SectionCard>
    </div></div>
  </div>;
}
