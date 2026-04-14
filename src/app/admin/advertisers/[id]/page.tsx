"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  BanknoteArrowDown,
  BriefcaseBusiness,
  ExternalLink,
  PauseCircle,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import toast from "react-hot-toast";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import {
  AdminPageHeader,
  EmptyState,
  MetricCard,
  PaginatedCardList,
  SectionCard,
  StatusBadge,
} from "@/app/admin/_components/admin-primitives";
import { getProofUrls } from "@/lib/proofs";

type Advertiser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  companyName: string;
  companyBio: string;
  status: string;
  activated: boolean;
  verified: boolean;
  balance: number;
  totalSpent: number;
  campaignsCreated: number;
  createdAtMs: number;
  bank?: {
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
    verified?: boolean;
  };
};

type Campaign = {
  id: string;
  title: string;
  category: string;
  status: string;
  budget: number;
  reservedBudget: number;
  originalBudget: number;
  earnerPrice: number;
  generatedLeads: number;
  estimatedLeads: number;
  createdAtMs: number;
};

type AdvertiserTransaction = {
  id: string;
  type: string;
  amount: number;
  note: string;
  status: string;
  createdAtMs: number;
  campaignId?: string;
};

type Submission = {
  id: string;
  campaignId: string;
  campaignTitle: string;
  userId: string;
  status: string;
  proofUrl: string;
  proofUrls: string[];
  createdAtMs: number;
};

type Referral = {
  id: string;
  referredId: string;
  amount: number;
  status: string;
  bonusPaid: boolean;
  createdAtMs: number;
  completedAtMs: number;
};

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

