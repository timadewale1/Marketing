"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCheck,
  ExternalLink,
  PauseCircle,
  PlayCircle,
  SquareSlash,
  Trash2,
  UserRound,
  Wallet,
  XCircle,
} from "lucide-react";
import { doc, getDoc, getDocs, collection, limit, orderBy, query, where } from "firebase/firestore";
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
import { summarizeCampaignProgress } from "@/lib/campaign-progress";
import { getCampaignProofSampleUrls, getProofUrls } from "@/lib/proofs";

interface Props {
  id: string;
}

type CampaignRecord = {
  id: string;
  title: string;
  description: string;
  proofInstructions: string;
  participationProofSampleUrl?: string;
  participationProofSampleUrls?: string[];
  advertiserName: string;
  category: string;
  status: string;
  ownerId?: string;
  budget: number;
  reservedBudget: number;
  originalBudget: number;
  earnerPrice: number;
  generatedLeads: number;
  estimatedLeads: number;
  createdAtMs: number;
  deletedFallback?: boolean;
};

type AdvertiserRecord = {
  id: string;
  name: string;
  email: string;
  totalSpent: number;
  balance: number;
};

type SubmissionRecord = {
  id: string;
  userId: string;
  campaignId: string;
  campaignTitle: string;
  category: string;
  note: string;
  proofUrl: string;
  proofUrls: string[];
  status: string;
  earnerPrice: number;
  createdAtMs: number;
};

