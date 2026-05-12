"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BriefcaseBusiness,
  CircleSlash,
  Search,
  ShieldAlert,
  Sparkles,
  Users,
  Wallet,
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

const ADMIN_USER_PAGE_SIZE = 50;

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "earner" | "advertiser";
  status: string;
  activated: boolean;
  verified: boolean;
  createdAtMs: number;
  balance: number;
  totalSpent: number;
  totalEarned: number;
  campaignsCreated: number;
  submissionsCount: number;
};

const roleOptions = [
  { value: "all", label: "All roles" },
  { value: "advertiser", label: "Advertisers" },
  { value: "earner", label: "Earners" },
];

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

function mergeUniqueUsers(current: AdminUser[], incoming: AdminUser[]) {
  const userMap = new Map(current.map((user) => [user.id, user]));
  incoming.forEach((user) => {
    userMap.set(user.id, user);
  });

  return Array.from(userMap.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryCounts, setSummaryCounts] = useState({
    totalUsers: 0,
    totalAdvertisers: 0,
    totalEarners: 0,
    activatedUsers: 0,
    suspendedUsers: 0,
  });
  const [roleFilter, setRoleFilter] = useState("all");
  const [activationFilter, setActivationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const [hasMoreEarners, setHasMoreEarners] = useState(true);
  const [hasMoreAdvertisers, setHasMoreAdvertisers] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchingExact, setSearchingExact] = useState(false);
  const [lastVisibleEarner, setLastVisibleEarner] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [lastVisibleAdvertiser, setLastVisibleAdvertiser] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  const mapEarnerData = (id: string, data: DocumentData): AdminUser => {
    return {
      id,
      name: String(data.name || "Unnamed earner"),
      email: String(data.email || ""),
      role: "earner",
      status: String(data.status || "pending"),
      activated: Boolean(data.activated),
      verified: Boolean(data.verified),
      createdAtMs: toMillis(data.createdAt),
      balance: Number(data.balance || 0),
      totalSpent: 0,
      totalEarned: Number(data.totalEarned || 0),
      campaignsCreated: 0,
      submissionsCount: Number(data.submissionsCount || data.leadsPaidFor || 0),
    };
  };

  const mapEarnerDoc = (userDoc: QueryDocumentSnapshot<DocumentData>): AdminUser =>
    mapEarnerData(userDoc.id, userDoc.data());

  const mapAdvertiserData = (id: string, data: DocumentData): AdminUser => {
    return {
      id,
      name: String(data.name || data.companyName || "Unnamed advertiser"),
      email: String(data.email || ""),
      role: "advertiser",
      status: String(data.status || "pending"),
      activated: Boolean(data.activated),
      verified: Boolean(data.verified),
      createdAtMs: toMillis(data.createdAt),
      balance: Number(data.balance || data.walletBalance || 0),
      totalSpent: Number(data.totalSpent || 0),
      totalEarned: 0,
      campaignsCreated: Number(data.campaignsCreated || 0),
      submissionsCount: 0,
    };
  };

  const mapAdvertiserDoc = (userDoc: QueryDocumentSnapshot<DocumentData>): AdminUser =>
    mapAdvertiserData(userDoc.id, userDoc.data());

  const buildUserQuery = useCallback((
    collectionName: "earners" | "advertisers",
    cursor?: QueryDocumentSnapshot<DocumentData> | null
  ) =>
    cursor
      ? query(collection(db, collectionName), orderBy("createdAt", "desc"), startAfter(cursor), limit(ADMIN_USER_PAGE_SIZE))
      : query(collection(db, collectionName), orderBy("createdAt", "desc"), limit(ADMIN_USER_PAGE_SIZE)), []);

  const loadUserPages = useCallback(async ({
    earnersCursor,
    advertisersCursor,
    append,
  }: {
    earnersCursor?: QueryDocumentSnapshot<DocumentData> | null;
    advertisersCursor?: QueryDocumentSnapshot<DocumentData> | null;
    append: boolean;
  }) => {
    const [earnersSnap, advertisersSnap] = await Promise.all([
      hasMoreEarners || !append ? getDocs(buildUserQuery("earners", earnersCursor)) : Promise.resolve(null),
      hasMoreAdvertisers || !append ? getDocs(buildUserQuery("advertisers", advertisersCursor)) : Promise.resolve(null),
    ]);

    const earners = earnersSnap ? earnersSnap.docs.map(mapEarnerDoc) : [];
    const advertisers = advertisersSnap ? advertisersSnap.docs.map(mapAdvertiserDoc) : [];
    const combined = [...advertisers, ...earners].sort((a, b) => b.createdAtMs - a.createdAtMs);

    let nextLoadedCount = combined.length;
    setUsers((current) => {
      const next = append ? mergeUniqueUsers(current, combined) : combined;
      nextLoadedCount = next.length;
      return next;
    });
    setLoadedCount(nextLoadedCount);
    setLastVisibleEarner(earnersSnap?.docs.at(-1) ?? (append ? earnersCursor ?? null : null));
    setLastVisibleAdvertiser(advertisersSnap?.docs.at(-1) ?? (append ? advertisersCursor ?? null : null));
    setHasMoreEarners((earnersSnap?.docs.length ?? 0) === ADMIN_USER_PAGE_SIZE);
    setHasMoreAdvertisers((advertisersSnap?.docs.length ?? 0) === ADMIN_USER_PAGE_SIZE);

    return combined;
  }, [buildUserQuery, hasMoreAdvertisers, hasMoreEarners]);

  const directSearchUsers = useCallback(async (searchText: string) => {
    const trimmed = searchText.trim();
    if (!trimmed) return [] as AdminUser[];

    const [
      earnerDocSnap,
      advertiserDocSnap,
      earnerEmailSnap,
      advertiserEmailSnap,
      earnerNameSnap,
      earnerFullNameSnap,
      advertiserNameSnap,
      advertiserCompanySnap,
    ] =
      await Promise.all([
        getDoc(doc(db, "earners", trimmed)),
        getDoc(doc(db, "advertisers", trimmed)),
        getDocs(query(collection(db, "earners"), where("email", "==", trimmed), limit(1))),
        getDocs(query(collection(db, "advertisers"), where("email", "==", trimmed), limit(1))),
        getDocs(query(collection(db, "earners"), where("name", "==", trimmed), limit(3))),
        getDocs(query(collection(db, "earners"), where("fullName", "==", trimmed), limit(3))),
        getDocs(query(collection(db, "advertisers"), where("name", "==", trimmed), limit(3))),
        getDocs(query(collection(db, "advertisers"), where("companyName", "==", trimmed), limit(3))),
      ]);

    const directMatches: AdminUser[] = [];

    if (earnerDocSnap.exists()) {
      directMatches.push(mapEarnerData(earnerDocSnap.id, earnerDocSnap.data()));
    }
    if (advertiserDocSnap.exists()) {
      directMatches.push(mapAdvertiserData(advertiserDocSnap.id, advertiserDocSnap.data()));
    }

    earnerEmailSnap.docs.forEach((userDoc) => {
      directMatches.push(mapEarnerDoc(userDoc));
    });
    advertiserEmailSnap.docs.forEach((userDoc) => {
      directMatches.push(mapAdvertiserDoc(userDoc));
    });
    earnerNameSnap.docs.forEach((userDoc) => {
      directMatches.push(mapEarnerDoc(userDoc));
    });
    earnerFullNameSnap.docs.forEach((userDoc) => {
      directMatches.push(mapEarnerDoc(userDoc));
    });
    advertiserNameSnap.docs.forEach((userDoc) => {
      directMatches.push(mapAdvertiserDoc(userDoc));
    });
    advertiserCompanySnap.docs.forEach((userDoc) => {
      directMatches.push(mapAdvertiserDoc(userDoc));
    });

    return mergeUniqueUsers([], directMatches);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      try {
        const [
          earnersCountSnap,
          advertisersCountSnap,
          activatedEarnersCountSnap,
          activatedAdvertisersCountSnap,
          suspendedEarnersCountSnap,
          suspendedAdvertisersCountSnap,
        ] =
          await Promise.all([
            getCountFromServer(collection(db, "earners")),
            getCountFromServer(collection(db, "advertisers")),
            getCountFromServer(query(collection(db, "earners"), where("activated", "==", true))),
            getCountFromServer(query(collection(db, "advertisers"), where("activated", "==", true))),
            getCountFromServer(query(collection(db, "earners"), where("status", "==", "suspended"))),
            getCountFromServer(query(collection(db, "advertisers"), where("status", "==", "suspended"))),
          ]);
        await loadUserPages({ append: false });
        setSummaryCounts({
          totalUsers: earnersCountSnap.data().count + advertisersCountSnap.data().count,
          totalAdvertisers: advertisersCountSnap.data().count,
          totalEarners: earnersCountSnap.data().count,
          activatedUsers: activatedEarnersCountSnap.data().count + activatedAdvertisersCountSnap.data().count,
          suspendedUsers: suspendedEarnersCountSnap.data().count + suspendedAdvertisersCountSnap.data().count,
        });
      } catch (error) {
        console.error("Error fetching users:", error);
        toast.error("Failed to load admin users");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [loadUserPages]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const searchText = search.trim().toLowerCase();
      const matchesSearch =
        !searchText ||
        user.name.toLowerCase().includes(searchText) ||
        user.email.toLowerCase().includes(searchText);
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesStatus =
        statusFilter === "all" || user.status.toLowerCase() === statusFilter;
      const matchesActivation =
        activationFilter === "all" ||
        (activationFilter === "activated" ? user.activated : !user.activated);

      return matchesSearch && matchesRole && matchesStatus && matchesActivation;
    });
  }, [activationFilter, roleFilter, search, statusFilter, users]);

  const stats = useMemo(() => {
    return {
      totalUsers: summaryCounts.totalUsers,
      totalAdvertisers: summaryCounts.totalAdvertisers,
      totalEarners: summaryCounts.totalEarners,
      activatedUsers: summaryCounts.activatedUsers,
      suspendedUsers: summaryCounts.suspendedUsers,
      totalWalletValue: users.reduce((sum, user) => sum + user.balance, 0),
    };
  }, [summaryCounts, users]);

  useEffect(() => {
    if (!search.trim() || filteredUsers.length > 0 || loading || searchingExact) {
      return;
    }

    let cancelled = false;

    const searchDirectly = async () => {
      try {
        setSearchingExact(true);
        const directMatches = await directSearchUsers(search);
        if (!cancelled && directMatches.length > 0) {
          let nextLoadedCount = directMatches.length;
          setUsers((current) => {
            const next = mergeUniqueUsers(current, directMatches);
            nextLoadedCount = next.length;
            return next;
          });
          setLoadedCount(nextLoadedCount);
        }
      } catch (error) {
        console.error("Error loading direct user search matches:", error);
      } finally {
        if (!cancelled) {
          setSearchingExact(false);
        }
      }
    };

    void searchDirectly();

    return () => {
      cancelled = true;
    };
  }, [directSearchUsers, filteredUsers.length, loading, search, searchingExact]);

  const handleLoadMoreUsers = useCallback(async () => {
    if ((!hasMoreEarners && !hasMoreAdvertisers) || loadingMore) {
      return;
    }

    try {
      setLoadingMore(true);
      await loadUserPages({
        earnersCursor: lastVisibleEarner,
        advertisersCursor: lastVisibleAdvertiser,
        append: true,
      });
    } catch (error) {
      console.error("Failed to load more users", error);
      toast.error("Failed to load more users");
    } finally {
      setLoadingMore(false);
    }
  }, [hasMoreAdvertisers, hasMoreEarners, lastVisibleAdvertiser, lastVisibleEarner, loadUserPages, loadingMore]);

  const updateUserStatus = async (user: AdminUser, nextStatus: string) => {
    try {
      setUpdatingId(user.id);
      const collectionName = user.role === "earner" ? "earners" : "advertisers";
      const updates: Record<string, unknown> = { status: nextStatus };
      if (user.role === "earner" && nextStatus === "active") {
        updates.strikeCount = 0;
        updates.suspensionReason = deleteField();
        updates.suspendedAt = deleteField();
        updates.lastStrikeUpdatedAt = deleteField();
      }
      await updateDoc(doc(db, collectionName, user.id), updates);
      setUsers((current) =>
        current.map((entry) =>
          entry.id === user.id ? { ...entry, status: nextStatus } : entry
        )
      );
      toast.success(
        user.role === "earner" && nextStatus === "active"
          ? `${user.name} unsuspended and strikes reset`
          : `${user.name} is now ${nextStatus}`
      );
    } catch (error) {
      console.error("Error updating user status:", error);
      toast.error("Failed to update user status");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Admin control"
        title="Users and account health"
        description="Filter by role, activation state, or account status, then jump directly into advertiser and earner timelines with campaign and submission context."
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
          label="Total users"
          value={stats.totalUsers}
          hint={`${stats.activatedUsers} activated`}
          icon={Users}
        />
        <MetricCard
          label="Advertisers"
          value={stats.totalAdvertisers}
          hint={`${stats.totalEarners} earners`}
          icon={BriefcaseBusiness}
          tone="blue"
        />
        <MetricCard
          label="Suspended"
          value={stats.suspendedUsers}
          hint="Accounts currently restricted"
          icon={ShieldAlert}
          tone="rose"
        />
        <MetricCard
          label="Wallet balances"
          value={currency(stats.totalWalletValue)}
          hint="Combined balances from the loaded directory snapshot"
          icon={Wallet}
          tone="emerald"
        />
      </div>

      <SectionCard
        title="Filter users"
        description="Mix role, activation, and status filters to isolate advertisers or earners that need attention."
      >
        <div className="grid gap-3 lg:grid-cols-[1.5fr_repeat(3,minmax(0,0.7fr))]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email"
              className="h-11 rounded-2xl border-stone-200 bg-white pl-10"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-11 rounded-2xl border-stone-200 bg-white">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        title="User directory"
        description={`${filteredUsers.length} loaded account${filteredUsers.length === 1 ? "" : "s"} match the current filters. ${loadedCount} of ${stats.totalUsers} users are currently loaded. Search checks exact id, email, or name directly in Firestore without sweeping the whole directory.`}
      >
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-48 animate-pulse rounded-3xl bg-stone-100"
              />
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          searchingExact ? (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50/80 px-6 py-10 text-center">
              <p className="text-base font-semibold text-stone-900">Searching Firestore</p>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-stone-600">
                Checking exact id, email, and name matches directly.
              </p>
            </div>
          ) : (
            <EmptyState
              title="No users matched"
              description="Try widening the filters or search with the exact email, id, or saved name. Partial search still works on the users already loaded on this page."
            />
          )
        ) : (
          <PaginatedCardList
            items={filteredUsers}
            itemsPerPage={3}
            hasMore={hasMoreEarners || hasMoreAdvertisers}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMoreUsers}
            renderItem={(user) => {
              const detailHref =
                user.role === "advertiser"
                  ? `/admin/advertisers/${user.id}`
                  : `/admin/earners/${user.id}`;

              return (
                <div
                  key={user.id}
                  className="group rounded-3xl border border-stone-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,250,249,0.88))] p-5 shadow-[0_18px_40px_-34px_rgba(28,25,23,0.7)] transition duration-200 hover:-translate-y-1 hover:border-amber-300 hover:shadow-[0_24px_50px_-34px_rgba(217,119,6,0.45)]"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          label={
                            user.role === "advertiser" ? "Advertiser" : "Earner"
                          }
                          tone={user.role === "advertiser" ? "blue" : "amber"}
                        />
                        <StatusBadge
                          label={user.activated ? "Activated" : "Not activated"}
                          tone={user.activated ? "green" : "stone"}
                        />
                        <StatusBadge
                          label={user.status}
                          tone={statusTone(user.status)}
                        />
                        {user.verified ? (
                          <StatusBadge label="Verified" tone="green" />
                        ) : null}
                      </div>

                      <div>
                        <Link
                          href={detailHref}
                          className="text-xl font-semibold text-stone-900 transition group-hover:text-amber-700"
                        >
                          {user.name}
                        </Link>
                        <p className="text-sm text-stone-500">{user.email || "No email recorded"}</p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl bg-stone-50 p-3">
                          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                            Wallet
                          </p>
                          <p className="mt-2 text-lg font-semibold text-stone-900">
                            {currency(user.balance)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-stone-50 p-3">
                          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                            {user.role === "advertiser" ? "Campaigns" : "Submissions"}
                          </p>
                          <p className="mt-2 text-lg font-semibold text-stone-900">
                            {user.role === "advertiser"
                              ? user.campaignsCreated
                              : user.submissionsCount}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-stone-50 p-3">
                          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                            {user.role === "advertiser" ? "Total spent" : "Total earned"}
                          </p>
                          <p className="mt-2 text-lg font-semibold text-stone-900">
                            {currency(
                              user.role === "advertiser"
                                ? user.totalSpent
                                : user.totalEarned
                            )}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-stone-50 p-3">
                          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                            Joined
                          </p>
                          <p className="mt-2 text-sm font-medium text-stone-900">
                            {user.createdAtMs
                              ? new Date(user.createdAtMs).toLocaleString()
                              : "Unknown"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-row gap-2 md:flex-col md:items-end">
                      <Button asChild className="rounded-full bg-stone-900 text-white hover:bg-stone-800">
                        <Link href={detailHref}>Open profile</Link>
                      </Button>
                      {user.status === "active" ? (
                        <Button
                          variant="outline"
                          className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50"
                          disabled={updatingId === user.id}
                          onClick={() => updateUserStatus(user, "suspended")}
                        >
                          <CircleSlash className="h-4 w-4" />
                          Suspend
                        </Button>
                      ) : (
                        <p className="max-w-[12rem] text-right text-xs leading-5 text-stone-500">
                          Activation stays self-service. Admin can review the profile, but not activate the account.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            }}
          />
        )}
      </SectionCard>
    </div>
  );
}
