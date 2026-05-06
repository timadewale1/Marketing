"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Wallet } from "lucide-react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import toast from "react-hot-toast";
import { auth, db } from "@/lib/firebase";
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
  source: "earner" | "advertiser";
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
      const [earnerSnap, advertiserSnap] = await Promise.all([
        getDocs(query(collection(db, "earnerWithdrawals"), orderBy("createdAt", "desc"), limit(ADMIN_WITHDRAWAL_PAGE_LIMIT))),
        getDocs(query(collection(db, "advertiserWithdrawals"), orderBy("createdAt", "desc"), limit(ADMIN_WITHDRAWAL_PAGE_LIMIT))),
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
      const matchesStatus = statusFilter === "all" || withdrawal.status === statusFilter;
      const matchesSearch =
        !term ||
        withdrawal.bank.accountNumber.toLowerCase().includes(term) ||
        withdrawal.bank.accountName.toLowerCase().includes(term) ||
        withdrawal.bank.bankName.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [search, statusFilter, withdrawals]);

  const stats = {
    pending: withdrawals.filter((withdrawal) => withdrawal.status === "pending").length,
    sent: withdrawals.filter((withdrawal) => withdrawal.status === "sent").length,
    totalAmount: withdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0),
  };

  const markAsSent = async (withdrawal: Withdrawal) => {
    try {
      setProcessingId(withdrawal.id);
      const collectionName =
        withdrawal.source === "advertiser" ? "advertiserWithdrawals" : "earnerWithdrawals";
      const txCollection =
        withdrawal.source === "advertiser" ? "advertiserTransactions" : "earnerTransactions";
      const userCollection =
        withdrawal.source === "advertiser" ? "advertisers" : "earners";

      const refDoc = doc(db, collectionName, withdrawal.id);
      const snap = await getDoc(refDoc);
      if (!snap.exists()) throw new Error("Withdrawal request not found");

      const data = snap.data();
      await updateDoc(refDoc, {
        status: "sent",
        sentAt: serverTimestamp(),
        processedBy: auth.currentUser?.uid || null,
      });

      const txsSnap = await getDocs(
        query(
          collection(db, txCollection),
          where("userId", "==", data.userId),
          where("type", "==", "withdrawal_request"),
          where("requestedAmount", "==", data.amount),
          where("status", "==", "pending")
        )
      );

      if (!txsSnap.empty) {
        await Promise.all(
          txsSnap.docs.map((txDoc) =>
            updateDoc(doc(db, txCollection, txDoc.id), {
              amount: -Math.abs(data.amount),
              status: "completed",
              note: "Withdrawal processed by admin",
              completedAt: serverTimestamp(),
            })
          )
        );
      } else {
        await addDoc(collection(db, txCollection), {
          userId: data.userId,
          type: "withdrawal",
          amount: -Math.abs(data.amount),
          fee: data.fee || 0,
          net: data.net || data.amount,
          status: "completed",
          note: "Withdrawal processed by admin",
          createdAt: serverTimestamp(),
        });
      }

      await updateDoc(doc(db, userCollection, data.userId), {
        totalWithdrawn: increment(Number(data.amount) || 0),
      });

      setWithdrawals((current) =>
        current.map((item) =>
          item.id === withdrawal.id ? { ...item, status: "sent" } : item
        )
      );
      toast.success("Marked as sent");
    } catch (error) {
      console.error("Failed to mark withdrawal as sent", error);
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
        description="Review and process earner or advertiser withdrawals from one paginated queue."
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
                      <StatusBadge label={withdrawal.source} tone={withdrawal.source === "earner" ? "amber" : "blue"} />
                      <StatusBadge label={withdrawal.status} tone={withdrawal.status === "sent" ? "green" : "amber"} />
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
                      <Link href={`/admin/${withdrawal.source === "advertiser" ? "advertisers" : "earners"}/${withdrawal.userId}`}>
                        Open user
                      </Link>
                    </Button>
                    {withdrawal.status !== "sent" ? (
                      <Button className="rounded-full bg-stone-900 text-white hover:bg-stone-800" disabled={processingId === withdrawal.id} onClick={() => markAsSent(withdrawal)}>
                        Mark as sent
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
