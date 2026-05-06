"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Sparkles } from "lucide-react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
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
import { getProofUrls } from "@/lib/proofs";

const ADMIN_SUBMISSION_PAGE_LIMIT = 250;

type Submission = {
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
  advertiserFlagStatus: string;
  advertiserFlagReason: string;
  advertiserFlagReviewDueAtMs: number;
  rejectionReason: string;
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

export default function SubmissionsPage() {
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const snap = await getDocs(
        query(collection(db, "earnerSubmissions"), orderBy("createdAt", "desc"), limit(ADMIN_SUBMISSION_PAGE_LIMIT))
      );
      setSubmissions(
        snap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
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
            advertiserFlagStatus: String(data.advertiserFlagStatus || "none"),
            advertiserFlagReason: String(data.advertiserFlagReason || ""),
            advertiserFlagReviewDueAtMs: toMillis(data.advertiserFlagReviewDueAt),
            rejectionReason: String(data.rejectionReason || ""),
          };
        })
      );
      setLoading(false);
    };

    load().catch((error) => {
      console.error("Failed to load submissions", error);
      toast.error("Failed to load submissions");
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return submissions.filter((submission) => {
      const matchesStatus = statusFilter === "all" || submission.status === statusFilter;
      const matchesSearch =
        !term ||
        submission.campaignTitle.toLowerCase().includes(term) ||
        submission.category.toLowerCase().includes(term) ||
        submission.note.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [search, statusFilter, submissions]);

  const stats = {
    pending: submissions.filter((submission) => submission.status === "Pending").length,
    verified: submissions.filter((submission) => submission.status === "Verified").length,
    rejected: submissions.filter((submission) => submission.status === "Rejected").length,
  };

  const markProofStatus = async (submission: Submission, status: "Verified" | "Rejected") => {
    try {
      const rejectionReason =
        status === "Rejected"
          ? window.prompt(
              "Enter the exact rejection reason the earner should see:",
              submission.advertiserFlagReason || submission.rejectionReason || ""
            )?.trim()
          : "";
      if (status === "Rejected" && !rejectionReason) {
        toast.error("Please add a clear rejection reason before rejecting.");
        return;
      }

      setProcessingId(submission.id);
      const user = auth.currentUser;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (user) {
        headers.Authorization = `Bearer ${await user.getIdToken()}`;
      }

      const response = await fetch("/api/admin/submissions/review", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          submissionId: submission.id,
          action: status,
          userId: submission.userId,
          campaignId: submission.campaignId,
          rejectionReason,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to update submission");
      }
      setSubmissions((current) =>
        current.map((item) =>
          item.id === submission.id
            ? {
                ...item,
                status,
                rejectionReason: rejectionReason || "",
                advertiserFlagStatus:
                  submission.advertiserFlagStatus === "pending"
                    ? status === "Verified"
                      ? "overruled"
                      : "upheld"
                    : submission.advertiserFlagStatus,
              }
            : item
        )
      );
      toast.success(`Submission marked ${status.toLowerCase()}`);
    } catch (error) {
      console.error("Failed to update submission", error);
      toast.error(error instanceof Error ? error.message : "Failed to update submission");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Moderation queue"
        title="Campaign submissions"
        description="Review pending proof, jump to the linked campaign, and verify or reject from a cleaner queue."
        action={
          <Button variant="outline" className="rounded-full border-stone-300 bg-white/80" onClick={() => window.location.reload()}>
            <Sparkles className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Pending" value={stats.pending} hint="Awaiting review" icon={Sparkles} tone="amber" />
        <MetricCard label="Verified" value={stats.verified} hint="Approved proofs" icon={Sparkles} tone="emerald" />
        <MetricCard label="Rejected" value={stats.rejected} hint="Declined proofs" icon={Sparkles} tone="rose" />
      </div>

      <SectionCard title="Filters" description="Search by campaign, category, or note.">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_0.7fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search submissions" className="h-11 rounded-2xl border-stone-200 bg-white pl-10" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-11 rounded-2xl border-stone-200 bg-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Verified">Verified</SelectItem>
              <SelectItem value="Rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      <SectionCard title="Submission cards" description={`${filtered.length} submission${filtered.length === 1 ? "" : "s"} matched the current filters.`}>
        {loading ? (
          <div className="h-48 animate-pulse rounded-3xl bg-stone-100" />
        ) : filtered.length === 0 ? (
          <EmptyState title="No submissions" description="No submissions matched the selected filters." />
        ) : (
          <PaginatedCardList
            items={filtered}
            itemsPerPage={3}
            renderItem={(submission) => (
              <div key={submission.id} className="rounded-3xl border border-stone-200 bg-white p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/campaigns/${submission.campaignId}`} className="text-lg font-semibold text-stone-900 hover:text-amber-700">
                        {submission.campaignTitle || submission.campaignId}
                      </Link>
                      <StatusBadge
                        label={submission.status}
                        tone={submission.status === "Verified" ? "green" : submission.status === "Rejected" ? "red" : "amber"}
                      />
                    </div>
                    <p className="text-sm text-stone-500">
                      {submission.category} • {currency(submission.earnerPrice)} • Earner {submission.userId}
                    </p>
                    {submission.note ? <p className="text-sm leading-6 text-stone-600">{submission.note}</p> : null}
                    {submission.advertiserFlagStatus === "pending" ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <p className="font-semibold">Advertiser flagged this proof for admin review.</p>
                        <p className="mt-1">{submission.advertiserFlagReason}</p>
                        {submission.advertiserFlagReviewDueAtMs ? (
                          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-amber-700">
                            Review target: {new Date(submission.advertiserFlagReviewDueAtMs).toLocaleString()}
                          </p>
                        ) : null}
                      </div>
                    ) : submission.advertiserFlagStatus === "overruled" || submission.advertiserFlagStatus === "upheld" ? (
                      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
                        Advertiser flag {submission.advertiserFlagStatus === "upheld" ? "was upheld" : "was overruled"} by admin.
                      </div>
                    ) : null}
                    {submission.status === "Rejected" && submission.rejectionReason ? (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                        <span className="font-semibold">Reason shown to earner:</span> {submission.rejectionReason}
                      </div>
                    ) : null}
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                      {submission.createdAtMs ? new Date(submission.createdAtMs).toLocaleString() : "Unknown date"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {submission.proofUrls.length > 0 ? (
                      submission.proofUrls.map((proof, index) => (
                        <Button key={`${submission.id}-proof-${index}`} asChild variant="outline" className="rounded-full">
                          <Link href={proof} target="_blank">Proof {index + 1}</Link>
                        </Button>
                      ))
                    ) : null}
                    {submission.status !== "Verified" ? (
                      <Button className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700" disabled={processingId === submission.id} onClick={() => markProofStatus(submission, "Verified")}>
                        {submission.status === "Rejected" ? "Re-verify" : "Verify"}
                      </Button>
                    ) : null}
                    {submission.status !== "Rejected" ? (
                      <Button variant="outline" className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50" disabled={processingId === submission.id} onClick={() => markProofStatus(submission, "Rejected")}>
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
    </div>
  );
}
