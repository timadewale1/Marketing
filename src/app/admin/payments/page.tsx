"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, CheckCircle2, RefreshCw, Search, ShieldCheck, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminPageHeader, EmptyState, MetricCard, SectionCard, StatusBadge } from "@/app/admin/_components/admin-primitives";

type PaymentScope = "activation" | "wallet_funding" | "campaign_payment" | "recovery";

type PaymentLog = {
  id: string;
  scope: PaymentScope;
  status: string;
  source: string;
  provider: string;
  role: string;
  userId: string;
  name: string;
  email: string;
  reference: string;
  references: string[];
  amount: number;
  transactionId: string;
  createdAt: string | null;
  createdAtMs: number;
  fulfilled: boolean;
  details: Record<string, unknown>;
};

type PageInfo = {
  hasMore: boolean;
  cursorCreatedAt: string | null;
  cursorId: string | null;
};

const DEFAULT_PAGE_SIZE = 20;

function currency(amount: number) {
  return `₦${amount.toLocaleString()}`;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Unknown date";
}

export default function AdminPaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [items, setItems] = useState<PaymentLog[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo>({ hasMore: false, cursorCreatedAt: null, cursorId: null });
  const [history, setHistory] = useState<PageInfo[]>([]);
  const [filters, setFilters] = useState({
    scope: "all",
    status: "all",
    search: "",
  });

  const load = async (cursor?: PageInfo | null, showToast = false) => {
    try {
      setRefreshing(true);
      const params = new URLSearchParams({
        pageSize: String(DEFAULT_PAGE_SIZE),
        scope: filters.scope,
        status: filters.status,
        search: filters.search.trim(),
      });
      if (cursor?.cursorCreatedAt && cursor?.cursorId) {
        params.set("cursorCreatedAt", cursor.cursorCreatedAt);
        params.set("cursorId", cursor.cursorId);
      }
      const response = await fetch(`/api/admin/payments?${params.toString()}`, {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load payments");
      }
      setItems((data.items || []) as PaymentLog[]);
      setPageInfo((data.pageInfo || { hasMore: false, cursorCreatedAt: null, cursorId: null }) as PageInfo);
      if (showToast) {
        toast.success("Payments refreshed");
      }
    } catch (error) {
      console.error("Failed to load payments", error);
      toast.error(error instanceof Error ? error.message : "Failed to load payments");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setHistory([]);
    setLoading(true);
    void load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.scope, filters.status, filters.search]);

  const metrics = useMemo(() => {
    const activation = items.filter((item) => item.scope === "activation");
    const wallet = items.filter((item) => item.scope === "wallet_funding");
    return {
      visible: items.length,
      fulfilled: items.filter((item) => item.fulfilled).length,
      activation: activation.length,
      wallet: wallet.length,
      totalAmount: items.reduce((sum, item) => sum + Math.max(0, item.amount), 0),
    };
  }, [items]);

  const handleNext = async () => {
    if (!pageInfo.hasMore) return;
    setHistory((current) => [...current, pageInfo]);
    setLoading(true);
    await load(pageInfo);
  };

  const handlePrev = async () => {
    if (history.length === 0) return;
    const nextHistory = [...history];
    const previous = nextHistory.pop() || null;
    setHistory(nextHistory);
    setLoading(true);
    await load(previous);
  };

  const resolvePayment = async (payment: PaymentLog) => {
    try {
      setResolvingId(payment.id);
      const response = await fetch("/api/admin/payments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId: payment.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to resolve payment");
      }
      toast.success(data.message || "Payment resolved");
      await load(history[history.length - 1] || null);
    } catch (error) {
      console.error("Failed to resolve payment", error);
      toast.error(error instanceof Error ? error.message : "Failed to resolve payment");
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Payments"
        title="Platform payments"
        description="Track activation fees, wallet funding, and other payment events page by page. Only unresolved items show action buttons, so we keep reads low and the queue focused."
        action={
          <Button variant="outline" className="rounded-full border-stone-300 bg-white/80" disabled={refreshing} onClick={() => void load(history[history.length - 1] || null, true)}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Visible rows" value={metrics.visible} hint="Current page only" icon={ArrowLeftRight} />
        <MetricCard label="Fulfilled" value={metrics.fulfilled} hint="Already completed" icon={CheckCircle2} tone="emerald" />
        <MetricCard label="Activation" value={metrics.activation} hint="Current page activation rows" icon={ShieldCheck} tone="blue" />
        <MetricCard label="Wallet funding" value={metrics.wallet} hint="Current page wallet rows" icon={Wallet} tone="amber" />
      </div>

      <SectionCard title="Filters" description="Search uses exact email, reference, or user ID. The queue is fetched page by page for lower read cost.">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr_1fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Search by email, reference, or user ID"
              className="h-11 rounded-2xl border-stone-200 bg-white pl-10"
            />
          </div>
          <Select value={filters.scope} onValueChange={(value) => setFilters((current) => ({ ...current, scope: value }))}>
            <SelectTrigger className="h-11 rounded-2xl border-stone-200 bg-white">
              <SelectValue placeholder="Scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All scopes</SelectItem>
              <SelectItem value="activation">Activation</SelectItem>
              <SelectItem value="wallet_funding">Wallet funding</SelectItem>
              <SelectItem value="campaign_payment">Campaign payment</SelectItem>
              <SelectItem value="recovery">Recovery</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.status} onValueChange={(value) => setFilters((current) => ({ ...current, status: value }))}>
            <SelectTrigger className="h-11 rounded-2xl border-stone-200 bg-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="pending_confirmation">Pending confirmation</SelectItem>
              <SelectItem value="manual_check">Manual check</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
            Page-by-page loading keeps the queue light while still letting admin resolve stuck items immediately.
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Payment queue"
        description={loading ? "Loading payments..." : `${items.length} payment${items.length === 1 ? "" : "s"} loaded on this page.`}
      >
        {loading ? (
          <div className="h-56 animate-pulse rounded-3xl bg-stone-100" />
        ) : items.length === 0 ? (
          <EmptyState
            title="No payments found"
            description="Try widening the filters or searching by a full email or reference."
          />
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge label={item.scope.replaceAll("_", " ")} tone={item.scope === "activation" ? "blue" : item.scope === "wallet_funding" ? "amber" : "stone"} />
                        <StatusBadge label={item.fulfilled ? "fulfilled" : "needs action"} tone={item.fulfilled ? "green" : "amber"} />
                        <StatusBadge label={item.status || "unknown"} tone={item.fulfilled ? "green" : "stone"} />
                      </div>
                      <p className="text-lg font-semibold text-stone-900">{currency(item.amount)}</p>
                      <p className="text-sm text-stone-600">{item.name || "Unknown user"} • {item.email || "No email"}</p>
                      <p className="text-xs text-stone-500">{item.reference || "No reference"}</p>
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-400">{formatDate(item.createdAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.scope === "activation" || item.scope === "wallet_funding" ? (
                        <Button
                          className="rounded-full bg-stone-900 text-white hover:bg-stone-800"
                          disabled={item.fulfilled || resolvingId === item.id}
                          onClick={() => void resolvePayment(item)}
                        >
                          {resolvingId === item.id ? "Resolving..." : item.scope === "activation" ? "Activate now" : "Credit now"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm">
              <p className="text-stone-600">
                Showing {items.length > 0 ? 1 : 0}-{items.length} on this page{pageInfo.hasMore ? " • more records available" : ""}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="rounded-full" disabled={history.length === 0} onClick={() => void handlePrev()}>
                  Prev
                </Button>
                <Button variant="outline" className="rounded-full" disabled={!pageInfo.hasMore} onClick={() => void handleNext()}>
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
