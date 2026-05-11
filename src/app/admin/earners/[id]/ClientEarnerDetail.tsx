"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCheck,
  CircleSlash,
  Coins,
  FileClock,
  Gift,
  Landmark,
  Wallet,
  XCircle,
} from "lucide-react";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import toast from "react-hot-toast";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AdminPageHeader,
  EmptyState,
  MetricCard,
  PaginatedCardList,
  SectionCard,
  StatusBadge,
} from "@/app/admin/_components/admin-primitives";
import { getProofUrls } from "@/lib/proofs";

type Earner = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  activated: boolean;
  verified: boolean;
  balance: number;
  totalEarned: number;
  leadsPaidFor: number;
  createdAtMs: number;
  bank?: {
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
    verified?: boolean;
  };
};

type EarnerTransaction = {
  id: string;
  type: string;
  amount: number;
  status: string;
  note: string;
  createdAtMs: number;
  campaignId?: string;
};

type Withdrawal = {
  id: string;
  amount: number;
  status: string;
  createdAtMs: number;
  bankName: string;
  accountNumber: string;
};

type Submission = {
  id: string;
  campaignId: string;
  campaignTitle: string;
  status: string;
  proofUrl: string;
  proofUrls: string[];
  earnerPrice: number;
  createdAtMs: number;
  rejectionReason?: string;
};

type Referral = {
  id: string;
  referredId: string;
  referredName: string;
  referredEmail: string;
  amount: number;
  status: string;
  bonusPaid: boolean;
  createdAtMs: number;
  completedAtMs: number;
};

