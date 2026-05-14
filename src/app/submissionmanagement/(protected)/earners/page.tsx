"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CircleSlash,
  Search,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import {
  collection,
  deleteField,
  doc,
  DocumentData,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  QueryDocumentSnapshot,
  startAfter,
  updateDoc,
  where,
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

const SUBMISSION_MANAGEMENT_EARNER_PAGE_SIZE = 50;

type EarnerUser = {
  id: string;
  name: string;
  email: string;
  status: string;
  activated: boolean;
  verified: boolean;
  createdAtMs: number;
  balance: number;
  totalEarned: number;
  submissionsCount: number;
};

const activationOptions = [
  { value: "all", label: "All activation" },
  { value: "activated", label: "Activated" },
  { value: "inactive", label: "Not activated" },
];

const statusOptions = [
  { value: "all", label: "All status" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "suspended", label: "Suspended" },
];

function toMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === "object" && value !== null && "seconds" in value) {
    return Number((value as { seconds?: number }).seconds || 0) * 1000;
  }
  if (value instanceof Date) return value.getTime();
  return 0;
}

function currency(amount: number) {
  return `₦${amount.toLocaleString()}`;
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "green" as const;
  if (normalized === "pending") return "amber" as const;
  if (normalized === "suspended") return "red" as const;
  return "stone" as const;
}

