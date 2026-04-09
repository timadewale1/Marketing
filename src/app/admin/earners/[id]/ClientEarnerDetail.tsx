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
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import toast from "react-hot-toast";
import { auth, db } from "@/lib/firebase";
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
}

export default function ClientEarnerDetail({ id }: Props) {
  const [loading, setLoading] = useState(true);
  const [earner, setEarner] = useState<Earner | null>(null);
  const [transactions, setTransactions] = useState<EarnerTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignStub[]>([]);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
        setEarner({
          id: earnerSnap.id,
          name: String(earnerData.name || "Unnamed earner"),
          email: String(earnerData.email || ""),
          phone: String(earnerData.phone || ""),
          status: String(earnerData.status || "pending"),
          activated: Boolean(earnerData.activated),
          verified: Boolean(earnerData.verified),
          balance: Number(earnerData.balance || 0),
          totalEarned: Number(earnerData.totalEarned || 0),
          leadsPaidFor: Number(earnerData.leadsPaidFor || 0),
          createdAtMs: toMillis(earnerData.createdAt),
          bank: earnerData.bank as Earner["bank"],
        });

        const [transactionsSnap, withdrawalsSnap, submissionsSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, "earnerTransactions"),
              where("userId", "==", id),
              orderBy("createdAt", "desc")
            )
          ),
          getDocs(
            query(
              collection(db, "earnerWithdrawals"),
              where("userId", "==", id),
              orderBy("createdAt", "desc")
            )
          ),
          getDocs(
            query(
              collection(db, "earnerSubmissions"),
              where("userId", "==", id),
              orderBy("createdAt", "desc")
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
          };
        });
        setSubmissions(submissionRows);

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
    };
  }, [submissions, withdrawals]);

  const updateStatus = async (status: string) => {
    try {
      setUpdatingStatus(true);
      await updateDoc(doc(db, "earners", id), { status });
      setEarner((current) => (current ? { ...current, status } : current));
      toast.success(`Earner set to ${status}`);
    } catch (error) {
      console.error("Failed to update earner status", error);
      toast.error("Failed to update earner status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const reviewSubmission = async (submission: Submission, action: "Verified" | "Rejected") => {
    try {
      setActionLoading(`${action}-${submission.id}`);
      const user = auth.currentUser;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (user) {
        headers.Authorization = `Bearer ${await user.getIdToken()}`;
      }

      const response = await fetch("/api/admin/submissions/review", {
        method: "POST",
        headers,
        body: JSON.stringify({
          submissionId: submission.id,
          action,
          userId: id,
          campaignId: submission.campaignId,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Submission update failed");
      }

      setSubmissions((current) =>
        current.map((item) =>
          item.id === submission.id ? { ...item, status: action } : item
        )
      );
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
          href="/admin/users"
          cta="Back to users"
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Earner profile"
        title={earner.name}
        description="Follow earnings, submissions, withdrawals, and campaign history for this earner in one connected admin view."
        action={
          earner.status === "active" ? (
            <Button
              variant="outline"
              className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50"
              disabled={updatingStatus}
              onClick={() => updateStatus("suspended")}
            >
              <CircleSlash className="h-4 w-4" />
              Suspend
            </Button>
          ) : (
            <p className="max-w-xs text-sm leading-6 text-stone-500">
              Activation stays self-service for earners. Admin can inspect or suspend only.
            </p>
          )
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
                        href={`/admin/campaigns/${campaign.id}`}
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
                    <Link href={`/admin/campaigns/${campaign.id}`}>
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
                      {currency(submission.earnerPrice)} payout •{" "}
                      {submission.createdAtMs
                        ? new Date(submission.createdAtMs).toLocaleString()
                        : "Unknown date"}
                    </p>
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
                        Verify
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
