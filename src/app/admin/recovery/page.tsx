"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { LifeBuoy, RefreshCw, Search, ShieldAlert, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AdminPageHeader,
  EmptyState,
  MetricCard,
  PaginatedCardList,
  SectionCard,
  StatusBadge,
} from "@/app/admin/_components/admin-primitives";

type VerificationState = "paid" | "manual_check" | "unverified";

type ActivationCandidate = {
  id: string;
  role: "earner" | "advertiser";
  name: string;
  email: string;
  activated: boolean;
  pendingActivationReference: string | null;
  activationReference: string | null;
  activationAttemptedAt: string | null;
  activatedAt: string | null;
  references: string[];
  lastActivationTxAt: string | null;
  paymentVerified: boolean;
  verificationState: VerificationState;
};

type WalletCandidate = {
  id: string;
  userId: string;
  name: string;
  email: string;
  amount: number;
  reference: string;
  provider: string;
  status: string;
  paymentVerified: boolean;
  verificationState: VerificationState;
  createdAt: string | null;
  currentBalance: number;
};

type StaleActivationItem = {
  id: string;
  userId: string;
  role: string;
  email: string;
  name: string;
  provider: string;
  status: string;
  reference: string;
  references: string[];
  attemptedAt: string | null;
  staleMinutes: number | null;
};

type StaleWalletItem = {
  id: string;
  userId: string;
  amount: number;
  provider: string;
  reference: string;
  references: string[];
  verificationState: string;
  createdAt: string | null;
  staleMinutes: number | null;
};

function getVerificationBadge(state: VerificationState) {
  if (state === "paid") {
    return { label: "Payment verified", tone: "green" as const };
  }
  if (state === "manual_check") {
    return { label: "Needs manual check", tone: "amber" as const };
  }
  return { label: "Unverified", tone: "red" as const };
}

function getManualPaymentBadge(status: string | undefined) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "PAID" || normalized === "SUCCESS" || normalized === "SUCCESSFUL") {
    return { label: "Paid", tone: "green" as const };
  }
  if (normalized === "EXPIRED") {
    return { label: "Expired", tone: "red" as const };
  }
  if (normalized === "PENDING" || normalized === "PROCESSING" || normalized === "INITIATED" || normalized === "IN_PROGRESS") {
    return { label: "Pending", tone: "amber" as const };
  }
  if (normalized) {
    return { label: normalized, tone: "stone" as const };
  }
  return { label: "Unknown", tone: "stone" as const };
}