function mergeUniqueEarners(current: EarnerUser[], incoming: EarnerUser[]) {
  const earnerMap = new Map(current.map((earner) => [earner.id, earner]));
  incoming.forEach((earner) => {
    earnerMap.set(earner.id, earner);
  });

  return Array.from(earnerMap.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export default function SubmissionManagementEarnersPage() {
  const [earners, setEarners] = useState<EarnerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryCounts, setSummaryCounts] = useState({
    totalEarners: 0,
    activatedEarners: 0,
    suspendedEarners: 0,
  });
  const [activationFilter, setActivationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchingExact, setSearchingExact] = useState(false);
  const [exactSearchResults, setExactSearchResults] = useState<EarnerUser[] | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const searchRequestRef = useRef(0);

  const mapEarnerData = (id: string, data: DocumentData): EarnerUser => {
    return {
      id,
      name: String(data.name || "Unnamed earner"),
      email: String(data.email || ""),
      status: String(data.status || "pending"),
      activated: Boolean(data.activated),
      verified: Boolean(data.verified),
      createdAtMs: toMillis(data.createdAt),
      balance: Number(data.balance || 0),
      totalEarned: Number(data.totalEarned || 0),
      submissionsCount: Number(data.submissionsCount || data.leadsPaidFor || 0),
    };
  };

  const mapEarnerDoc = (userDoc: QueryDocumentSnapshot<DocumentData>): EarnerUser =>
    mapEarnerData(userDoc.id, userDoc.data());

  const buildEarnersQuery = useCallback((cursor?: QueryDocumentSnapshot<DocumentData> | null) =>
    cursor
      ? query(
          collection(db, "earners"),
          orderBy("createdAt", "desc"),
          startAfter(cursor),
          limit(SUBMISSION_MANAGEMENT_EARNER_PAGE_SIZE)
        )
      : query(
          collection(db, "earners"),
          orderBy("createdAt", "desc"),
          limit(SUBMISSION_MANAGEMENT_EARNER_PAGE_SIZE)
        ), []);

  const loadMoreEarners = useCallback(async ({
    cursor,
    append,
  }: {
    cursor?: QueryDocumentSnapshot<DocumentData> | null;
    append: boolean;
  }) => {
    const snap = await getDocs(buildEarnersQuery(cursor));
    const rows = snap.docs.map(mapEarnerDoc);

    let nextLoadedCount = rows.length;
    setEarners((current) => {
      const next = append ? mergeUniqueEarners(current, rows) : rows;
      nextLoadedCount = next.length;
      return next;
    });
    setLoadedCount(nextLoadedCount);
    setLastVisible(snap.docs.at(-1) ?? null);
    setHasMore(snap.docs.length === SUBMISSION_MANAGEMENT_EARNER_PAGE_SIZE);
    return rows;
  }, [buildEarnersQuery]);

  const directSearchEarners = useCallback(async (searchText: string) => {
    const trimmed = searchText.trim();
    if (!trimmed) return [] as EarnerUser[];

    const [earnerDocSnap, emailSnap, nameSnap, fullNameSnap] = await Promise.all([
      getDoc(doc(db, "earners", trimmed)),
      getDocs(query(collection(db, "earners"), where("email", "==", trimmed), limit(1))),
      getDocs(query(collection(db, "earners"), orderBy("name"), where("name", ">=", trimmed), where("name", "<=", `${trimmed}\uf8ff`), limit(5))),
      getDocs(query(collection(db, "earners"), orderBy("fullName"), where("fullName", ">=", trimmed), where("fullName", "<=", `${trimmed}\uf8ff`), limit(5))),
    ]);

    const directMatches: EarnerUser[] = [];
    if (earnerDocSnap.exists()) {
      directMatches.push(mapEarnerData(earnerDocSnap.id, earnerDocSnap.data()));
    }
    emailSnap.docs.forEach((userDoc) => {
      directMatches.push(mapEarnerDoc(userDoc));
    });
    nameSnap.docs.forEach((userDoc) => {
      directMatches.push(mapEarnerDoc(userDoc));
    });
    fullNameSnap.docs.forEach((userDoc) => {
      directMatches.push(mapEarnerDoc(userDoc));
    });

    return mergeUniqueEarners([], directMatches);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      try {
        const [totalCountSnap, activatedCountSnap, suspendedCountSnap] = await Promise.all([
          getCountFromServer(collection(db, "earners")),
          getCountFromServer(query(collection(db, "earners"), where("activated", "==", true))),
          getCountFromServer(query(collection(db, "earners"), where("status", "==", "suspended"))),
        ]);

        await loadMoreEarners({ append: false });

        setSummaryCounts({
          totalEarners: totalCountSnap.data().count,
          activatedEarners: activatedCountSnap.data().count,
          suspendedEarners: suspendedCountSnap.data().count,
        });
      } catch (error) {
        console.error("Error fetching submission management earners:", error);
        toast.error("Failed to load earners");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [loadMoreEarners]);

  const applyDirectoryFilters = useCallback((list: EarnerUser[]) => {
    return list.filter((earner) => {
      const matchesStatus =
        statusFilter === "all" || earner.status.toLowerCase() === statusFilter;
      const matchesActivation =
        activationFilter === "all" ||
        (activationFilter === "activated" ? earner.activated : !earner.activated);

      return matchesStatus && matchesActivation;
    });
  }, [activationFilter, statusFilter]);

  const browseEarners = useMemo(() => {
    const searchText = search.trim().toLowerCase();
    return applyDirectoryFilters(earners).filter((earner) => {
      if (!searchText) return true;
      return (
        earner.name.toLowerCase().includes(searchText) ||
        earner.email.toLowerCase().includes(searchText)
      );
    });
  }, [applyDirectoryFilters, earners, search]);

  const stats = useMemo(() => {
    return {
      totalEarners: summaryCounts.totalEarners,
      activatedEarners: summaryCounts.activatedEarners,
      suspendedEarners: summaryCounts.suspendedEarners,
    };
  }, [summaryCounts]);

  useEffect(() => {
    const searchTerm = search.trim();
    if (!searchTerm) {
      setExactSearchResults(null);
      setSearchingExact(false);
      return;
    }

    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    const timeoutId = window.setTimeout(async () => {
      try {
        setSearchingExact(true);
        const directMatches = await directSearchEarners(searchTerm);
        if (searchRequestRef.current !== requestId) return;
        setExactSearchResults(directMatches);
      } catch (error) {
        console.error("Error loading direct earner search matches:", error);
        if (searchRequestRef.current === requestId) {
          setExactSearchResults([]);
        }
      } finally {
        if (searchRequestRef.current === requestId) {
          setSearchingExact(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [directSearchEarners, search]);

  const filteredEarners = useMemo(() => {
    if (search.trim()) {
      return applyDirectoryFilters(exactSearchResults || []);
    }
    return browseEarners;
  }, [applyDirectoryFilters, browseEarners, exactSearchResults, search]);

  const handleLoadMoreEarners = useCallback(async () => {
    if (!lastVisible || !hasMore || loadingMore) {
      return;
    }

    try {
      setLoadingMore(true);
      await loadMoreEarners({ cursor: lastVisible, append: true });
    } catch (error) {
      console.error("Failed to load more earners", error);
      toast.error("Failed to load more earners");
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, lastVisible, loadMoreEarners, loadingMore]);

  const updateEarnerStatus = async (earner: EarnerUser, nextStatus: string) => {
    try {
      setUpdatingId(earner.id);
      const updates: Record<string, unknown> = { status: nextStatus };
      if (nextStatus === "active") {
        updates.strikeCount = 0;
        updates.suspensionReason = deleteField();
        updates.suspendedAt = deleteField();
        updates.suspensionReleaseAt = deleteField();
        updates.suspensionDurationDays = deleteField();
        updates.suspensionIndefinite = deleteField();
        updates.lastStrikeUpdatedAt = deleteField();
      }
      await updateDoc(doc(db, "earners", earner.id), updates);
      setEarners((current) =>
        current.map((entry) =>
          entry.id === earner.id ? { ...entry, status: nextStatus } : entry
        )
      );
      toast.success(
        nextStatus === "active"
          ? `${earner.name} unsuspended and strikes reset`
          : `${earner.name} is now ${nextStatus}`
      );
    } catch (error) {
      console.error("Error updating earner status:", error);
      toast.error("Failed to update earner status");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Submission management"
        title="Earner directory"
        description="Review earner account health, open detailed moderation context, and suspend or restore accounts when moderation requires it."
        action={
          <Button
            variant="outline"
            className="rounded-full border-stone-300 bg-white/80"
            onClick={() => window.location.reload()}
          >
            <Sparkles className="h-4 w-4" />
            Refresh snapshot
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total earners"
          value={stats.totalEarners}
          hint={`${stats.activatedEarners} activated`}
          icon={Users}
        />
        <MetricCard
          label="Suspended"
          value={stats.suspendedEarners}
          hint="Accounts currently restricted"
          icon={ShieldAlert}
          tone="rose"
        />
        <MetricCard
          label="Active moderation pool"
          value={stats.totalEarners - stats.suspendedEarners}
          hint="Earners available for review and campaign participation"
          icon={CircleSlash}
          tone="blue"
        />
      </div>

      <SectionCard
        title="Filter earners"
        description="Search earners and narrow by activation state or moderation status."
      >
        <div className="grid gap-3 lg:grid-cols-[1.5fr_repeat(2,minmax(0,0.7fr))]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email"
              className="h-11 rounded-2xl border-stone-200 bg-white pl-10"
            />
          </div>
          <Select value={activationFilter} onValueChange={setActivationFilter}>
            <SelectTrigger className="h-11 rounded-2xl border-stone-200 bg-white">
              <SelectValue placeholder="Activation" />
            </SelectTrigger>
            <SelectContent>
              {activationOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-11 rounded-2xl border-stone-200 bg-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      <SectionCard
        title="Earner list"
        description={search.trim()
          ? `${filteredEarners.length} earner${filteredEarners.length === 1 ? "" : "s"} match this search. Exact search queries Firestore directly by id, email, or saved name.`
          : `${filteredEarners.length} loaded earner${filteredEarners.length === 1 ? "" : "s"} match the current filters. ${loadedCount} of ${stats.totalEarners} earners are currently loaded.`}
      >
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-48 animate-pulse rounded-3xl bg-stone-100" />
            ))}
          </div>
        ) : search.trim() && searchingExact ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50/80 px-6 py-10 text-center">
            <p className="text-base font-semibold text-stone-900">Searching Firestore</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-stone-600">
              Looking for exact id, email, or saved name matches.
            </p>
          </div>
        ) : filteredEarners.length === 0 ? (
          searchingExact ? (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50/80 px-6 py-10 text-center">
              <p className="text-base font-semibold text-stone-900">Searching Firestore</p>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-stone-600">
                Checking exact id, email, and name matches directly.
              </p>
            </div>
          ) : (
            <EmptyState
              title="No earners matched"
              description="Try widening the filters or search with the exact email, id, or saved name. Partial search still works on the earners already loaded on this page."
            />
          )
        ) : (
          <PaginatedCardList
            items={filteredEarners}
            itemsPerPage={3}
            hasMore={!search.trim() && hasMore}
            loadingMore={!search.trim() && loadingMore}
            onLoadMore={!search.trim() ? handleLoadMoreEarners : undefined}
            renderItem={(earner) => (
              <div
                key={earner.id}
                className="group rounded-3xl border border-stone-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,250,249,0.88))] p-5 shadow-[0_18px_40px_-34px_rgba(28,25,23,0.7)] transition duration-200 hover:-translate-y-1 hover:border-amber-300 hover:shadow-[0_24px_50px_-34px_rgba(217,119,6,0.45)]"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge label="Earner" tone="amber" />
                      <StatusBadge
                        label={earner.activated ? "Activated" : "Not activated"}
                        tone={earner.activated ? "green" : "stone"}
                      />
                      <StatusBadge label={earner.status} tone={statusTone(earner.status)} />
                      {earner.verified ? <StatusBadge label="Verified" tone="green" /> : null}
                    </div>

                    <div>
                      <Link
                        href={`/submissionmanagement/earners/${earner.id}`}
                        className="text-xl font-semibold text-stone-900 transition group-hover:text-amber-700"
                      >
                        {earner.name}
                      </Link>
                      <p className="text-sm text-stone-500">{earner.email || "No email recorded"}</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-stone-50 p-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Submissions</p>
                        <p className="mt-2 text-lg font-semibold text-stone-900">{earner.submissionsCount}</p>
                      </div>
                      <div className="rounded-2xl bg-stone-50 p-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Total earned</p>
                        <p className="mt-2 text-lg font-semibold text-stone-900">{currency(earner.totalEarned)}</p>
                      </div>
                      <div className="rounded-2xl bg-stone-50 p-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Joined</p>
                        <p className="mt-2 text-sm font-medium text-stone-900">
                          {earner.createdAtMs ? new Date(earner.createdAtMs).toLocaleString() : "Unknown"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-row gap-2 md:flex-col md:items-end">
                    <Button asChild className="rounded-full bg-stone-900 text-white hover:bg-stone-800">
                      <Link href={`/submissionmanagement/earners/${earner.id}`}>Open profile</Link>
                    </Button>
                    {earner.status === "active" ? (
                      <Button
                        variant="outline"
                        className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50"
                        disabled={updatingId === earner.id}
                        onClick={() => updateEarnerStatus(earner, "suspended")}
                      >
                        <CircleSlash className="h-4 w-4" />
                        Suspend
                      </Button>
                    ) : earner.status === "suspended" ? (
                      <Button
                        variant="outline"
                        className="rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        disabled={updatingId === earner.id}
                        onClick={() => updateEarnerStatus(earner, "active")}
                      >
                        <Sparkles className="h-4 w-4" />
                        Unsuspend
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