type CampaignStub = {
  id: string;
  title: string;
  status: string;
  ownerId?: string;
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

interface Props {
  id: string;
  mode?: "admin" | "submissionmanagement";
}

export default function ClientEarnerDetail({ id, mode = "admin" }: Props) {
  const [loading, setLoading] = useState(true);
  const [earner, setEarner] = useState<Earner | null>(null);
  const [transactions, setTransactions] = useState<EarnerTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignStub[]>([]);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [strikeCount, setStrikeCount] = useState<number>(0);
  const [activationBusy, setActivationBusy] = useState(false);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const campaignBasePath = mode === "submissionmanagement" ? "/submissionmanagement/campaigns" : "/admin/campaigns";
  const reviewEndpoint =
    mode === "submissionmanagement"
      ? "/api/submissionmanagement/submissions/review"
      : "/api/admin/submissions/review";
  const emptyHref = mode === "submissionmanagement" ? "/submissionmanagement/earners" : "/admin/users";

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      try {
        const earnerSnap = await getDoc(doc(db, "earners", id));
        if (!earnerSnap.exists()) {
          setEarner(null);
          return;
        }

        const earnerData = earnerSnap.data();
        const rawStatus = String(earnerData.status || "active").toLowerCase();
        const normalizedStatus = rawStatus === "suspended" ? "suspended" : "active";
        setEarner({
          id: earnerSnap.id,
          name: String(earnerData.name || "Unnamed earner"),
          email: String(earnerData.email || ""),
          phone: String(earnerData.phone || ""),
          status: normalizedStatus,
          activated: Boolean(earnerData.activated),
          verified: Boolean(earnerData.verified),
          balance: Number(earnerData.balance || 0),
          totalEarned: Number(earnerData.totalEarned || 0),
          leadsPaidFor: Number(earnerData.leadsPaidFor || 0),
          createdAtMs: toMillis(earnerData.createdAt),
          bank: earnerData.bank as Earner["bank"],
        });
        setStrikeCount(Number(earnerData.strikeCount || 0));

        const [transactionsSnap, withdrawalsSnap, submissionsSnap, referralsSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, "earnerTransactions"),
              where("userId", "==", id),
              orderBy("createdAt", "desc"),
              limit(150)
            )
          ),
          getDocs(
            query(
              collection(db, "earnerWithdrawals"),
              where("userId", "==", id),
              orderBy("createdAt", "desc"),
              limit(100)
            )
          ),
          getDocs(
            query(
              collection(db, "earnerSubmissions"),
              where("userId", "==", id),
              orderBy("createdAt", "desc"),
              limit(150)
            )
          ),
          getDocs(
            query(
              collection(db, "referrals"),
              where("referrerId", "==", id),
              orderBy("createdAt", "desc"),
              limit(150)
            )
          ),
        ]);

        setTransactions(
          transactionsSnap.docs.map((transactionDoc) => {
            const data = transactionDoc.data();
            return {
              id: transactionDoc.id,
              type: String(data.type || "unknown"),
              amount: Number(data.amount || 0),
              status: String(data.status || "unknown"),
              note: String(data.note || ""),
              createdAtMs: toMillis(data.createdAt),
              campaignId: data.campaignId ? String(data.campaignId) : undefined,
            };
          })
        );

        setWithdrawals(
          withdrawalsSnap.docs.map((withdrawalDoc) => {
            const data = withdrawalDoc.data();
            return {
              id: withdrawalDoc.id,
              amount: Number(data.amount || 0),
              status: String(data.status || ""),
              createdAtMs: toMillis(data.createdAt),
              bankName: String(data.bank?.bankName || ""),
              accountNumber: String(data.bank?.accountNumber || ""),
            };
          })
        );

        const submissionRows = submissionsSnap.docs.map((submissionDoc) => {
          const data = submissionDoc.data();
          return {
            id: submissionDoc.id,
            campaignId: String(data.campaignId || ""),
            campaignTitle: String(data.campaignTitle || ""),
            status: String(data.status || ""),
            proofUrl: String(data.proofUrl || ""),
            proofUrls: getProofUrls(data as { proofUrl?: unknown; proofUrls?: unknown }),
            earnerPrice: Number(data.earnerPrice || 0),
            createdAtMs: toMillis(data.createdAt),
            rejectionReason: String(data.rejectionReason || ""),
          };
        });
        setSubmissions(submissionRows);
        const referralRows = referralsSnap.docs.map((referralDoc) => {
          const data = referralDoc.data();
          return {
            id: referralDoc.id,
            referredId: String(data.referredId || ""),
            referredName: "",
            referredEmail: "",
            amount: Number(data.amount || 0),
            status: String(data.status || "pending"),
            bonusPaid: Boolean(data.bonusPaid),
            createdAtMs: toMillis(data.createdAt),
            completedAtMs: toMillis(data.completedAt || data.paidAt),
          };
        });

        const uniqueReferredIds = Array.from(
          new Set(referralRows.map((referral) => referral.referredId).filter(Boolean))
        );

        const referredUsers = await Promise.all(
          uniqueReferredIds.map(async (referredId) => {
            const [earnerRef, advertiserRef] = await Promise.all([
              getDoc(doc(db, "earners", referredId)),
              getDoc(doc(db, "advertisers", referredId)),
            ]);

            const source = earnerRef.exists() ? earnerRef.data() : advertiserRef.exists() ? advertiserRef.data() : null;
            return [
              referredId,
              {
                name: source ? String(source.fullName || source.name || source.companyName || "Unknown user") : "Unknown user",
                email: source ? String(source.email || "") : "",
              },
            ] as const;
          })
        );

        const referredUserMap = new Map(referredUsers);

        setReferrals(
          referralRows.map((referral) => {
            const referredUser = referredUserMap.get(referral.referredId);
            return {
              ...referral,
              referredName: referredUser?.name || "Unknown user",
              referredEmail: referredUser?.email || "",
            };
          })
        );

        const uniqueCampaignIds = Array.from(
          new Set(submissionRows.map((submission) => submission.campaignId).filter(Boolean))
        );

        const campaignDocs = await Promise.all(
          uniqueCampaignIds.map((campaignId) => getDoc(doc(db, "campaigns", campaignId)))
        );

        const campaignRows = campaignDocs.map((campaignDoc, index) => {
          if (campaignDoc.exists()) {
            const data = campaignDoc.data();
            return {
              id: campaignDoc.id,
              title: String(data.title || uniqueCampaignIds[index]),
              status: String(data.status || "Unknown"),
              ownerId: data.ownerId ? String(data.ownerId) : undefined,
            };
          }

          return {
            id: uniqueCampaignIds[index],
            title:
              submissionRows.find((submission) => submission.campaignId === uniqueCampaignIds[index])
                ?.campaignTitle || "Deleted campaign",
            status: "Deleted",
          };
        });

        setCampaigns(campaignRows);
      } catch (error) {
        console.error("Failed to load earner detail", error);
        toast.error("Failed to load earner details");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  const summary = useMemo(() => {
    return {
      pendingSubmissions: submissions.filter((submission) => submission.status === "Pending")
        .length,
      verifiedSubmissions: submissions.filter(
        (submission) => submission.status === "Verified"
      ).length,
      rejectedSubmissions: submissions.filter(
        (submission) => submission.status === "Rejected"
      ).length,
      pendingWithdrawals: withdrawals.filter((withdrawal) =>
        withdrawal.status.toLowerCase().includes("pending")
      ).length,
      pendingReferrals: referrals.filter((referral) => referral.status.toLowerCase() !== "completed").length,
      completedReferrals: referrals.filter((referral) => referral.status.toLowerCase() === "completed").length,
    };
  }, [submissions, withdrawals, referrals]);

  const updateStatus = async (status: string) => {
    try {
      setUpdatingStatus(true);
      const updates: Record<string, unknown> = { status };
      if (status === "active") {
        updates.strikeCount = 0;
        updates.suspensionReason = deleteField();
        updates.suspendedAt = deleteField();
        updates.lastStrikeUpdatedAt = deleteField();
      }
      await updateDoc(doc(db, "earners", id), updates);
      setEarner((current) => (current ? { ...current, status } : current));
      if (status === "active") {
        setStrikeCount(0);
      }
      toast.success(`Earner set to ${status}`);
    } catch (error) {
      console.error("Failed to update earner status", error);
      toast.error("Failed to update earner status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleActivationAction = async (action: "activate_user" | "deactivate_user") => {
    if (!earner) return;
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
      setEarner((current) => (current ? { ...current, activated: nextActivated } : current));
      toast.success(nextActivated ? "User activated" : "User deactivated");
    } catch (error) {
      console.error("Failed to update activation", error);
      toast.error(error instanceof Error ? error.message : "Failed to update activation");
    } finally {
      setActivationBusy(false);
    }
  };

  const reviewSubmission = async (submission: Submission, action: "Verified" | "Rejected") => {
    try {
      const rejectionReason =
        action === "Rejected"
          ? String(rejectionReasons[submission.id] || submission.rejectionReason || "").trim()
          : "";
      if (action === "Rejected" && !rejectionReason) {
        toast.error("Please add a clear rejection reason before rejecting.");
        return;
      }

      setActionLoading(`${action}-${submission.id}`);
      const user = auth.currentUser;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (user) {
        headers.Authorization = `Bearer ${await user.getIdToken()}`;
      }

      const response = await fetch(reviewEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          submissionId: submission.id,
          action,
          userId: id,
          campaignId: submission.campaignId,
          rejectionReason,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Submission update failed");
      }

      setSubmissions((current) =>
        current.map((item) =>
          item.id === submission.id ? { ...item, status: action, rejectionReason } : item
        )
      );
      if (action === "Rejected") {
        setRejectionReasons((current) => ({ ...current, [submission.id]: rejectionReason }));
      }
      toast.success(`Submission marked ${action.toLowerCase()}`);
    } catch (error) {
      console.error("Submission review failed", error);
      toast.error(error instanceof Error ? error.message : "Submission review failed");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <div className="h-64 animate-pulse rounded-3xl bg-stone-100" />;
  }

  if (!earner) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          eyebrow="Earner profile"
          title="Earner not found"
          description="This earner record is missing from Firestore."
        />
        <EmptyState
          title="No earner record"
          description="Double-check the id in the URL or verify that the earner still exists in the earners collection."
          href={emptyHref}
          cta="Back to users"
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={mode === "submissionmanagement" ? "Submission management" : "Earner profile"}
        title={earner.name}
        description={
          mode === "submissionmanagement"
            ? "Review this earner's submissions, strikes, withdrawals, and campaign history from the moderation side."
            : "Follow earnings, submissions, withdrawals, and campaign history for this earner in one connected admin view."
        }
        action={
          <div className="flex flex-wrap gap-2">
            {earner.status === "active" ? (
              <Button
                variant="outline"
                className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50"
                disabled={updatingStatus}
                onClick={() => updateStatus("suspended")}
              >
                <CircleSlash className="h-4 w-4" />
                Suspend
              </Button>
            ) : earner.status === "suspended" ? (
              <Button
                variant="outline"
                className="rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                disabled={updatingStatus}
                onClick={() => updateStatus("active")}
              >
                <CheckCheck className="h-4 w-4" />
                Unsuspend
              </Button>
            ) : null}
            {mode === "admin" && earner.activated ? (
              <Button
                variant="destructive"
                className="rounded-full"
                disabled={activationBusy}
                onClick={() => handleActivationAction("deactivate_user")}
              >
                {activationBusy ? "Deactivating..." : "Deactivate user"}
              </Button>
            ) : mode === "admin" ? (
              <Button
                className="rounded-full bg-stone-900 text-white hover:bg-stone-800"
                disabled={activationBusy}
                onClick={() => handleActivationAction("activate_user")}
              >
                {activationBusy ? "Activating..." : "Activate user"}
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <StatusBadge label={earner.status} tone={earner.status === "active" ? "green" : earner.status === "suspended" ? "red" : "amber"} />
        <StatusBadge
          label={earner.activated ? "Activated" : "Not activated"}
          tone={earner.activated ? "green" : "stone"}
        />
        <StatusBadge
          label={earner.verified ? "Verified" : "Unverified"}
          tone={earner.verified ? "blue" : "amber"}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Wallet"
          value={currency(earner.balance)}
          hint="Current balance"
          icon={Wallet}
        />
        <MetricCard
          label="Total earned"
          value={currency(earner.totalEarned)}
          hint={`${earner.leadsPaidFor} paid submissions`}
          icon={Coins}
          tone="emerald"
        />
        <MetricCard
          label="Pending submissions"
          value={summary.pendingSubmissions}
          hint={`${summary.verifiedSubmissions} verified`}
          icon={FileClock}
          tone="amber"
        />
        <MetricCard
          label="Pending withdrawals"
          value={summary.pendingWithdrawals}
          hint={`${summary.rejectedSubmissions} rejected submissions`}
          icon={Gift}
          tone="blue"
        />
        <MetricCard
          label="Strike count"
          value={strikeCount}
          hint={strikeCount >= 5 ? "Account suspended" : "Auto-suspends at 5 strikes"}
          icon={CircleSlash}
          tone={strikeCount >= 5 ? "rose" : strikeCount > 0 ? "amber" : undefined}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.25fr]">
        <SectionCard
          title="Profile and payout details"
          description="Identity, activation, and withdrawal account details for this earner."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Contact</p>
              <div className="mt-3 space-y-2 text-sm text-stone-700">
                <p>{earner.email || "No email"}</p>
                <p>{earner.phone || "No phone"}</p>
                <p>
                  Joined{" "}
                  {earner.createdAtMs
                    ? new Date(earner.createdAtMs).toLocaleString()
                    : "Unknown"}
                </p>
              </div>
            </div>
            <div className="rounded-2xl bg-stone-50 p-4">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-sky-600" />
                <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Bank</p>
              </div>
              <div className="mt-3 space-y-2 text-sm text-stone-700">
                <p>{earner.bank?.bankName || "No bank name"}</p>
                <p>{earner.bank?.accountNumber || "No account number"}</p>
                <p>{earner.bank?.accountName || "No account name"}</p>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Campaign history"
          description="Every campaign this earner has touched, including deleted campaigns that still have submission history."
        >
          {campaigns.length === 0 ? (
            <EmptyState
              title="No campaign history"
              description="This earner has not submitted proof for any campaign yet."
            />
          ) : (
            <PaginatedCardList
              items={campaigns}
              itemsPerPage={3}
              renderItem={(campaign) => (
                <div
                  key={campaign.id}
                  className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`${campaignBasePath}/${campaign.id}`}
                          className="font-medium text-stone-900 hover:text-amber-700"
                        >
                        {campaign.title}
                      </Link>
                      <StatusBadge
                        label={campaign.status}
                        tone={
                          campaign.status === "Verified" || campaign.status === "Active"
                            ? "green"
                            : campaign.status === "Deleted"
                              ? "red"
                              : "amber"
                        }
                      />
                    </div>
                    <p className="mt-1 text-sm text-stone-500">
                      Campaign ID: {campaign.id}
                    </p>
                  </div>
                  <Button asChild variant="outline" className="rounded-full">
                    <Link href={`${campaignBasePath}/${campaign.id}`}>
                      Open campaign
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              )}
            />
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.9fr]">
        <SectionCard
          title="Submissions"
          description="Submission history for this earner, linked back to the full campaign view for proof management."
        >
          {submissions.length === 0 ? (
            <EmptyState
              title="No submissions"
              description="This earner has not submitted proof yet."
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
                        href={`${campaignBasePath}/${submission.campaignId}`}
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
                      {currency(submission.earnerPrice)} payout •{" "}
                      {submission.createdAtMs
                        ? new Date(submission.createdAtMs).toLocaleString()
                        : "Unknown date"}
                    </p>
                    {submission.status === "Rejected" && submission.rejectionReason ? (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                        <span className="font-semibold">Reason shown to earner:</span> {submission.rejectionReason}
                      </div>
                    ) : null}
                    {submission.status !== "Rejected" ? (
                      <div className="space-y-2 rounded-2xl border border-stone-200 bg-stone-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                          Rejection reason
                        </p>
                        <Textarea
                          value={rejectionReasons[submission.id] ?? submission.rejectionReason ?? ""}
                          onChange={(event) =>
                            setRejectionReasons((current) => ({
                              ...current,
                              [submission.id]: event.target.value,
                            }))
                          }
                          placeholder="Explain clearly what the earner did wrong so they can see the exact reason."
                          className="min-h-[92px] rounded-2xl border-stone-200 bg-white"
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {submission.proofUrls.length > 0 ? (
                      submission.proofUrls.map((proof, index) => (
                        <Button key={`${submission.id}-proof-${index}`} asChild variant="outline" className="rounded-full">
                          <Link href={proof} target="_blank">
                            View proof {index + 1}
                          </Link>
                        </Button>
                      ))
                    ) : null}
                    {submission.status !== "Verified" ? (
                      <Button
                        className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                        disabled={Boolean(actionLoading)}
                        onClick={() => reviewSubmission(submission, "Verified")}
                      >
                        <CheckCheck className="h-4 w-4" />
                        {submission.status === "Rejected" ? "Re-verify" : "Verify"}
                      </Button>
                    ) : null}
                    {submission.status !== "Rejected" ? (
                      <Button
                        variant="outline"
                        className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50"
                        disabled={Boolean(actionLoading)}
                        onClick={() => reviewSubmission(submission, "Rejected")}
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </Button>
                    ) : null}
                    <Button asChild className="rounded-full bg-stone-900 text-white hover:bg-stone-800">
                      <Link href={`${campaignBasePath}/${submission.campaignId}`}>
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
            description="Referral bonuses earned by this earner, split between pending and completed payouts."
          >
            {referrals.length === 0 ? (
              <EmptyState
                title="No referrals"
                description="This earner has not referred any users yet."
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
                          <p className="mt-1 text-sm text-stone-500">
                            {referral.referredName || "Unknown user"}
                            {referral.referredEmail ? ` • ${referral.referredEmail}` : ""}
                          </p>
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
            title="Transactions"
            description="Credits, reversals, and earnings history."
          >
            {transactions.length === 0 ? (
              <EmptyState
                title="No transactions"
                description="No earner transaction records were found."
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
                      </div>
                      <p
                        className={`text-lg font-semibold ${
                          transaction.amount >= 0 ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {currency(transaction.amount)}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <StatusBadge label={transaction.status} tone="stone" />
                      {transaction.campaignId ? (
                        <Link
                          href={`/admin/campaigns/${transaction.campaignId}`}
                          className="text-sm font-medium text-amber-700 hover:text-amber-800"
                        >
                          Open campaign
                        </Link>
                      ) : null}
                    </div>
                  </div>
                )}
              />
            )}
          </SectionCard>

          <SectionCard
            title="Withdrawals"
            description="Withdrawal requests and payout destination history."
          >
            {withdrawals.length === 0 ? (
              <EmptyState
                title="No withdrawals"
                description="This earner has not requested any withdrawals yet."
              />
            ) : (
              <PaginatedCardList
                items={withdrawals}
                itemsPerPage={3}
                renderItem={(withdrawal) => (
                  <div
                    key={withdrawal.id}
                    className="rounded-2xl border border-stone-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-stone-900">
                          {currency(withdrawal.amount)}
                        </p>
                        <p className="mt-1 text-sm text-stone-500">
                          {withdrawal.bankName} • {withdrawal.accountNumber}
                        </p>
                        <p className="mt-2 text-xs uppercase tracking-[0.24em] text-stone-400">
                          {withdrawal.createdAtMs
                            ? new Date(withdrawal.createdAtMs).toLocaleString()
                            : "Unknown date"}
                        </p>
                      </div>
                      <StatusBadge
                        label={withdrawal.status}
                        tone={
                          withdrawal.status.toLowerCase().includes("sent")
                            ? "green"
                            : withdrawal.status.toLowerCase().includes("reject")
                              ? "red"
                              : "amber"
                        }
                      />
                    </div>
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