type TransactionRecord = {
  id: string;
  type: string;
  amount: number;
  note: string;
  status: string;
  createdAtMs: number;
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

function mapCampaign(id: string, data: Record<string, unknown>): CampaignRecord {
  return {
    id,
    title: String(data.title || data.name || "Untitled campaign"),
    description: String(data.description || ""),
    proofInstructions: String(data.proofInstructions || ""),
    participationProofSampleUrl: data.participationProofSampleUrl ? String(data.participationProofSampleUrl) : undefined,
    participationProofSampleUrls: getCampaignProofSampleUrls(
      data as { participationProofSampleUrl?: unknown; participationProofSampleUrls?: unknown }
    ),
    advertiserName: String(data.advertiserName || ""),
    category: String(data.category || "Unknown"),
    status: String(data.status || "Unknown"),
    ownerId: data.ownerId ? String(data.ownerId) : undefined,
    budget: Number(data.budget || 0),
    reservedBudget: Number(data.reservedBudget || 0),
    originalBudget: Number(data.originalBudget || 0),
    earnerPrice: Number(data.earnerPrice || data.costPerLead || 0),
    generatedLeads: Number(data.generatedLeads || data.completedLeads || 0),
    estimatedLeads: Number(data.estimatedLeads || data.targetLeads || 0),
    createdAtMs: toMillis(data.createdAt),
  };
}

export default function ClientCampaignDetail({ id }: Props) {
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<CampaignRecord | null>(null);
  const [advertiser, setAdvertiser] = useState<AdvertiserRecord | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      try {
        const campaignSnap = await getDoc(doc(db, "campaigns", id));
        const submissionsSnap = await getDocs(
          query(
            collection(db, "earnerSubmissions"),
            where("campaignId", "==", id),
            orderBy("createdAt", "desc"),
            limit(250)
          )
        );
        const transactionsSnap = await getDocs(
          query(
            collection(db, "advertiserTransactions"),
            where("campaignId", "==", id),
            orderBy("createdAt", "desc"),
            limit(150)
          )
        );

        const submissionRows = submissionsSnap.docs.map((submissionDoc) => {
          const data = submissionDoc.data();
          return {
            id: submissionDoc.id,
            userId: String(data.userId || ""),
            campaignId: String(data.campaignId || ""),
            campaignTitle: String(data.campaignTitle || ""),
            category: String(data.category || ""),
            note: String(data.note || ""),
            proofUrl: String(data.proofUrl || ""),
            proofUrls: getProofUrls(data as { proofUrl?: unknown; proofUrls?: unknown }),
            status: String(data.status || ""),
            earnerPrice: Number(data.earnerPrice || 0),
            createdAtMs: toMillis(data.createdAt),
          };
        });
        setSubmissions(submissionRows);

        setTransactions(
          transactionsSnap.docs.map((transactionDoc) => {
            const data = transactionDoc.data();
            return {
              id: transactionDoc.id,
              type: String(data.type || ""),
              amount: Number(data.amount || 0),
              note: String(data.note || ""),
              status: String(data.status || ""),
              createdAtMs: toMillis(data.createdAt),
            };
          })
        );

        let campaignRow: CampaignRecord | null = null;
        if (campaignSnap.exists()) {
          campaignRow = mapCampaign(campaignSnap.id, campaignSnap.data() as Record<string, unknown>);
        } else if (submissionRows.length > 0 || transactionsSnap.docs.length > 0) {
          const paymentTx = transactionsSnap.docs.find(
            (docItem) => docItem.data().type === "campaign_payment"
          );
          const paymentData = paymentTx?.data() || {};
          campaignRow = {
            id,
            title: String(
              submissionRows[0]?.campaignTitle || paymentData.campaignTitle || "Deleted campaign"
            ),
            description:
              "This campaign document no longer exists in the campaigns collection. The admin view is reconstructing it from submissions and transactions.",
            proofInstructions: "",
            advertiserName: String(submissionRows[0]?.campaignTitle ? "" : ""),
            category: String(submissionRows[0]?.category || "Unknown"),
            status: "Deleted",
            ownerId: paymentData.userId ? String(paymentData.userId) : undefined,
            budget: 0,
            reservedBudget: 0,
            originalBudget: Math.abs(Number(paymentData.amount || 0)),
            earnerPrice: Number(submissionRows[0]?.earnerPrice || 0),
            generatedLeads: submissionRows.filter((item) => item.status === "Verified").length,
            estimatedLeads: 0,
            createdAtMs: toMillis(paymentData.createdAt),
            deletedFallback: true,
          };
        }
        setCampaign(campaignRow);

        const ownerId =
          (campaignSnap.exists()
            ? String((campaignSnap.data() as Record<string, unknown>).ownerId || "")
            : campaignRow?.ownerId) || "";

        if (ownerId) {
          const advertiserSnap = await getDoc(doc(db, "advertisers", ownerId));
          if (advertiserSnap.exists()) {
            const data = advertiserSnap.data();
            setAdvertiser({
              id: advertiserSnap.id,
              name: String(data.name || data.companyName || "Unknown advertiser"),
              email: String(data.email || ""),
              totalSpent: Number(data.totalSpent || 0),
              balance: Number(data.balance || data.walletBalance || 0),
            });
          } else {
            setAdvertiser(null);
          }
        } else {
          setAdvertiser(null);
        }
      } catch (error) {
        console.error("Failed to load campaign detail", error);
        toast.error("Failed to load campaign detail");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  const summary = useMemo(() => {
    return summarizeCampaignProgress({
      target: campaign?.estimatedLeads || 0,
      generatedLeads: campaign?.generatedLeads || 0,
      submissions,
    });
  }, [campaign?.estimatedLeads, campaign?.generatedLeads, submissions]);
  const participationProofSamples = getCampaignProofSampleUrls(campaign);

  const sendCampaignAction = async (action: "activate" | "pause" | "stop" | "delete") => {
    try {
      setActionLoading(action);
      const user = auth.currentUser;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (user) {
        headers.Authorization = `Bearer ${await user.getIdToken()}`;
      }

      const response = await fetch("/api/admin/campaign", {
        method: "POST",
        headers,
        body: JSON.stringify({ campaignId: id, action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Campaign action failed");
      }

      setCampaign((current) =>
        current
          ? {
              ...current,
              status:
                action === "activate"
                  ? "Active"
                  : action === "pause"
                    ? "Paused"
                    : action === "stop"
                      ? "Stopped"
                      : "Deleted",
            }
          : current
      );
      toast.success(data.message || `Campaign ${action}d`);
    } catch (error) {
      console.error("Campaign action failed", error);
      toast.error(error instanceof Error ? error.message : "Campaign action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const reviewSubmission = async (submission: SubmissionRecord, action: "Verified" | "Rejected") => {
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
          userId: submission.userId,
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

  if (!campaign) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          eyebrow="Campaign detail"
          title="Campaign not found"
          description="This id does not exist in campaigns and no related submissions or transactions were found."
        />
        <EmptyState
          title="No campaign data"
          description="The campaign may never have been created in this Firebase project, or every related record may already have been cleaned up."
          href="/admin/campaigns"
          cta="Back to campaigns"
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Campaign detail"
        title={campaign.title}
        description="Full campaign context, advertiser linkage, proof queue, and transaction history are all connected here."
        action={
          <div className="flex flex-wrap gap-2">
            {campaign.status !== "Active" && campaign.status !== "Deleted" ? (
              <Button
                variant="outline"
                className="rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                disabled={Boolean(actionLoading)}
                onClick={() => sendCampaignAction("activate")}
              >
                <PlayCircle className="h-4 w-4" />
                Activate
              </Button>
            ) : null}
            {campaign.status === "Active" ? (
              <Button
                variant="outline"
                className="rounded-full border-amber-200 text-amber-700 hover:bg-amber-50"
                disabled={Boolean(actionLoading)}
                onClick={() => sendCampaignAction("pause")}
              >
                <PauseCircle className="h-4 w-4" />
                Pause
              </Button>
            ) : null}
            {campaign.status !== "Stopped" && campaign.status !== "Deleted" ? (
              <Button
                variant="outline"
                className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50"
                disabled={Boolean(actionLoading)}
                onClick={() => sendCampaignAction("stop")}
              >
                <SquareSlash className="h-4 w-4" />
                Stop
              </Button>
            ) : null}
            {campaign.status !== "Deleted" ? (
              <Button
                variant="outline"
                className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50"
                disabled={Boolean(actionLoading)}
                onClick={() => sendCampaignAction("delete")}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
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
        <StatusBadge label={campaign.category} tone="stone" />
        {campaign.deletedFallback ? (
          <StatusBadge label="Reconstructed from related records" tone="amber" />
        ) : null}
      </div>

      {campaign.deletedFallback ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              The campaign document has already been removed from Firestore, but submissions and transactions still reference it. Pending submissions can still be rejected, but verification is blocked because the source campaign no longer exists.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Available budget"
          value={currency(campaign.budget)}
          hint={`${currency(campaign.reservedBudget)} reserved`}
          icon={Wallet}
        />
        <MetricCard
          label="Original budget"
          value={currency(campaign.originalBudget || campaign.budget + campaign.reservedBudget)}
          hint={`${currency(campaign.earnerPrice)} per proof`}
          icon={Wallet}
          tone="blue"
        />
        <MetricCard
          label="Submissions"
          value={summary.totalSubmissions}
          hint={`${summary.pending} pending review`}
          icon={UserRound}
          tone="amber"
        />
        <MetricCard
          label="Verified"
          value={summary.verified}
          hint={`${summary.rejected} rejected`}
          icon={CheckCheck}
          tone="emerald"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_1.2fr]">
        <SectionCard
          title="Campaign overview"
          description="High-level campaign metadata, instructions, and lead progress."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Created</p>
              <p className="mt-3 text-sm text-stone-700">
                {campaign.createdAtMs
                  ? new Date(campaign.createdAtMs).toLocaleString()
                  : "Unknown"}
              </p>
            </div>
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Leads</p>
              <p className="mt-3 text-sm text-stone-700">
                {summary.verified} verified
                {summary.target ? ` / ${summary.target} target` : ""}
              </p>
              <p className="mt-2 text-xs text-stone-500">
                {summary.pending} pending review • {summary.rejected} rejected
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200">
                <div
                  className="h-full rounded-full bg-amber-500"
                  style={{ width: `${summary.progressPercent}%` }}
                />
              </div>
            </div>
            <div className="rounded-2xl bg-stone-50 p-4 md:col-span-2">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Description</p>
              <p className="mt-3 text-sm leading-6 text-stone-700">
                {campaign.description || "No campaign description recorded."}
              </p>
            </div>
          <div className="rounded-2xl bg-stone-50 p-4 md:col-span-2">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Proof instructions</p>
            <p className="mt-3 text-sm leading-6 text-stone-700">
              {campaign.proofInstructions || "No proof instructions recorded."}
            </p>
          </div>
          <div className="rounded-2xl bg-stone-50 p-4 md:col-span-2">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Participation proof samples</p>
            {participationProofSamples.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {participationProofSamples.map((sampleUrl, index) => (
                  <Button key={`${sampleUrl}-${index}`} asChild variant="outline" className="rounded-full">
                    <Link href={sampleUrl} target="_blank">
                      Open sample {index + 1}
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-stone-700">
                No participation proof samples recorded.
              </p>
            )}
          </div>
        </div>
      </SectionCard>

        <SectionCard
          title="Advertiser"
          description="The owner account and spend context for this campaign."
        >
          {advertiser ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-stone-50 p-4">
                <p className="text-lg font-semibold text-stone-900">{advertiser.name}</p>
                <p className="mt-1 text-sm text-stone-500">{advertiser.email}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-stone-50 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Total spent</p>
                  <p className="mt-2 text-lg font-semibold text-stone-900">
                    {currency(advertiser.totalSpent)}
                  </p>
                </div>
                <div className="rounded-2xl bg-stone-50 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Current balance</p>
                  <p className="mt-2 text-lg font-semibold text-stone-900">
                    {currency(advertiser.balance)}
                  </p>
                </div>
              </div>
              <Button asChild className="rounded-full bg-stone-900 text-white hover:bg-stone-800">
                <Link href={`/admin/advertisers/${advertiser.id}`}>
                  Open advertiser profile
                </Link>
              </Button>
            </div>
          ) : (
            <EmptyState
              title="Advertiser profile unavailable"
              description="The campaign has no accessible advertiser record right now."
            />
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Proof queue"
        description="Review every submission from this campaign here, including the proof link and direct approve/reject controls."
      >
        {submissions.length === 0 ? (
          <EmptyState
            title="No submissions yet"
            description="No earner has submitted proof for this campaign."
          />
        ) : (
          <PaginatedCardList
            items={submissions}
            itemsPerPage={3}
            renderItem={(submission) => (
              <div
                key={submission.id}
                className="rounded-2xl border border-stone-200 bg-white p-4"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-stone-900">
                        Earner {submission.userId}
                      </p>
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
                      {submission.category} • {currency(submission.earnerPrice)} •{" "}
                      {submission.createdAtMs
                        ? new Date(submission.createdAtMs).toLocaleString()
                        : "Unknown date"}
                    </p>
                    {submission.note ? (
                      <p className="text-sm text-stone-600">{submission.note}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {submission.proofUrls.length > 0 ? (
                      submission.proofUrls.map((proof, index) => (
                        <Button key={`${submission.id}-proof-${index}`} asChild variant="outline" className="rounded-full">
                          <Link href={proof} target="_blank">
                            View proof {index + 1}
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      ))
                    ) : null}
                    {submission.status !== "Verified" ? (
                      <Button
                        className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                        disabled={Boolean(actionLoading) || campaign.deletedFallback}
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
                  </div>
                </div>
              </div>
            )}
          />
        )}
      </SectionCard>

      <SectionCard
        title="Transaction history"
        description="All advertiser-side payment and refund events currently tied to this campaign."
      >
        {transactions.length === 0 ? (
          <EmptyState
            title="No transactions"
            description="No advertiser transaction records were found for this campaign."
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
              </div>
            )}
          />
        )}
      </SectionCard>
    </div>
  );
}