export default function AdminRecoveryPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingIds, setProcessingIds] = useState<string[]>([]);
  const [activationCandidates, setActivationCandidates] = useState<ActivationCandidate[]>([]);
  const [walletCandidates, setWalletCandidates] = useState<WalletCandidate[]>([]);
  const [staleActivations, setStaleActivations] = useState<StaleActivationItem[]>([]);
  const [staleWallets, setStaleWallets] = useState<StaleWalletItem[]>([]);
  const [query, setQuery] = useState("");
  const [manualStatuses, setManualStatuses] = useState<Record<string, string>>({});

  const load = async (showToast = false) => {
    try {
      setRefreshing(true);
      const response = await fetch("/api/admin/recovery", {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load recovery candidates");
      }
      setActivationCandidates(data.activationCandidates || []);
      setWalletCandidates(data.walletCandidates || []);

      const reconciliationResponse = await fetch("/api/admin/reconciliation", {
        credentials: "include",
      });
      const reconciliationData = await reconciliationResponse.json().catch(() => ({}));
      if (reconciliationResponse.ok && reconciliationData.success) {
        setStaleActivations(reconciliationData.staleActivations || []);
        setStaleWallets(reconciliationData.staleWallets || []);
      }

      if (showToast) {
        toast.success("Recovery data refreshed");
      }
    } catch (error) {
      console.error("Failed to load recovery candidates", error);
      toast.error(error instanceof Error ? error.message : "Failed to load recovery candidates");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);


  const metrics = useMemo(() => {
    const totalPendingWallet = walletCandidates.reduce((sum, item) => sum + item.amount, 0);
    return {
      verifiedActivation: activationCandidates.filter((item) => item.verificationState === "paid").length,
      manualActivation: activationCandidates.filter((item) => item.verificationState !== "paid").length,
      verifiedWallet: walletCandidates.filter((item) => item.verificationState === "paid").length,
      manualWallet: walletCandidates.filter((item) => item.verificationState !== "paid").length,
      walletAmount: totalPendingWallet,
      total: activationCandidates.length + walletCandidates.length,
    };
  }, [activationCandidates, walletCandidates]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matches = (value: string) => value.toLowerCase().includes(normalizedQuery);

    const activationFiltered = normalizedQuery
      ? activationCandidates.filter((candidate) =>
          matches(candidate.name) ||
          matches(candidate.email) ||
          candidate.references.some((reference) => matches(reference))
        )
      : activationCandidates;

    const walletFiltered = normalizedQuery
      ? walletCandidates.filter((candidate) =>
          matches(candidate.name) ||
          matches(candidate.email) ||
          matches(candidate.reference)
        )
      : walletCandidates;

    return {
      verifiedActivations: activationFiltered.filter((candidate) => candidate.verificationState === "paid"),
      manualActivations: activationFiltered.filter((candidate) => candidate.verificationState !== "paid"),
      verifiedWallets: walletFiltered.filter((candidate) => candidate.verificationState === "paid"),
      manualWallets: walletFiltered.filter((candidate) => candidate.verificationState !== "paid"),
    };
  }, [activationCandidates, walletCandidates, query]);

  useEffect(() => {
    const manualRefs = filtered.manualActivations
      .map((candidate) => candidate.references[0])
      .filter((ref): ref is string => Boolean(ref));

    const missingRefs = manualRefs.filter((ref) => !manualStatuses[ref]);
    if (missingRefs.length === 0) return;

    const fetchStatuses = async () => {
      const chunkSize = 20;
      for (let i = 0; i < missingRefs.length; i += chunkSize) {
        const chunk = missingRefs.slice(i, i + chunkSize);
        try {
          const response = await fetch("/api/admin/recovery/status", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ references: chunk }),
          });
          const data = await response.json().catch(() => ({}));
          if (response.ok && data.success) {
            setManualStatuses((current) => ({ ...current, ...data.statuses }));
          }
        } catch (error) {
          console.error("Failed to load manual payment statuses", error);
        }
      }
    };

    void fetchStatuses();
  }, [filtered.manualActivations, manualStatuses]);

  const runRecovery = async (
    action: "activate_user" | "complete_wallet_funding" | "dismiss_activation_item" | "dismiss_wallet_item",
    payload: Record<string, unknown>,
    successMessage: string
  ) => {
    const key = String(payload.userId || payload.transactionId || Math.random());
    try {
      setProcessingIds((current) => [...current, key]);
      const response = await fetch("/api/admin/recovery", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Recovery action failed");
      }
      toast.success(successMessage);
      await load();
    } catch (error) {
      console.error("Recovery action failed", error);
      toast.error(error instanceof Error ? error.message : "Recovery action failed");
    } finally {
      setProcessingIds((current) => current.filter((value) => value !== key));
    }
  };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Recovery"
        title="Repair stuck payments and activations"
        description="This page shows recovery candidates only. Automatic recovery happens from the payment and webhook side after exact paid confirmation, while pending or unclear references stay in manual check."
        action={
          <Button
            variant="outline"
            className="rounded-full border-stone-300 bg-white/80"
            disabled={refreshing}
            onClick={() => void load(true)}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Verified activations" value={metrics.verifiedActivation} hint="Paid activations ready for auto-recovery" icon={ShieldCheck} />
        <MetricCard label="Manual-check activations" value={metrics.manualActivation} hint="Activation attempts still waiting on confirmation" icon={ShieldAlert} tone="amber" />
        <MetricCard label="Pending wallet amount" value={`₦${metrics.walletAmount.toLocaleString()}`} hint="Total value of wallet recovery records" icon={LifeBuoy} tone="emerald" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Verified wallet funding" value={metrics.verifiedWallet} hint="Paid wallet funding ready for auto-credit" icon={Wallet} tone="blue" />
        <MetricCard label="Manual-check wallet" value={metrics.manualWallet} hint="Wallet attempts still waiting on confirmation" icon={ShieldAlert} tone="amber" />
        <MetricCard label="All recovery items" value={metrics.total} hint="Everything currently visible on the recovery page" icon={LifeBuoy} />
      </div>

      <SectionCard
        title="Search recovery items"
        description="Search by payment reference, email, or name."
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by reference, email, or name"
            className="rounded-2xl border-stone-200 bg-white pl-11"
          />
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Stale pending items"
          description="Pending activation attempts and wallet funding records older than 15 minutes. These are the records most likely to need investigation."
        >
          {loading ? (
            <div className="h-40 animate-pulse rounded-2xl bg-stone-100" />
          ) : staleActivations.length === 0 && staleWallets.length === 0 ? (
            <EmptyState
              title="No stale pending items"
              description="Nothing has been pending long enough to be considered stale right now."
            />
          ) : (
            <div className="space-y-3">
              {staleActivations.length > 0 ? (
                <PaginatedCardList
                  items={staleActivations}
                  itemsPerPage={3}
                  renderItem={(item) => {
                    const busy = processingIds.includes(item.userId);
                    return (
                      <div key={item.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                        <div className="flex flex-col gap-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="font-medium text-stone-900">{item.name || item.email || item.userId}</p>
                              <p className="mt-1 text-sm text-stone-500">{item.email || "No email"}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <StatusBadge label={item.role || "unknown"} tone="blue" />
                              <StatusBadge label={`${item.staleMinutes || 0} min old`} tone="red" />
                              <StatusBadge label="Manual check" tone="amber" />
                            </div>
                          </div>
                          <div className="grid gap-3 text-sm text-stone-600 md:grid-cols-2">
                            <div className="rounded-2xl bg-stone-50 p-3">
                              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Latest attempt</p>
                              <p className="mt-2 break-all text-stone-800">{item.attemptedAt || "No timestamp"}</p>
                            </div>
                            <div className="rounded-2xl bg-stone-50 p-3">
                              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Reference</p>
                              <p className="mt-2 break-all text-stone-800">{item.reference || item.references[0] || "No reference"}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              className="rounded-full bg-stone-900 text-white hover:bg-stone-800"
                              disabled={busy || !item.userId}
                              onClick={() =>
                                void runRecovery(
                                  "activate_user",
                                  { userId: item.userId, role: item.role },
                                  "User activated successfully"
                                )
                              }
                            >
                              <ShieldCheck className="h-4 w-4" />
                              {busy ? "Activating..." : "Activate user"}
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="rounded-full border-stone-300"
                              disabled={busy || !item.userId}
                              onClick={() =>
                                void runRecovery(
                                  "dismiss_activation_item",
                                  { userId: item.userId, role: item.role },
                                  "Activation recovery item removed"
                                )
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
              ) : null}
              {staleWallets.length > 0 ? (
                <PaginatedCardList
                  items={staleWallets}
                  itemsPerPage={3}
                  renderItem={(item) => (
                <div key={item.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge label="Wallet funding" tone="green" />
                    <StatusBadge label={item.provider || "unknown"} tone="blue" />
                    <StatusBadge label={`${item.staleMinutes || 0} min old`} tone="red" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-stone-900">₦{item.amount.toLocaleString()}</p>
                  <p className="mt-1 break-all text-xs text-stone-500">{item.reference || item.references[0] || "No reference"}</p>
                  <div className="mt-4 flex items-center gap-2">
                    <Button
                      className="rounded-full bg-stone-900 text-white hover:bg-stone-800"
                      disabled={processingIds.includes(item.id)}
                      onClick={() =>
                        void runRecovery(
                          "complete_wallet_funding",
                          { transactionId: item.id },
                          "Wallet funded successfully"
                        )
                      }
                    >
                      <Wallet className="h-4 w-4" />
                      {processingIds.includes(item.id) ? "Funding..." : "Credit exact amount"}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="rounded-full border-stone-300"
                      disabled={processingIds.includes(item.id)}
                      onClick={() =>
                        void runRecovery(
                          "dismiss_wallet_item",
                          { transactionId: item.id },
                          "Wallet recovery item removed"
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                  )}
                />
              ) : null}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Verified activation recovery"
          description="These payments are confirmed as paid. They are safe to activate, and anything still listed here can be completed manually."
        >
          {loading ? (
            <div className="h-40 animate-pulse rounded-2xl bg-stone-100" />
          ) : filtered.verifiedActivations.length === 0 ? (
            <EmptyState
              title="No verified activation recoveries"
              description="There are no fully verified activation payments waiting here right now."
            />
          ) : (
            <PaginatedCardList
              items={filtered.verifiedActivations}
              itemsPerPage={3}
              renderItem={(candidate) => {
                const busy = processingIds.includes(candidate.id);
                const verificationBadge = getVerificationBadge(candidate.verificationState);
                const manualStatus = manualStatuses[candidate.references[0] || ""];
                const manualBadge = getManualPaymentBadge(manualStatus);
                return (
                  <div key={candidate.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium text-stone-900">{candidate.name}</p>
                          <p className="mt-1 text-sm text-stone-500">{candidate.email}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge label={candidate.role === "earner" ? "Earner" : "Advertiser"} tone={candidate.role === "earner" ? "amber" : "blue"} />
                          <StatusBadge label={verificationBadge.label} tone={verificationBadge.tone} />
                          <StatusBadge label={manualBadge.label} tone={manualBadge.tone} />
                          <StatusBadge label="Not activated" tone="red" />
                        </div>
                      </div>
                      <div className="grid gap-3 text-sm text-stone-600 md:grid-cols-2">
                        <div className="rounded-2xl bg-stone-50 p-3">
                          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Latest attempt</p>
                          <p className="mt-2 break-all text-stone-800">{candidate.activationAttemptedAt || candidate.lastActivationTxAt || "No timestamp"}</p>
                        </div>
                        <div className="rounded-2xl bg-stone-50 p-3">
                          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Reference</p>
                          <p className="mt-2 break-all text-stone-800">{candidate.references[0] || "No reference"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          className="rounded-full bg-stone-900 text-white hover:bg-stone-800"
                          disabled={busy}
                          onClick={() =>
                            void runRecovery(
                              "activate_user",
                              { userId: candidate.id, role: candidate.role },
                              "User activated successfully"
                            )
                          }
                        >
                          <ShieldCheck className="h-4 w-4" />
                          {busy ? "Activating..." : "Activate user"}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="rounded-full border-stone-300"
                          disabled={busy}
                          onClick={() =>
                            void runRecovery(
                              "dismiss_activation_item",
                              { userId: candidate.id, role: candidate.role },
                              "Activation recovery item removed"
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
          )}
        </SectionCard>

        <SectionCard
          title="Manual-check activations"
          description="These activation attempts are not confirmed as paid yet. Pending Monnify references stay here instead of being marked verified."
        >
          {loading ? (
            <div className="h-40 animate-pulse rounded-2xl bg-stone-100" />
          ) : filtered.manualActivations.length === 0 ? (
            <EmptyState
              title="No activation manual checks"
              description="There are no activation attempts waiting for manual payment review right now."
            />
          ) : (
            <PaginatedCardList
              items={filtered.manualActivations}
              itemsPerPage={3}
              renderItem={(candidate) => {
                const busy = processingIds.includes(candidate.id);
                const verificationBadge = getVerificationBadge(candidate.verificationState);
                return (
                  <div key={candidate.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium text-stone-900">{candidate.name}</p>
                          <p className="mt-1 text-sm text-stone-500">{candidate.email}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge label={candidate.role === "earner" ? "Earner" : "Advertiser"} tone={candidate.role === "earner" ? "amber" : "blue"} />
                          <StatusBadge label={verificationBadge.label} tone={verificationBadge.tone} />
                          <StatusBadge label="Not activated" tone="red" />
                        </div>
                      </div>
                      <div className="grid gap-3 text-sm text-stone-600 md:grid-cols-2">
                        <div className="rounded-2xl bg-stone-50 p-3">
                          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Latest attempt</p>
                          <p className="mt-2 break-all text-stone-800">{candidate.activationAttemptedAt || candidate.lastActivationTxAt || "No timestamp"}</p>
                        </div>
                        <div className="rounded-2xl bg-stone-50 p-3">
                          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Reference</p>
                          <p className="mt-2 break-all text-stone-800">{candidate.references[0] || "No reference"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          className="rounded-full bg-stone-900 text-white hover:bg-stone-800"
                          disabled={busy}
                          onClick={() =>
                            void runRecovery(
                              "activate_user",
                              { userId: candidate.id, role: candidate.role },
                              "User activated successfully"
                            )
                          }
                        >
                          <ShieldCheck className="h-4 w-4" />
                          {busy ? "Activating..." : "Activate user manually"}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="rounded-full border-stone-300"
                          disabled={busy}
                          onClick={() =>
                            void runRecovery(
                              "dismiss_activation_item",
                              { userId: candidate.id, role: candidate.role },
                              "Activation recovery item removed"
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
          )}
        </SectionCard>

        <SectionCard
          title="Verified wallet funding"
          description="These payments are confirmed as paid. They are safe to credit, and anything still listed here can be completed manually."
        >
          {loading ? (
            <div className="h-40 animate-pulse rounded-2xl bg-stone-100" />
          ) : filtered.verifiedWallets.length === 0 ? (
            <EmptyState
              title="No verified wallet recoveries"
              description="There are no fully verified wallet funding payments waiting here right now."
            />
          ) : (
            <PaginatedCardList
              items={filtered.verifiedWallets}
              itemsPerPage={3}
              renderItem={(candidate) => {
                const busy = processingIds.includes(candidate.id);
                const verificationBadge = getVerificationBadge(candidate.verificationState);
                return (
                  <div key={candidate.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium text-stone-900">{candidate.name}</p>
                          <p className="mt-1 text-sm text-stone-500">{candidate.email}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge label={candidate.provider} tone="blue" />
                          <StatusBadge label={candidate.status} tone="amber" />
                          <StatusBadge label={verificationBadge.label} tone={verificationBadge.tone} />
                        </div>
                      </div>
                      <div className="grid gap-3 text-sm text-stone-600 md:grid-cols-2">
                        <div className="rounded-2xl bg-stone-50 p-3">
                          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Amount paid</p>
                          <p className="mt-2 text-lg font-semibold text-stone-900">₦{candidate.amount.toLocaleString()}</p>
                          <p className="mt-1 text-xs text-stone-500">Current balance: ₦{candidate.currentBalance.toLocaleString()}</p>
                        </div>
                        <div className="rounded-2xl bg-stone-50 p-3">
                          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Reference</p>
                          <p className="mt-2 break-all text-stone-800">{candidate.reference}</p>
                          <p className="mt-1 text-xs text-stone-500">{candidate.createdAt || "No timestamp"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          className="rounded-full bg-stone-900 text-white hover:bg-stone-800"
                          disabled={busy}
                          onClick={() =>
                            void runRecovery(
                              "complete_wallet_funding",
                              { transactionId: candidate.id },
                              "Wallet funded successfully"
                            )
                          }
                        >
                          <Wallet className="h-4 w-4" />
                          {busy ? "Funding..." : "Credit exact amount"}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="rounded-full border-stone-300"
                          disabled={busy}
                          onClick={() =>
                            void runRecovery(
                              "dismiss_wallet_item",
                              { transactionId: candidate.id },
                              "Wallet recovery item removed"
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
          )}
        </SectionCard>

        <SectionCard
          title="Manual-check wallet funding"
          description="These wallet funding attempts are not confirmed as paid yet. Pending Monnify references stay here until the payment is confirmed."
        >
          {loading ? (
            <div className="h-40 animate-pulse rounded-2xl bg-stone-100" />
          ) : filtered.manualWallets.length === 0 ? (
            <EmptyState
              title="No wallet manual checks"
              description="There are no wallet funding attempts waiting for manual payment review right now."
            />
          ) : (
            <PaginatedCardList
              items={filtered.manualWallets}
              itemsPerPage={3}
              renderItem={(candidate) => {
                const busy = processingIds.includes(candidate.id);
                const verificationBadge = getVerificationBadge(candidate.verificationState);
                return (
                  <div key={candidate.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium text-stone-900">{candidate.name}</p>
                          <p className="mt-1 text-sm text-stone-500">{candidate.email}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge label={candidate.provider} tone="blue" />
                          <StatusBadge label={candidate.status} tone="amber" />
                          <StatusBadge label={verificationBadge.label} tone={verificationBadge.tone} />
                        </div>
                      </div>
                      <div className="grid gap-3 text-sm text-stone-600 md:grid-cols-2">
                        <div className="rounded-2xl bg-stone-50 p-3">
                          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Amount attempted</p>
                          <p className="mt-2 text-lg font-semibold text-stone-900">₦{candidate.amount.toLocaleString()}</p>
                          <p className="mt-1 text-xs text-stone-500">Current balance: ₦{candidate.currentBalance.toLocaleString()}</p>
                        </div>
                        <div className="rounded-2xl bg-stone-50 p-3">
                          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Reference</p>
                          <p className="mt-2 break-all text-stone-800">{candidate.reference}</p>
                          <p className="mt-1 text-xs text-stone-500">{candidate.createdAt || "No timestamp"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          className="rounded-full bg-stone-900 text-white hover:bg-stone-800"
                          disabled={busy}
                          onClick={() =>
                            void runRecovery(
                              "complete_wallet_funding",
                              { transactionId: candidate.id },
                              "Wallet funded successfully"
                            )
                          }
                        >
                          <Wallet className="h-4 w-4" />
                          {busy ? "Funding..." : "Credit exact amount"}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="rounded-full border-stone-300"
                          disabled={busy}
                          onClick={() =>
                            void runRecovery(
                              "dismiss_wallet_item",
                              { transactionId: candidate.id },
                              "Wallet recovery item removed"
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
