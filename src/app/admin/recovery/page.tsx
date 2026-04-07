"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { LifeBuoy, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AdminPageHeader,
  EmptyState,
  MetricCard,
  PaginatedCardList,
  SectionCard,
  StatusBadge,
} from "@/app/admin/_components/admin-primitives";

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
  createdAt: string | null;
  currentBalance: number;
};

export default function AdminRecoveryPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recoveringIds, setRecoveringIds] = useState<string[]>([]);
  const [activationCandidates, setActivationCandidates] = useState<ActivationCandidate[]>([]);
  const [walletCandidates, setWalletCandidates] = useState<WalletCandidate[]>([]);

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
      activation: activationCandidates.length,
      wallet: walletCandidates.length,
      walletAmount: totalPendingWallet,
    };
  }, [activationCandidates, walletCandidates]);

  const runRecovery = async (
    action: "activate_user" | "complete_wallet_funding",
    payload: Record<string, unknown>,
    successMessage: string
  ) => {
    const key = String(payload.userId || payload.transactionId || Math.random());
    try {
      setRecoveringIds((current) => [...current, key]);
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
      setRecoveringIds((current) => current.filter((value) => value !== key));
    }
  };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Recovery"
        title="Repair stuck payments and activations"
        description="Use this page to recover users who paid but were not activated, and advertisers whose wallet funding was recorded as pending instead of credited."
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
        <MetricCard label="Activation recoveries" value={metrics.activation} hint="Users waiting for manual activation help" icon={ShieldCheck} />
        <MetricCard label="Wallet recoveries" value={metrics.wallet} hint="Pending advertiser wallet funding records" icon={Wallet} tone="blue" />
        <MetricCard label="Pending wallet amount" value={`₦${metrics.walletAmount.toLocaleString()}`} hint="Total value of pending funding records" icon={LifeBuoy} tone="emerald" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_1.05fr]">
        <SectionCard
          title="Activation recovery"
          description="These users have activation references or completed activation-fee records, but the account is still not marked active."
        >
          {loading ? (
            <div className="h-40 animate-pulse rounded-2xl bg-stone-100" />
          ) : activationCandidates.length === 0 ? (
            <EmptyState
              title="No stuck activations found"
              description="Everyone with activation references is already active right now."
            />
          ) : (
            <PaginatedCardList
              items={activationCandidates}
              itemsPerPage={3}
              renderItem={(candidate) => {
                const busy = recoveringIds.includes(candidate.id);
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
                          <StatusBadge label={candidate.paymentVerified ? "Payment verified" : "Needs manual check"} tone={candidate.paymentVerified ? "green" : "amber"} />
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
                    </div>
                  </div>
                );
              }}
            />
          )}
        </SectionCard>

        <SectionCard
          title="Wallet funding recovery"
          description="These advertiser wallet funding payments were started but are still pending, so the balance may not have been credited yet."
        >
          {loading ? (
            <div className="h-40 animate-pulse rounded-2xl bg-stone-100" />
          ) : walletCandidates.length === 0 ? (
            <EmptyState
              title="No stuck wallet funding found"
              description="There are no pending advertiser wallet funding records that need manual help right now."
            />
          ) : (
            <PaginatedCardList
              items={walletCandidates}
              itemsPerPage={3}
              renderItem={(candidate) => {
                const busy = recoveringIds.includes(candidate.id);
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
