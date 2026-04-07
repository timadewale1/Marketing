"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Landmark, RefreshCw, ReceiptText, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AdminPageHeader,
  EmptyState,
  MetricCard,
  PaginatedCardList,
  SectionCard,
  StatusBadge,
} from "@/app/admin/_components/admin-primitives";

type WalletSummary = {
  accountNumber: string;
  availableBalance: number;
  ledgerBalance: number;
  currency: string;
};

type PendingSettlement = {
  transactionReference: string;
  paymentReference: string;
  amountPaid: number;
  customerName: string;
  customerEmail: string;
  paidOn: string | null;
  status: string;
};

type WalletTransaction = {
  walletTransactionReference: string;
  monnifyTransactionReference: string;
  transactionType: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  currency: string;
  status: string;
  createdOn: string | null;
  narration: string;
};

function currency(amount: number, code = "NGN") {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export default function AdminMonnifyPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [pendingSettlements, setPendingSettlements] = useState<{
    count: number;
    totalAmount: number;
    note: string;
    items: PendingSettlement[];
  }>({
    count: 0,
    totalAmount: 0,
    note: "",
    items: [],
  });
  const [transactions, setTransactions] = useState<{
    page: number;
    size: number;
    total: number;
    items: WalletTransaction[];
  }>({
    page: 0,
    size: 20,
    total: 0,
    items: [],
  });

  const load = async (showToast = false) => {
    try {
      setRefreshing(true);
      const response = await fetch(`/api/admin/monnify?page=${transactions.page}&size=${transactions.size}`, {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load Monnify dashboard");
      }

      setWallet(data.wallet || null);
      setPendingSettlements(data.pendingSettlements || { count: 0, totalAmount: 0, note: "", items: [] });
      setTransactions(data.transactions || { page: 0, size: 20, total: 0, items: [] });

      if (showToast) {
        toast.success("Monnify dashboard refreshed");
      }
    } catch (error) {
      console.error("Failed to load Monnify dashboard", error);
      toast.error(error instanceof Error ? error.message : "Failed to load Monnify dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Monnify"
        title="Monnify console"
        description="Track wallet balance, recent wallet transactions, and recent successful transactions that appear to be awaiting settlement."
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
        <MetricCard
          label="Available balance"
          value={wallet ? currency(wallet.availableBalance, wallet.currency) : "₦0.00"}
          hint={wallet?.accountNumber ? `Wallet: ${wallet.accountNumber}` : "Monnify wallet"}
          icon={Wallet}
        />
        <MetricCard
          label="Ledger balance"
          value={wallet ? currency(wallet.ledgerBalance, wallet.currency) : "₦0.00"}
          hint="Reported by Monnify wallet balance API"
          icon={Landmark}
          tone="blue"
        />
        <MetricCard
          label="Pending settlements"
          value={currency(pendingSettlements.totalAmount, wallet?.currency || "NGN")}
          hint={`${pendingSettlements.count} recent transaction${pendingSettlements.count === 1 ? "" : "s"} awaiting settlement detail`}
          icon={ReceiptText}
          tone="amber"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <SectionCard
          title="Pending settlements"
          description={pendingSettlements.note || "These are recent successful transactions that do not yet return settlement detail from Monnify."}
        >
          {loading ? (
            <div className="h-40 animate-pulse rounded-2xl bg-stone-100" />
          ) : pendingSettlements.items.length === 0 ? (
            <EmptyState
              title="No pending settlements found"
              description="Recent successful Monnify transactions already appear to have settlement details."
            />
          ) : (
            <PaginatedCardList
              items={pendingSettlements.items}
              itemsPerPage={3}
              renderItem={(item) => (
                <div key={item.transactionReference} className="rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-stone-900 break-all">{item.transactionReference}</p>
                      <p className="mt-1 text-sm text-stone-500">
                        {item.customerName || item.customerEmail || "Unknown customer"}
                      </p>
                      <p className="mt-1 text-sm text-stone-500">
                        {item.paidOn ? new Date(item.paidOn).toLocaleString() : "No payment date"}
                      </p>
                    </div>
                    <StatusBadge label={item.status || "Pending"} tone="amber" />
                  </div>
                  <div className="mt-4 rounded-2xl bg-stone-50 p-3">
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Amount awaiting settlement</p>
                    <p className="mt-2 text-lg font-semibold text-stone-900">{currency(item.amountPaid, wallet?.currency || "NGN")}</p>
                    {item.paymentReference ? (
                      <p className="mt-1 text-xs text-stone-500 break-all">Payment ref: {item.paymentReference}</p>
                    ) : null}
                  </div>
                </div>
              )}
            />
          )}
        </SectionCard>

        <SectionCard
          title="Wallet transaction history"
          description="Recent transactions returned directly from the Monnify wallet statement endpoint."
        >
          {loading ? (
            <div className="h-40 animate-pulse rounded-2xl bg-stone-100" />
          ) : transactions.items.length === 0 ? (
            <EmptyState
              title="No wallet transactions"
              description="No Monnify wallet transactions were returned for this page."
            />
          ) : (
            <PaginatedCardList
              items={transactions.items}
              itemsPerPage={3}
              renderItem={(item) => (
                <div key={item.walletTransactionReference || item.monnifyTransactionReference} className="rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-stone-900 break-all">
                        {item.walletTransactionReference || item.monnifyTransactionReference || "Wallet transaction"}
                      </p>
                      <p className="mt-1 text-sm text-stone-500">
                        {item.createdOn ? new Date(item.createdOn).toLocaleString() : "No date"}
                      </p>
                    </div>
                    <StatusBadge label={item.status || item.transactionType || "Recorded"} tone="blue" />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-stone-50 p-3">
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Amount</p>
                      <p className="mt-2 font-semibold text-stone-900">{currency(item.amount, item.currency || wallet?.currency || "NGN")}</p>
                    </div>
                    <div className="rounded-2xl bg-stone-50 p-3">
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Before</p>
                      <p className="mt-2 font-semibold text-stone-900">{currency(item.balanceBefore, item.currency || wallet?.currency || "NGN")}</p>
                    </div>
                    <div className="rounded-2xl bg-stone-50 p-3">
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">After</p>
                      <p className="mt-2 font-semibold text-stone-900">{currency(item.balanceAfter, item.currency || wallet?.currency || "NGN")}</p>
                    </div>
                  </div>
                  {item.narration ? (
                    <p className="mt-3 text-sm text-stone-600">{item.narration}</p>
                  ) : null}
                </div>
              )}
            />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
