"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ArrowDownLeft, ArrowUpRight, Landmark, RefreshCw, ReceiptText, Send, Wallet } from "lucide-react";
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

type WalletSummary = {
  accountNumber: string;
  availableBalance: number;
  ledgerBalance: number;
  currency: string;
};

type PendingSettlement = {
  reference: string;
  paymentReference: string;
  amount: number;
  customerName: string;
  customerEmail: string;
  paidOn: string | null;
  status: string;
};

type StatementItem = {
  reference: string;
  transactionType: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  currency: string;
  status: string;
  createdOn: string | null;
  narration: string;
};

type DisbursementItem = {
  reference: string;
  amount: number;
  status: string;
  createdOn: string | null;
  narration: string;
  destinationAccountNumber: string;
  destinationBankCode: string;
  fee: number;
  currency: string;
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
  const [summary, setSummary] = useState({
    totalCredits: 0,
    totalDebits: 0,
    totalDisbursements: 0,
    pendingSettlementsAmount: 0,
  });
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
  const [statement, setStatement] = useState<{
    page: number;
    size: number;
    total: number;
    items: StatementItem[];
  }>({
    page: 0,
    size: 20,
    total: 0,
    items: [],
  });
  const [disbursements, setDisbursements] = useState<{
    page: number;
    size: number;
    total: number;
    items: DisbursementItem[];
  }>({
    page: 0,
    size: 20,
    total: 0,
    items: [],
  });
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    statementFilter: "all",
    disbursementFilter: "all",
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      statementPage: String(statement.page),
      statementSize: String(statement.size),
      disbursementPage: String(disbursements.page),
      disbursementSize: String(disbursements.size),
      statementFilter: filters.statementFilter,
      disbursementFilter: filters.disbursementFilter,
    });

    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);

    return params.toString();
  }, [disbursements.page, disbursements.size, filters.disbursementFilter, filters.endDate, filters.startDate, filters.statementFilter, statement.page, statement.size]);

  const load = async (showToast = false) => {
    try {
      setRefreshing(true);
      const response = await fetch(`/api/admin/monnify?${queryString}`, {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load Monnify dashboard");
      }

      setWallet(data.wallet || null);
      setSummary(data.summary || { totalCredits: 0, totalDebits: 0, totalDisbursements: 0, pendingSettlementsAmount: 0 });
      setPendingSettlements(data.pendingSettlements || { count: 0, totalAmount: 0, note: "", items: [] });
      setStatement(data.statement || { page: 0, size: 20, total: 0, items: [] });
      setDisbursements(data.disbursements || { page: 0, size: 20, total: 0, items: [] });

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
  }, [queryString]);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Monnify"
        title="Monnify account console"
        description="This view is built from your Monnify account endpoints: wallet balance, wallet statement, disbursement search, and account-level collections history."
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

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Available balance"
          value={wallet ? currency(wallet.availableBalance, wallet.currency) : "₦0.00"}
          hint={wallet?.accountNumber ? `Wallet: ${wallet.accountNumber}` : "Monnify wallet"}
          icon={Wallet}
        />
        <MetricCard
          label="Ledger balance"
          value={wallet ? currency(wallet.ledgerBalance, wallet.currency) : "₦0.00"}
          hint="Reported directly by Monnify wallet balance"
          icon={Landmark}
          tone="blue"
        />
        <MetricCard
          label="Credits in filter"
          value={currency(summary.totalCredits, wallet?.currency || "NGN")}
          hint="Wallet statement inflows under current filter"
          icon={ArrowDownLeft}
          tone="emerald"
        />
        <MetricCard
          label="Disbursements in filter"
          value={currency(summary.totalDisbursements, wallet?.currency || "NGN")}
          hint="Outgoing transfers under current filter"
          icon={Send}
          tone="rose"
        />
      </div>

      <SectionCard
        title="Filters"
        description="Filter your Monnify account view by date, wallet statement direction, and disbursement status."
      >
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Start date</label>
            <Input
              type="date"
              value={filters.startDate}
              onChange={(event) => {
                setStatement((current) => ({ ...current, page: 0 }));
                setDisbursements((current) => ({ ...current, page: 0 }));
                setFilters((current) => ({ ...current, startDate: event.target.value }));
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">End date</label>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(event) => {
                setStatement((current) => ({ ...current, page: 0 }));
                setDisbursements((current) => ({ ...current, page: 0 }));
                setFilters((current) => ({ ...current, endDate: event.target.value }));
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Wallet statement</label>
            <select
              className="flex h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-900 shadow-sm outline-none"
              value={filters.statementFilter}
              onChange={(event) => {
                setStatement((current) => ({ ...current, page: 0 }));
                setFilters((current) => ({ ...current, statementFilter: event.target.value }));
              }}
            >
              <option value="all">All entries</option>
              <option value="credit">Credits only</option>
              <option value="debit">Debits only</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Disbursement status</label>
            <select
              className="flex h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-900 shadow-sm outline-none"
              value={filters.disbursementFilter}
              onChange={(event) => {
                setDisbursements((current) => ({ ...current, page: 0 }));
                setFilters((current) => ({ ...current, disbursementFilter: event.target.value }));
              }}
            >
              <option value="all">All statuses</option>
              <option value="success">Success</option>
              <option value="successful">Successful</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
        {(filters.startDate || filters.endDate || filters.statementFilter !== "all" || filters.disbursementFilter !== "all") ? (
          <div className="mt-4 flex justify-end">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                setStatement((current) => ({ ...current, page: 0 }));
                setDisbursements((current) => ({ ...current, page: 0 }));
                setFilters({
                  startDate: "",
                  endDate: "",
                  statementFilter: "all",
                  disbursementFilter: "all",
                });
              }}
            >
              Reset filters
            </Button>
          </div>
        ) : null}
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard
          title="Collections and pending settlements"
          description={pendingSettlements.note || "Recent successful collections returned from your Monnify account."}
        >
          {loading ? (
            <div className="h-40 animate-pulse rounded-2xl bg-stone-100" />
          ) : pendingSettlements.items.length === 0 ? (
            <EmptyState
              title="No recent collections returned"
              description="Monnify did not return recent successful collection records for the current account filter."
            />
          ) : (
            <PaginatedCardList
              items={pendingSettlements.items}
              itemsPerPage={3}
              renderItem={(item) => (
                <div key={item.reference} className="rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-stone-900 break-all">{item.reference}</p>
                      <p className="mt-1 text-sm text-stone-500">
                        {item.customerName || item.customerEmail || "Unknown customer"}
                      </p>
                      <p className="mt-1 text-sm text-stone-500">
                        {item.paidOn ? new Date(item.paidOn).toLocaleString() : "No payment date"}
                      </p>
                    </div>
                    <StatusBadge label={item.status || "Recorded"} tone="green" />
                  </div>
                  <div className="mt-4 rounded-2xl bg-stone-50 p-3">
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Collection amount</p>
                    <p className="mt-2 text-lg font-semibold text-stone-900">{currency(item.amount, wallet?.currency || "NGN")}</p>
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
          title="Wallet statement"
          description="Directly from your Monnify wallet statement endpoint, including credits and debits."
          action={<StatusBadge label={`${statement.total} record${statement.total === 1 ? "" : "s"}`} tone="stone" />}
        >
          {loading ? (
            <div className="h-40 animate-pulse rounded-2xl bg-stone-100" />
          ) : statement.items.length === 0 ? (
            <EmptyState
              title="No wallet statement entries"
              description="Monnify returned no wallet statement entries for the current filter."
            />
          ) : (
            <PaginatedCardList
              items={statement.items}
              itemsPerPage={3}
              renderItem={(item) => (
                <div key={`${item.reference}-${item.createdOn || ""}`} className="rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-stone-900 break-all">{item.reference || "Wallet statement entry"}</p>
                      <p className="mt-1 text-sm text-stone-500">
                        {item.createdOn ? new Date(item.createdOn).toLocaleString() : "No date"}
                      </p>
                    </div>
                    <StatusBadge
                      label={item.transactionType || item.status || "Recorded"}
                      tone={item.transactionType.toLowerCase().includes("credit") ? "green" : item.transactionType.toLowerCase().includes("debit") ? "red" : "blue"}
                    />
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

      <SectionCard
        title="Disbursement history"
        description="Outgoing transfers from your Monnify wallet, filtered directly from the disbursement search endpoint."
        action={<StatusBadge label={`${disbursements.total} record${disbursements.total === 1 ? "" : "s"}`} tone="stone" />}
      >
        {loading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-stone-100" />
        ) : disbursements.items.length === 0 ? (
          <EmptyState
            title="No disbursements found"
            description="Monnify did not return any disbursement records for the current filter."
          />
        ) : (
          <PaginatedCardList
            items={disbursements.items}
            itemsPerPage={3}
            renderItem={(item) => (
              <div key={`${item.reference}-${item.createdOn || ""}`} className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-stone-900 break-all">{item.reference || "Disbursement"}</p>
                    <p className="mt-1 text-sm text-stone-500">
                      {item.createdOn ? new Date(item.createdOn).toLocaleString() : "No date"}
                    </p>
                  </div>
                  <StatusBadge
                    label={item.status || "Recorded"}
                    tone={item.status.toLowerCase().includes("success") ? "green" : item.status.toLowerCase().includes("fail") ? "red" : "amber"}
                  />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl bg-stone-50 p-3">
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Amount</p>
                    <p className="mt-2 font-semibold text-stone-900">{currency(item.amount, item.currency || wallet?.currency || "NGN")}</p>
                  </div>
                  <div className="rounded-2xl bg-stone-50 p-3">
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Fee</p>
                    <p className="mt-2 font-semibold text-stone-900">{currency(item.fee, item.currency || wallet?.currency || "NGN")}</p>
                  </div>
                  <div className="rounded-2xl bg-stone-50 p-3">
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Destination account</p>
                    <p className="mt-2 font-semibold text-stone-900">{item.destinationAccountNumber || "N/A"}</p>
                  </div>
                  <div className="rounded-2xl bg-stone-50 p-3">
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Bank code</p>
                    <p className="mt-2 font-semibold text-stone-900">{item.destinationBankCode || "N/A"}</p>
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

      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard
          label="Wallet debits in filter"
          value={currency(summary.totalDebits, wallet?.currency || "NGN")}
          hint="Debits from the wallet statement under the current filter"
          icon={ArrowUpRight}
          tone="rose"
        />
        <MetricCard
          label="Recent successful collections"
          value={currency(summary.pendingSettlementsAmount, wallet?.currency || "NGN")}
          hint={`${pendingSettlements.count} recent incoming Monnify collection record${pendingSettlements.count === 1 ? "" : "s"}`}
          icon={ReceiptText}
          tone="amber"
        />
      </div>
    </div>
  );
}
