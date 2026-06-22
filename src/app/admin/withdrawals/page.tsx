"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Wallet } from "lucide-react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import toast from "react-hot-toast";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AdminPageHeader,
  EmptyState,
  MetricCard,
  PaginatedCardList,
  SectionCard,
  StatusBadge,
} from "@/app/admin/_components/admin-primitives";

const ADMIN_WITHDRAWAL_PAGE_LIMIT = 200;

type Withdrawal = {
  id: string;
  userId: string;
  amount: number;
  status: string;
  source: "earner" | "advertiser" | "vendor" | "customer";
  createdAtMs: number;
  bank: {
    accountNumber: string;
    bankName: string;
    accountName: string;
  };
};

function toMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === "object" && value !== null && "seconds" in value) {
    return Number((value as { seconds?: number }).seconds || 0) * 1000;
  }
  return value instanceof Date ? value.getTime() : 0;
}

function currency(amount: number) {
  return `₦${amount.toLocaleString()}`;
}

export default function WithdrawalsPage() {
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [earnerSnap, advertiserSnap, vendorSnap, customerSnap] = await Promise.all([
        getDocs(query(collection(db, "earnerWithdrawals"), orderBy("createdAt", "desc"), limit(ADMIN_WITHDRAWAL_PAGE_LIMIT))),
        getDocs(query(collection(db, "advertiserWithdrawals"), orderBy("createdAt", "desc"), limit(ADMIN_WITHDRAWAL_PAGE_LIMIT))),
        getDocs(query(collection(db, "vendorWithdrawals"), orderBy("createdAt", "desc"), limit(ADMIN_WITHDRAWAL_PAGE_LIMIT))),
        getDocs(query(collection(db, "customerWithdrawals"), orderBy("createdAt", "desc"), limit(ADMIN_WITHDRAWAL_PAGE_LIMIT))),
      ]);

      const rows: Withdrawal[] = [
        ...earnerSnap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            userId: String(data.userId || ""),
            amount: Number(data.amount || 0),
            status: String(data.status || ""),
            source: "earner" as const,
            createdAtMs: toMillis(data.createdAt),
            bank: {
              accountNumber: String(data.bank?.accountNumber || ""),
              bankName: String(data.bank?.bankName || ""),
              accountName: String(data.bank?.accountName || ""),
            },
          };
        }),
        ...advertiserSnap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            userId: String(data.userId || ""),
            amount: Number(data.amount || 0),
            status: String(data.status || ""),
            source: "advertiser" as const,
            createdAtMs: toMillis(data.createdAt),
            bank: {
              accountNumber: String(data.bank?.accountNumber || ""),
              bankName: String(data.bank?.bankName || ""),
              accountName: String(data.bank?.accountName || ""),
            },
          };
        }),
        ...vendorSnap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            userId: String(data.userId || ""),
            amount: Number(data.amount || 0),
            status: String(data.status || ""),
            source: "vendor" as const,
            createdAtMs: toMillis(data.createdAt),
            bank: {
              accountNumber: String(data.bank?.accountNumber || ""),
              bankName: String(data.bank?.bankName || ""),
              accountName: String(data.bank?.accountName || ""),
            },
          };
        }),
        ...customerSnap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            userId: String(data.userId || ""),
            amount: Number(data.amount || 0),
            status: String(data.status || ""),
            source: "customer" as const,
            createdAtMs: toMillis(data.createdAt),
            bank: {
              accountNumber: String(data.bank?.accountNumber || ""),
              bankName: String(data.bank?.bankName || ""),
              accountName: String(data.bank?.accountName || ""),
            },
          };
        }),
      ].sort((a, b) => b.createdAtMs - a.createdAtMs);

      setWithdrawals(rows);
      setLoading(false);
    };

    load().catch((error) => {
      console.error("Failed to load withdrawals", error);
      toast.error("Failed to load withdrawals");
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return withdrawals.filter((withdrawal) => {
      const normalizedStatus = String(withdrawal.status || "").toLowerCase();
      const isActionablePending =
        normalizedStatus === "pending" || normalizedStatus === "pending_admin_approval";
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "pending"
            ? isActionablePending
            : normalizedStatus === statusFilter;
      const matchesSearch =
        !term ||
        withdrawal.bank.accountNumber.toLowerCase().includes(term) ||
        withdrawal.bank.accountName.toLowerCase().includes(term) ||
        withdrawal.bank.bankName.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [search, statusFilter, withdrawals]);

  const stats = {
    pending: withdrawals.filter((withdrawal) => {
      const status = String(withdrawal.status || "").toLowerCase();
      return status === "pending" || status === "pending_admin_approval";
    }).length,
    sent: withdrawals.filter((withdrawal) => {
      const status = String(withdrawal.status || "").toLowerCase();
      return status === "sent" || status === "completed";
    }).length,
    totalAmount: withdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0),
  };

  const approveWithdrawal = async (withdrawal: Withdrawal) => {
    try {
      setProcessingId(withdrawal.id);
      const response = await fetch("/api/admin/withdrawals/approve", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withdrawalId: withdrawal.id, source: withdrawal.source }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to approve withdrawal");
      }

      setWithdrawals((current) =>
        current.map((item) =>
          item.id === withdrawal.id ? { ...item, status: "sent" } : item
        )
      );
      toast.success("Withdrawal approved and payout started");
    } catch (error) {
      console.error("Failed to approve withdrawal", error);
      toast.error(error instanceof Error ? error.message : "Failed to update withdrawal");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Payout queue"
        title="Withdrawal requests"
        description="Review and process earner, advertiser, vendor, and customer withdrawals from one paginated queue."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Pending" value={stats.pending} hint="Awaiting payout" icon={Wallet} tone="amber" />
        <MetricCard label="Sent" value={stats.sent} hint="Already processed" icon={Wallet} tone="emerald" />
        <MetricCard label="Total amount" value={currency(stats.totalAmount)} hint="Across visible requests" icon={Wallet} />
      </div>

      <SectionCard title="Filters" description="Search bank details or limit by payout status.">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_0.7fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by bank or account details" className="h-11 rounded-2xl border-stone-200 bg-white pl-10" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-11 rounded-2xl border-stone-200 bg-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="pending_admin_approval">Waiting for admin approval</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      <SectionCard title="Withdrawal cards" description={`${filtered.length} withdrawal${filtered.length === 1 ? "" : "s"} matched the current filters.`}>
        {loading ? (
          <div className="h-48 animate-pulse rounded-3xl bg-stone-100" />
        ) : filtered.length === 0 ? (
          <EmptyState title="No withdrawals" description="No withdrawal requests matched the current filters." />
        ) : (
          <PaginatedCardList
            items={filtered}
            itemsPerPage={3}
            renderItem={(withdrawal) => (
              <div key={withdrawal.id} className="rounded-3xl border border-stone-200 bg-white p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-stone-900">{currency(withdrawal.amount)}</p>
                      <StatusBadge label={withdrawal.source} tone={withdrawal.source === "earner" ? "amber" : withdrawal.source === "customer" ? "green" : "blue"} />
                      <StatusBadge
                        label={withdrawal.status === "pending_admin_approval" ? "waiting for admin approval" : withdrawal.status}
                        tone={withdrawal.status === "sent" || withdrawal.status === "completed" ? "green" : "amber"}
                      />
                    </div>
                    <p className="text-sm text-stone-500">
                      {withdrawal.bank.bankName} • {withdrawal.bank.accountNumber} • {withdrawal.bank.accountName}
                    </p>
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                      {withdrawal.createdAtMs ? new Date(withdrawal.createdAtMs).toLocaleString() : "Unknown date"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" className="rounded-full">
                      <Link href={withdrawal.source === "vendor" ? "/admin/vendors" : withdrawal.source === "customer" ? `/admin/users/${withdrawal.userId}` : `/admin/${withdrawal.source === "advertiser" ? "advertisers" : "earners"}/${withdrawal.userId}`}>
                        Open user
                      </Link>
                    </Button>
                    {withdrawal.status !== "sent" && withdrawal.status !== "completed" ? (
                      <Button className="rounded-full bg-stone-900 text-white hover:bg-stone-800" disabled={processingId === withdrawal.id} onClick={() => approveWithdrawal(withdrawal)}>
                        Approve & send
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          />
        )}
      </SectionCard>
    </div>
  );
}
