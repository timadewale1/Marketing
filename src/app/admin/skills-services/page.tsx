"use client";
import { useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  Users,
  CheckCircle,
  Ban,
  Eye,
  Search,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  AdminPageHeader,
  MetricCard,
  SectionCard,
  StatusBadge,
} from "@/app/admin/_components/admin-primitives";

type Row = {
  id: string;
  accountType: string;
  name: string;
  email: string;
  phone: string;
  activationPaid?: boolean;
  onboardingComplete?: boolean;
  status?: string;
  profileViews?: number;
  connectionCount?: number;
};
export default function AdminSkillsServices() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"all" | "provider" | "customer">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const load = async () => {
    const res = await fetch("/api/admin/skills-services", {
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data.message || "Could not load accounts");
    setRows(data.accounts || []);
  };
  useEffect(() => {
    void load();
  }, []);
  const update = async (id: string, status: string) => {
    const res = await fetch("/api/admin/skills-services", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      toast.success("Account updated");
      await load();
    }
  };
  const providers = rows.filter((r) => r.accountType === "provider");
  const filteredRows = rows.filter((row) => {
    const matchesType = filter === "all" || row.accountType === filter;
    const needle = search.trim().toLowerCase();
    const matchesSearch =
      !needle ||
      [row.name, row.email, row.phone].join(" ").toLowerCase().includes(needle);
    return matchesType && matchesSearch;
  });
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Skills & Services"
        title="Service directory"
        description="Review provider and customer accounts, activation status and profile activity."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Providers"
          value={providers.length}
          hint="All provider profiles"
          icon={BriefcaseBusiness}
        />
        <MetricCard
          label="Live providers"
          value={providers.filter((r) => r.activationPaid).length}
          hint="Paid and discoverable"
          icon={CheckCircle}
          tone="emerald"
        />
        <MetricCard
          label="Customers"
          value={rows.filter((r) => r.accountType === "customer").length}
          hint="Service account customers"
          icon={Users}
          tone="blue"
        />
      </div>
      <SectionCard
        title="Accounts"
        description="Review full provider and customer records, then suspend or restore accounts."
      >
        <div className="mb-5 flex flex-col gap-3 md:flex-row">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3">
            <Search size={16} className="text-stone-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email or phone"
              className="w-full bg-transparent py-2.5 text-sm outline-none"
            />
          </label>
          <div className="flex rounded-xl border border-stone-200 bg-stone-50 p-1">
            {(["all", "provider", "customer"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize ${filter === value ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"}`}
              >
                {value === "all" ? "All" : `${value}s`}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {filteredRows.map((row) => (
            <div
              key={row.id}
              className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{row.name}</p>
                  <StatusBadge
                    label={row.accountType}
                    tone={row.accountType === "provider" ? "green" : "blue"}
                  />
                  {row.accountType === "provider" && (
                    <StatusBadge
                      label={row.activationPaid ? "active" : "unpaid"}
                      tone={row.activationPaid ? "green" : "amber"}
                    />
                  )}
                </div>
                <p className="mt-1 text-sm text-stone-600">
                  {row.email} • {row.phone}
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  Views: {row.profileViews || 0} • Connections:{" "}
                  {row.connectionCount || 0}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(row)}
                  className="rounded-xl border border-stone-200 px-3 py-2 text-sm font-bold text-stone-700"
                >
                  <Eye size={14} className="mr-1 inline" />
                  Details
                </button>
                {row.status !== "suspended" ? (
                  <button
                    onClick={() => void update(row.id, "suspended")}
                    className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-bold text-rose-700"
                  >
                    <Ban size={14} className="mr-1 inline" />
                    Suspend
                  </button>
                ) : (
                  <button
                    onClick={() => void update(row.id, "active")}
                    className="rounded-xl border border-emerald-200 px-3 py-2 text-sm font-bold text-emerald-700"
                  >
                    Restore
                  </button>
                )}
              </div>
            </div>
          ))}
          {filteredRows.length === 0 && (
            <p className="rounded-2xl border border-dashed border-stone-300 px-5 py-10 text-center text-sm text-stone-500">
              No matching service accounts.
            </p>
          )}
        </div>
      </SectionCard>
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/40 p-4 md:items-center">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.18em] text-stone-500">
                  Service account details
                </p>
                <h2 className="mt-1 text-2xl font-black text-stone-900">
                  {selected.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-full p-2 text-stone-500 hover:bg-stone-100"
                aria-label="Close details"
              >
                <X size={20} />
              </button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                ["Account type", selected.accountType],
                ["Email", selected.email],
                ["Phone", selected.phone],
                [
                  "Onboarding",
                  selected.onboardingComplete ? "Complete" : "Incomplete",
                ],
                ["Activation", selected.activationPaid ? "Paid" : "Not paid"],
                ["Profile views", String(selected.profileViews || 0)],
                ["Connections", String(selected.connectionCount || 0)],
                ["Moderation status", selected.status || "active"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-stone-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    {label}
                  </p>
                  <p className="mt-1 break-words font-bold text-stone-900">
                    {value}
                  </p>
                </div>
              ))}
            </div>
            {selected.accountType === "provider" && (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Provider profile moderation should confirm identity information,
                service description, portfolio content, and activation payment
                before promotion.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
