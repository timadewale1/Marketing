"use client";

import { cn } from "@/lib/utils";

type SubmissionReviewStatusProps = {
  advertiserStatus?: string | null;
  advertiserReason?: string | null;
  advertiserReviewAt?: string | null;
  advertiserReviewDueAt?: string | null;
  earnerDisputeReason?: string | null;
  className?: string;
};

function normalizeStatus(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

export function SubmissionReviewStatus({
  advertiserStatus,
  advertiserReason,
  advertiserReviewAt,
  advertiserReviewDueAt,
  earnerDisputeReason,
  className,
}: SubmissionReviewStatusProps) {
  const status = normalizeStatus(advertiserStatus);
  const reason = String(advertiserReason || "").trim();
  const disputeReason = String(earnerDisputeReason || "").trim();

  const reviewText =
    status === "approved" || status === "verified"
      ? "Advertiser approved this proof."
      : status === "rejected"
        ? "Advertiser rejected this proof."
        : status === "auto_verified"
          ? "Automatically verified after 24 hours without advertiser review."
          : status === "pending"
            ? "Advertiser review is pending."
            : status === "upheld"
              ? "Advertiser rejection was upheld by admin."
              : status === "overruled"
                ? "Advertiser approval was overruled by admin."
                : "";

  if (!reviewText && !reason && !disputeReason) {
    return null;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {reviewText ? (
        <div
          className={cn(
            "rounded-2xl border p-3 text-sm",
            status === "approved" || status === "verified" || status === "auto_verified"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : status === "rejected" || status === "upheld"
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
          )}
        >
          <p className="font-semibold">{reviewText}</p>
          {reason ? <p className="mt-1 leading-6">{reason}</p> : null}
          {advertiserReviewAt ? (
            <p className="mt-2 text-xs uppercase tracking-[0.18em] opacity-80">
              Reviewed at: {new Date(advertiserReviewAt).toLocaleString()}
            </p>
          ) : null}
          {advertiserReviewDueAt && status === "pending" ? (
            <p className="mt-2 text-xs uppercase tracking-[0.18em] opacity-80">
              Auto review target: {new Date(advertiserReviewDueAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      ) : reason ? (
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-800">
          <p className="font-semibold">Review note</p>
          <p className="mt-1 leading-6">{reason}</p>
        </div>
      ) : null}

      {disputeReason ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <p className="font-semibold">Earner dispute</p>
          <p className="mt-1 leading-6">{disputeReason}</p>
        </div>
      ) : null}
    </div>
  );
}
