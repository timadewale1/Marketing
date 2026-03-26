export type CampaignProgressSubmission = {
  campaignId?: string | null;
  status?: string | null;
};

export type CampaignProgressSummary = {
  target: number;
  verified: number;
  pending: number;
  rejected: number;
  totalSubmissions: number;
  progressPercent: number;
};

function clampTarget(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function summarizeCampaignProgress({
  target,
  generatedLeads,
  completedLeads,
  submissions,
}: {
  target?: number | null;
  generatedLeads?: number | null;
  completedLeads?: number | null;
  submissions?: CampaignProgressSubmission[];
}): CampaignProgressSummary {
  const safeTarget = clampTarget(Number(target || 0));

  if (!submissions || submissions.length === 0) {
    const verified = Math.max(
      0,
      Number.isFinite(Number(completedLeads))
        ? Number(completedLeads)
        : Number(generatedLeads || 0)
    );

    return {
      target: safeTarget,
      verified,
      pending: 0,
      rejected: 0,
      totalSubmissions: verified,
      progressPercent: safeTarget > 0 ? Math.min((verified / safeTarget) * 100, 100) : 0,
    };
  }

  const verified = submissions.filter(
    (submission) => String(submission.status || "").toLowerCase() === "verified"
  ).length;
  const pending = submissions.filter(
    (submission) => String(submission.status || "").toLowerCase() === "pending"
  ).length;
  const rejected = submissions.filter(
    (submission) => String(submission.status || "").toLowerCase() === "rejected"
  ).length;

  return {
    target: safeTarget,
    verified,
    pending,
    rejected,
    totalSubmissions: submissions.length,
    progressPercent: safeTarget > 0 ? Math.min((verified / safeTarget) * 100, 100) : 0,
  };
}
