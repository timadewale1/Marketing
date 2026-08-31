"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Clock3, Search, ShieldAlert, ShieldCheck, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminPageHeader, EmptyState, MetricCard, SectionCard, StatusBadge } from "@/app/admin/_components/admin-primitives";

type PaymentScope = "activation" | "wallet_funding" | "campaign_payment" | "recovery";

type LifecyclePayload = {
  paymentReference: string;
  monnifyTransactionReference: string;
  webhookReceivedAt: string | null;
  monnifyVerificationResult: string;
  processorAttemptCount: number;
  lastError: string;
  lastProcessingAttempt: string | null;
  finalStatus: string;
  paymentType: string;
  timestamps: Record<string, unknown>;
};

type LifecycleItem = {
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
  paymentReference: string;
  references: string[];
  amount: number;
  transactionId: string;
  createdAt: string | null;
  createdAtMs: number;
  lifecycle: LifecyclePayload;
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

export default function AdminPaymentLifecyclePage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<LifecycleItem[]>([]);
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
      if (cursor?.cursorCreatedAt) {
        params.set("cursorCreatedAt", cursor.cursorCreatedAt);
      }
      const response = await fetch(`/api/admin/payment-lifecycle?${params.toString()}`, {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load payment lifecycle logs");
      }
      setItems((data.items || []) as LifecycleItem[]);
      setPageInfo((data.pageInfo || { hasMore: false, cursorCreatedAt: null, cursorId: null }) as PageInfo);
      if (showToast) {
        toast.success("Lifecycle logs refreshed");
      }
    } catch (error) {
      console.error("Failed to load payment lifecycle logs", error);
      toast.error(error instanceof Error ? error.message : "Failed to load payment lifecycle logs");
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
    const completed = items.filter((item) => item.lifecycle.finalStatus === "completed" || item.status === "completed").length;
    const processing = items.filter((item) => item.lifecycle.finalStatus === "processing" || item.status === "processing").length;
    const failures = items.filter((item) => ["processing_failed", "webhook_failed", "reference_not_found", "monnify_not_confirmed", "firestore_update_failed", "manual_review"].includes(item.lifecycle.finalStatus || item.status)).length;
    return {
      visible: items.length,
      completed,
      processing,
      failures,
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

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Payment audit trail"
        title="Payment lifecycle logs"
        description="This page shows the full trail for activation and wallet funding payments, from creation through Monnify confirmation, processing, and completion. It also exposes the failure state so stuck payments are easier to diagnose."
        action={
          <Button
            variant="outline"
            className="rounded-full border-stone-300 bg-white/80"
            disabled={refreshing}
            onClick={() => void load(history[history.length - 1] || null, true)}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard label="Visible rows" value={metrics.visible} hint="Current page only" icon={Activity} />
        <MetricCard label="Completed" value={metrics.completed} hint="Lifecycle ended successfully" icon={ShieldCheck} tone="emerald" />
        <MetricCard label="Processing" value={metrics.processing} hint="Still being worked on" icon={Clock3} tone="blue" />
        <MetricCard label="Failures" value={metrics.failures} hint="Needs attention or manual review" icon={ShieldAlert} tone="rose" />
        <MetricCard label="Amount in view" value={currency(metrics.totalAmount)} hint="Current page total amount" icon={Activity} tone="amber" />
      </div>

      <SectionCard title="Filters" description="Search by email, reference, payment reference, or user ID. Logs are loaded page by page to keep reads low.">
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
              <SelectItem value="created">Created</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="monnify_confirmed">Monnify confirmed</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="processing_failed">Processing failed</SelectItem>
              <SelectItem value="webhook_failed">Webhook failed</SelectItem>
              <SelectItem value="reference_not_found">Reference not found</SelectItem>
              <SelectItem value="monnify_not_confirmed">Monnify not confirmed</SelectItem>
              <SelectItem value="firestore_update_failed">Firestore update failed</SelectItem>
              <SelectItem value="manual_review">Manual review</SelectItem>
            </SelectContent>
          </Select>
          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
            Each log keeps the payment reference, Monnify reference, attempt count, and final state so we can trace the exact failure point.
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Lifecycle queue"
        description={loading ? "Loading lifecycle logs..." : `${items.length} log${items.length === 1 ? "" : "s"} loaded on this page.`}
      >
        {loading ? (
          <div className="h-56 animate-pulse rounded-3xl bg-stone-100" />
        ) : items.length === 0 ? (
          <EmptyState
            title="No lifecycle logs found"
            description="Try widening the filters or searching by a full email, reference, or user ID."
          />
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.id} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge label={item.scope.replaceAll("_", " ")} tone={item.scope === "activation" ? "blue" : item.scope === "wallet_funding" ? "amber" : "stone"} />
                      <StatusBadge label={item.lifecycle.finalStatus || item.status || "unknown"} tone={item.lifecycle.finalStatus === "completed" ? "green" : item.lifecycle.finalStatus?.includes("failed") ? "red" : item.lifecycle.finalStatus === "processing" ? "blue" : "stone"} />
                      <StatusBadge label={item.provider || "monnify"} tone="stone" />
                    </div>
                    <p className="text-lg font-semibold text-stone-900">{currency(item.amount)}</p>
                    <p className="text-sm text-stone-600">{item.name || "Unknown user"} • {item.email || "No email"} • {item.role || "unknown role"}</p>
                    <p className="text-xs text-stone-500">{item.reference || "No payment reference"}</p>
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-400">{formatDate(item.createdAt)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge label={`Attempts: ${item.lifecycle.processorAttemptCount || 0}`} tone="stone" />
                    <StatusBadge label={item.lifecycle.monnifyVerificationResult || "No verification result"} tone="blue" />
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl bg-stone-50 p-3">
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Payment reference</p>
                    <p className="mt-2 break-all font-semibold text-stone-900">{item.lifecycle.paymentReference || "N/A"}</p>
                  </div>
                  <div className="rounded-2xl bg-stone-50 p-3">
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Monnify reference</p>
                    <p className="mt-2 break-all font-semibold text-stone-900">{item.lifecycle.monnifyTransactionReference || item.transactionId || "N/A"}</p>
                  </div>
                  <div className="rounded-2xl bg-stone-50 p-3">
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Webhook received</p>
                    <p className="mt-2 font-semibold text-stone-900">{formatDate(item.lifecycle.webhookReceivedAt)}</p>
                  </div>
                  <div className="rounded-2xl bg-stone-50 p-3">
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Last processing attempt</p>
                    <p className="mt-2 font-semibold text-stone-900">{formatDate(item.lifecycle.lastProcessingAttempt)}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-stone-50 p-3">
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Last error</p>
                    <p className="mt-2 text-sm text-stone-700">{item.lifecycle.lastError || "No error recorded"}</p>
                  </div>
                  <div className="rounded-2xl bg-stone-50 p-3">
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Payment type</p>
                    <p className="mt-2 text-sm font-semibold text-stone-900">{item.lifecycle.paymentType || item.scope}</p>
                  </div>
                  <div className="rounded-2xl bg-stone-50 p-3">
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Source</p>
                    <p className="mt-2 text-sm font-semibold text-stone-900">{item.source || "Unknown source"}</p>
                  </div>
                </div>
              </div>
            ))}

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
