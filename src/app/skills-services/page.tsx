"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  MapPin,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  SERVICE_CATEGORIES,
  type ServiceAccount,
} from "@/lib/service-marketplace";

export default function SkillsServicesPage() {
  const [providers, setProviders] = useState<ServiceAccount[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(
      `/api/skills-services/providers?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}&location=${encodeURIComponent(location)}`,
      { signal: controller.signal },
    )
      .then((r) => r.json())
      .then((d) => setProviders(d.providers || []))
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [q, category, location]);
  return (
    <main>
      <section className="overflow-hidden bg-stone-100 text-stone-900">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:py-28">
          <div>
            <h1 className="max-w-3xl text-4xl font-black leading-[1.02] tracking-tight sm:text-6xl">
              Have a skill?{" "}
              <span className="text-amber-500">Get customers.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-600">
              Find skilled people, professionals and independent service
              providers around you. PAMBA connects you; you agree on the work
              and price directly.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/skills-services/sign-up?type=provider"
                className="rounded-full bg-amber-500 px-6 py-3 font-bold text-stone-900 shadow-lg shadow-amber-200"
              >
                List your service{" "}
                <ArrowRight className="ml-2 inline" size={17} />
              </Link>
              <Link
                href="/skills-services/sign-up?type=customer"
                className="rounded-full border border-stone-300 bg-white px-6 py-3 font-bold text-stone-800"
              >
                Hire a service provider
              </Link>
            </div>
          </div>
          <div className="rounded-[2rem] border border-amber-100 bg-white p-5 shadow-xl shadow-amber-100">
            <div className="rounded-[1.5rem] bg-stone-900 p-5 text-white">
              <p className="text-sm font-bold text-amber-400">
                A better way to find help
              </p>
              <div className="mt-5 space-y-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-white">
                    1
                  </span>
                  <div>
                    <p className="font-bold">Browse real profiles</p>
                    <p className="text-sm text-stone-300">
                      See experience, location and past work.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500 text-stone-900">
                    2
                  </span>
                  <div>
                    <p className="font-bold">Unlock contact details</p>
                    <p className="text-sm text-stone-300">
                      Pay a one-time ₦1,000 connection fee.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500 text-stone-900">
                    3
                  </span>
                  <div>
                    <p className="font-bold">Talk and agree directly</p>
                    <p className="text-sm text-stone-300">
                      PAMBA does not hold your service payment.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl gap-3 overflow-x-auto px-4 py-4 sm:px-6">
          {SERVICE_CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${category === item ? "bg-amber-500 text-stone-900" : "bg-stone-100 text-stone-600 hover:bg-amber-50"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[.2em] text-amber-700">
              The directory
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">
              Find the right person
            </h2>
          </div>
          <div className="rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-stone-600 shadow-sm">
            <ShieldCheck size={16} className="mr-1 inline text-amber-600" />
            Verified listings
          </div>
        </div>
        <div className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm md:grid-cols-[1.5fr_1fr_1fr]">
          <label className="flex items-center gap-2 rounded-xl bg-[#f4f7f1] px-3">
            <Search size={18} className="text-[#668072]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search skills, services or names"
              className="w-full bg-transparent py-3 text-sm outline-none"
            />
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl bg-[#f4f7f1] px-3 py-3 text-sm outline-none"
          >
            <option value="">All categories</option>
            {SERVICE_CATEGORIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location"
            className="rounded-xl bg-[#f4f7f1] px-3 py-3 text-sm outline-none"
          />
        </div>
        <div className="mt-8">
          {loading ? (
            <p className="py-16 text-center text-stone-500">
              Loading providers...
            </p>
          ) : providers.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#b7c9bd] px-6 py-16 text-center">
              <UserRound className="mx-auto text-[#668072]" size={30} />
              <p className="mt-3 font-bold">No providers match yet</p>
              <p className="mt-1 text-sm text-stone-500">
                Try a different search or be the first to list this service.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {providers.map((provider) => (
                <Link
                  key={provider.id}
                  href={`/skills-services/providers/${provider.id}`}
                  className="group rounded-3xl border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="flex items-start justify-between">
                    <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl bg-amber-100 text-xl font-black text-amber-800">
                      {provider.profileImageUrl ? (
                        <img src={provider.profileImageUrl} alt={`${provider.name} profile`} className="h-full w-full object-cover" />
                      ) : provider.name.slice(0, 1).toUpperCase()}
                    </div>
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                      Available
                    </span>
                  </div>
                  <h3 className="mt-5 text-xl font-black">{provider.name}</h3>
                  <p className="mt-1 flex items-center gap-1 text-sm text-stone-500">
                    <MapPin size={14} />
                    {provider.location || provider.state || "Nigeria"}
                  </p>
                  <p className="mt-4 line-clamp-2 text-sm leading-6 text-stone-500">
                    {provider.bio ||
                      (provider.services || provider.skills || []).join(", ") ||
                      "Skilled service provider"}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {(provider.skills || []).slice(0, 3).map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-[#f4f7f1] px-2.5 py-1 text-xs font-semibold text-[#4d6256]"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                  <span className="mt-5 inline-flex items-center font-bold text-amber-700">
                    View profile{" "}
                    <ArrowRight
                      size={15}
                      className="ml-1 transition group-hover:translate-x-1"
                    />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