export default function AdvertiserAdminDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [advertiser, setAdvertiser] = useState<Advertiser | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [transactions, setTransactions] = useState<AdvertiserTransaction[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [activationBusy, setActivationBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const advertiserSnap = await getDoc(doc(db, "advertisers", id));
        if (!advertiserSnap.exists()) {
          setAdvertiser(null);
          return;
        }

        const advertiserData = advertiserSnap.data();
        const rawStatus = String(advertiserData.status || "active").toLowerCase();
        const normalizedStatus = rawStatus === "suspended" ? "suspended" : "active";
        setAdvertiser({
          id: advertiserSnap.id,
          name: String(advertiserData.name || advertiserData.companyName || "Unnamed advertiser"),
          email: String(advertiserData.email || ""),
          phone: String(advertiserData.phone || ""),
          companyName: String(advertiserData.companyName || ""),
          companyBio: String(advertiserData.companyBio || ""),
          status: normalizedStatus,
          activated: Boolean(advertiserData.activated),
          verified: Boolean(advertiserData.verified),
          balance: Number(advertiserData.balance || advertiserData.walletBalance || 0),
          totalSpent: Number(advertiserData.totalSpent || 0),
          campaignsCreated: Number(advertiserData.campaignsCreated || 0),
          createdAtMs: toMillis(advertiserData.createdAt),
          bank: advertiserData.bank as Advertiser["bank"],
        });

        const [campaignsSnap, transactionsSnap, referralsSnap] = await Promise.all([
          getDocs(
            query(collection(db, "campaigns"), where("ownerId", "==", id), orderBy("createdAt", "desc"))
          ),
          getDocs(
            query(
              collection(db, "advertiserTransactions"),
              where("userId", "==", id),
              orderBy("createdAt", "desc")
            )
          ),
          getDocs(
            query(
              collection(db, "referrals"),
              where("referrerId", "==", id),
              orderBy("createdAt", "desc")
            )
          ),
        ]);

        const campaignRows = campaignsSnap.docs.map((campaignDoc) => {
          const data = campaignDoc.data();
          return {
            id: campaignDoc.id,
            title: String(data.title || "Untitled campaign"),
            category: String(data.category || "Unknown"),
            status: String(data.status || "Unknown"),
            budget: Number(data.budget || 0),
            reservedBudget: Number(data.reservedBudget || 0),
            originalBudget: Number(data.originalBudget || 0),
            earnerPrice: Number(data.earnerPrice || data.costPerLead || 0),
            generatedLeads: Number(data.generatedLeads || data.completedLeads || 0),
            estimatedLeads: Number(data.estimatedLeads || data.targetLeads || 0),
            createdAtMs: toMillis(data.createdAt),
          };
        });
        setCampaigns(campaignRows);

        setTransactions(
          transactionsSnap.docs.map((transactionDoc) => {
            const data = transactionDoc.data();
            return {
              id: transactionDoc.id,
              type: String(data.type || "unknown"),
              amount: Number(data.amount || 0),
              note: String(data.note || ""),
              status: String(data.status || "unknown"),
              createdAtMs: toMillis(data.createdAt),
              campaignId: data.campaignId ? String(data.campaignId) : undefined,
            };
          })
        );

        setReferrals(
          referralsSnap.docs.map((referralDoc) => {
            const data = referralDoc.data();
            return {
              id: referralDoc.id,
              referredId: String(data.referredId || ""),
              amount: Number(data.amount || 0),
              status: String(data.status || "pending"),
              bonusPaid: Boolean(data.bonusPaid),
              createdAtMs: toMillis(data.createdAt),
              completedAtMs: toMillis(data.completedAt || data.paidAt),
            };
          })
        );

        if (campaignRows.length > 0) {
          const submissionSnaps = await Promise.all(
            campaignRows.map((campaign) =>
              getDocs(
                query(
                  collection(db, "earnerSubmissions"),
                  where("campaignId", "==", campaign.id),
                  orderBy("createdAt", "desc")
                )
              )
            )
          );

          const submissionRows = submissionSnaps
            .flatMap((snap) => snap.docs)
            .map((submissionDoc) => {
              const data = submissionDoc.data();
              return {
                id: submissionDoc.id,
                campaignId: String(data.campaignId || ""),
                campaignTitle: String(data.campaignTitle || ""),
                userId: String(data.userId || ""),
                status: String(data.status || ""),
                proofUrl: String(data.proofUrl || ""),
                proofUrls: getProofUrls(data as { proofUrl?: unknown; proofUrls?: unknown }),
                createdAtMs: toMillis(data.createdAt),
              };
            })
            .sort((a, b) => b.createdAtMs - a.createdAtMs);

          setSubmissions(submissionRows);
        } else {
          setSubmissions([]);
        }
      } catch (error) {
        console.error("Failed to load advertiser admin detail", error);
        toast.error("Failed to load advertiser details");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  const summary = useMemo(() => {
    const activeCampaigns = campaigns.filter((campaign) => campaign.status === "Active").length;
    const pendingSubmissions = submissions.filter(
      (submission) => submission.status === "Pending"
    ).length;
    const verifiedSubmissions = submissions.filter(
      (submission) => submission.status === "Verified"
    ).length;
    const totalVisibleBudget = campaigns.reduce(
      (sum, campaign) => sum + campaign.budget + campaign.reservedBudget,
      0
    );
    const pendingReferrals = referrals.filter((referral) => referral.status.toLowerCase() !== "completed").length;
    const completedReferrals = referrals.filter((referral) => referral.status.toLowerCase() === "completed").length;

    return {
      activeCampaigns,
      pendingSubmissions,
      verifiedSubmissions,
      totalVisibleBudget,
      pendingReferrals,
      completedReferrals,
    };
  }, [campaigns, submissions, referrals]);

  const updateStatus = async (status: string) => {
    try {
      setUpdatingStatus(true);
      await updateDoc(doc(db, "advertisers", id), { status });
      setAdvertiser((current) => (current ? { ...current, status } : current));
      toast.success(`Advertiser set to ${status}`);
    } catch (error) {
      console.error("Failed to update advertiser status", error);
      toast.error("Failed to update advertiser status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleActivationAction = async (action: "activate_user" | "deactivate_user") => {
    if (!advertiser) return;
    if (action === "deactivate_user") {
      const confirmed = window.confirm("Deactivate this user and reverse all related activity?");
      if (!confirmed) return;
    }

    try {
      setActivationBusy(true);
      const response = await fetch("/api/admin/users/activation", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, userId: id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        throw new Error(data.message || "Failed to update activation");
      }
      const nextActivated = action === "activate_user";
      setAdvertiser((current) => (current ? { ...current, activated: nextActivated } : current));
      toast.success(nextActivated ? "User activated" : "User deactivated");
    } catch (error) {
      console.error("Failed to update activation", error);
      toast.error(error instanceof Error ? error.message : "Failed to update activation");
    } finally {
      setActivationBusy(false);
    }
  };

  if (loading) {
    return <div className="h-64 animate-pulse rounded-3xl bg-stone-100" />;
  }

  if (!advertiser) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          eyebrow="Advertiser profile"
          title="Advertiser not found"
          description="This advertiser record is missing from Firestore."
        />
        <EmptyState
          title="No advertiser record"
          description="Double-check the advertiser id in the URL or verify the account still exists in the advertisers collection."
          href="/admin/users"
          cta="Back to users"
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Advertiser profile"
        title={advertiser.name}
        description={`Track wallet, campaigns, spend, and every submission flowing through ${advertiser.companyName || "this advertiser"} from one place.`}
        action={
          <div className="flex flex-wrap gap-2">
            {advertiser.status === "active" ? (
              <Button
                variant="outline"
                className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50"
                disabled={updatingStatus}
                onClick={() => updateStatus("suspended")}
              >
                <PauseCircle className="h-4 w-4" />
                Suspend
              </Button>
            ) : (
              <Button
                variant="outline"
                className="rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                disabled={updatingStatus}
                onClick={() => updateStatus("active")}
              >
                <ShieldCheck className="h-4 w-4" />
                Unsuspend
              </Button>
            )}
            {advertiser.activated ? (
              <Button
                variant="destructive"
                className="rounded-full"
                disabled={activationBusy}
                onClick={() => handleActivationAction("deactivate_user")}
              >
                {activationBusy ? "Deactivating..." : "Deactivate user"}
              </Button>
            ) : (
              <Button
                className="rounded-full bg-stone-900 text-white hover:bg-stone-800"
                disabled={activationBusy}
                onClick={() => handleActivationAction("activate_user")}
              >
                {activationBusy ? "Activating..." : "Activate user"}
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <StatusBadge label={advertiser.status} tone={advertiser.status === "active" ? "green" : advertiser.status === "suspended" ? "red" : "amber"} />
        <StatusBadge
          label={advertiser.activated ? "Activated" : "Not activated"}
          tone={advertiser.activated ? "green" : "stone"}
        />
        <StatusBadge
          label={advertiser.verified ? "Verified bank/profile" : "Unverified"}
          tone={advertiser.verified ? "blue" : "amber"}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Wallet"
          value={currency(advertiser.balance)}
          hint="Current advertiser balance"
          icon={Wallet}
        />
        <MetricCard
          label="Total spent"
          value={currency(advertiser.totalSpent)}
          hint={`${campaigns.length} campaigns found`}
          icon={BanknoteArrowDown}
          tone="rose"
        />
        <MetricCard
          label="Active campaigns"
          value={summary.activeCampaigns}
          hint={`${summary.pendingSubmissions} pending submissions`}
          icon={BriefcaseBusiness}
          tone="blue"
        />
        <MetricCard
          label="Visible budget"
          value={currency(summary.totalVisibleBudget)}
          hint={`${summary.verifiedSubmissions} verified submissions`}
          icon={Activity}
          tone="emerald"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_1.35fr]">
        <SectionCard
          title="Profile and banking"
          description="Identity, contact, and payout configuration for this advertiser."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Contact</p>
              <div className="mt-3 space-y-2 text-sm text-stone-700">
                <p>{advertiser.email || "No email"}</p>
                <p>{advertiser.phone || "No phone number"}</p>
                <p>
                  Joined{" "}
                  {advertiser.createdAtMs
                    ? new Date(advertiser.createdAtMs).toLocaleString()
                    : "Unknown"}
                </p>
              </div>
            </div>
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Company</p>
              <div className="mt-3 space-y-2 text-sm text-stone-700">
                <p className="font-medium text-stone-900">
                  {advertiser.companyName || "No company name"}
                </p>
                <p>{advertiser.companyBio || "No company bio recorded."}</p>
              </div>
            </div>
            <div className="rounded-2xl bg-stone-50 p-4 md:col-span-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Bank details</p>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm text-stone-700">
                <p>{advertiser.bank?.bankName || "No bank name"}</p>
                <p>{advertiser.bank?.accountNumber || "No account number"}</p>
                <p>{advertiser.bank?.accountName || "No account name"}</p>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Campaigns"
          description="Campaigns are clickable and open the admin campaign detail page with full stats and proof management."
        >
          {campaigns.length === 0 ? (
            <EmptyState
              title="No campaigns yet"
              description="This advertiser has not created any campaigns that are still visible in the campaigns collection."
            />
          ) : (
            <PaginatedCardList
              items={campaigns}
              itemsPerPage={3}
              renderItem={(campaign) => (
                <div
                  key={campaign.id}
                  className="rounded-2xl border border-stone-200 bg-white p-4 transition hover:border-amber-300 hover:shadow-sm"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/campaigns/${campaign.id}`}
                          className="text-base font-semibold text-stone-900 hover:text-amber-700"
                        >
                          {campaign.title}
                        </Link>
                        <StatusBadge
                          label={campaign.status}
                          tone={
                            campaign.status === "Active"
                              ? "green"
                              : campaign.status === "Paused"
                                ? "amber"
                                : campaign.status === "Deleted"
                                  ? "red"
                                  : "blue"
                          }
                        />
                      </div>
                      <p className="text-sm text-stone-500">
                        {campaign.category} • {campaign.createdAtMs ? new Date(campaign.createdAtMs).toLocaleString() : "Unknown date"}
                      </p>
                    </div>
                    <Button asChild variant="outline" className="rounded-full">
                      <Link href={`/admin/campaigns/${campaign.id}`}>
                        Open campaign
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl bg-stone-50 p-3">
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Original budget</p>
                      <p className="mt-2 font-semibold text-stone-900">
                        {currency(campaign.originalBudget || campaign.budget + campaign.reservedBudget)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-stone-50 p-3">
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Available</p>
                      <p className="mt-2 font-semibold text-stone-900">
                        {currency(campaign.budget)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-stone-50 p-3">
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Reserved</p>
                      <p className="mt-2 font-semibold text-stone-900">
                        {currency(campaign.reservedBudget)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-stone-50 p-3">
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Leads</p>
                      <p className="mt-2 font-semibold text-stone-900">
                        {campaign.generatedLeads}/{campaign.estimatedLeads || 0}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            />
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.95fr]">
        <SectionCard
          title="Campaign submissions"
          description="Recent proof submissions across this advertiser's campaigns. Use the campaign link to review and verify from the full detail page."
        >
          {submissions.length === 0 ? (
            <EmptyState
              title="No submissions yet"
              description="No earner proof has been submitted for this advertiser's campaigns yet."
            />
          ) : (
            <PaginatedCardList
              items={submissions}
              itemsPerPage={3}
              renderItem={(submission) => (
                <div
                  key={submission.id}
                  className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/campaigns/${submission.campaignId}`}
                        className="font-medium text-stone-900 hover:text-amber-700"
                      >
                        {submission.campaignTitle || submission.campaignId}
                      </Link>
                      <StatusBadge
                        label={submission.status}
                        tone={
                          submission.status === "Verified"
                            ? "green"
                            : submission.status === "Rejected"
                              ? "red"
                              : "amber"
                        }
                      />
                    </div>
                    <p className="text-sm text-stone-500">
                      Earner {submission.userId} •{" "}
                      {submission.createdAtMs
                        ? new Date(submission.createdAtMs).toLocaleString()
                        : "Unknown date"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {submission.proofUrls.length > 0 ? (
                      submission.proofUrls.map((proof, index) => (
                        <Button key={`${submission.id}-proof-${index}`} asChild variant="outline" className="rounded-full">
                          <Link href={proof} target="_blank">
                            Proof {index + 1}
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      ))
                    ) : null}
                    <Button asChild className="rounded-full bg-stone-900 text-white hover:bg-stone-800">
                      <Link href={`/admin/campaigns/${submission.campaignId}`}>
                        Review campaign
                      </Link>
                    </Button>
                  </div>
                </div>
              )}
            />
          )}
        </SectionCard>

        <div className="space-y-6">
          <SectionCard
            title="Referrals"
            description="Referral bonuses earned by this advertiser, split between pending and completed payouts."
          >
            {referrals.length === 0 ? (
              <EmptyState
                title="No referrals"
                description="This advertiser has not referred any users yet."
              />
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl bg-amber-50 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-amber-700">Pending</p>
                    <p className="mt-2 text-2xl font-semibold text-stone-900">{summary.pendingReferrals}</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-emerald-700">Completed</p>
                    <p className="mt-2 text-2xl font-semibold text-stone-900">{summary.completedReferrals}</p>
                  </div>
                </div>
                <PaginatedCardList
                  items={referrals}
                  itemsPerPage={3}
                  renderItem={(referral) => (
                    <div key={referral.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-stone-900">{currency(referral.amount)}</p>
                          <p className="mt-1 text-sm text-stone-500">Referred user: {referral.referredId || "Unknown"}</p>
                          <p className="mt-2 text-xs uppercase tracking-[0.24em] text-stone-400">
                            {referral.createdAtMs ? new Date(referral.createdAtMs).toLocaleString() : "Unknown date"}
                          </p>
                        </div>
                        <StatusBadge
                          label={referral.status}
                          tone={referral.status.toLowerCase() === "completed" ? "green" : "amber"}
                        />
                      </div>
                    </div>
                  )}
                />
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Transaction timeline"
            description="Advertiser payments, refunds, and spend events tied to campaigns."
          >
            {transactions.length === 0 ? (
              <EmptyState
                title="No transactions"
                description="No advertiser transactions were found for this account."
              />
            ) : (
              <PaginatedCardList
                items={transactions}
                itemsPerPage={3}
                renderItem={(transaction) => (
                  <div
                    key={transaction.id}
                    className="rounded-2xl border border-stone-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium capitalize text-stone-900">
                          {transaction.type.replace(/_/g, " ")}
                        </p>
                        <p className="mt-1 text-sm text-stone-500">
                          {transaction.note || "No note"}
                        </p>
                        <p className="mt-2 text-xs uppercase tracking-[0.24em] text-stone-400">
                          {transaction.createdAtMs
                            ? new Date(transaction.createdAtMs).toLocaleString()
                            : "Unknown date"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-lg font-semibold ${
                            transaction.amount >= 0 ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {currency(transaction.amount)}
                        </p>
                        <StatusBadge label={transaction.status} tone="stone" />
                      </div>
                    </div>
                    {transaction.campaignId ? (
                      <div className="mt-3">
                        <Link
                          href={`/admin/campaigns/${transaction.campaignId}`}
                          className="text-sm font-medium text-amber-700 hover:text-amber-800"
                        >
                          Open related campaign
                        </Link>
                      </div>
                    ) : null}
                  </div>
                )}
              />
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
