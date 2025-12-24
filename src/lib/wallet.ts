import { Timestamp } from "firebase/firestore"

export type Campaign = {
  id: string
  title: string
  bannerUrl?: string
  status: "Active" | "Paused" | "Stopped" | "Pending" | "Deleted"
  budget: number
  estimatedLeads: number
  generatedLeads?: number
  costPerLead?: number
}

export type Withdrawal = {
  id: string
  amount: number
  status: string
  createdAt?: Timestamp
  fullName?: string
  phone?: string
  bankName?: string
  accountNumber?: string
  email?: string
}

export type Reroute = {
  id: string
  reroutes: { campaignId: string; amount: number }[]
  status: string
  createdAt?: Timestamp
}

export const calculateWalletBalances = (
  campaigns: Campaign[],
  withdrawals: { amount?: number; status?: string }[] = [],
  reroutes: { reroutes?: { amount?: number }[]; status?: string }[] = [],
  resumedCampaigns: { resumedBudget?: number; amountUsed?: number; status?: string }[] = []
) => {
  const totalDeposited = campaigns.reduce((sum, c) => sum + (c.budget || 0), 0)
  const totalSpent = campaigns.reduce(
    (sum, c) => sum + (c.generatedLeads || 0) * (c.costPerLead || 0),
    0
  )

  // Base refundable amount comes from stopped/deleted campaigns
  const refundableBalanceBase = Math.max(
    0,
    campaigns
      .filter((c) => c.status === "Stopped" || c.status === "Deleted")
      .reduce(
        (sum, c) => sum + Math.max(0, (c.budget || 0) - (c.generatedLeads || 0) * (c.costPerLead || 0)),
        0
      )
  )

  // Pending/approved withdrawals reduce refundable balance
  const totalRequestedWithdrawals = Array.isArray(withdrawals)
    ? withdrawals
        .filter((w) => ['pending', 'approved'].includes(String(w.status || '').toLowerCase()))
        .reduce((s, w) => s + (Number(w.amount) || 0), 0)
    : 0

  // Pending/approved reroutes reduce refundable balance
  const totalRequestedReroutes = Array.isArray(reroutes)
    ? reroutes
        .filter((r) => ['pending', 'approved'].includes(String(r.status || '').toLowerCase()))
        .reduce(
          (s, r) =>
            s +
            (Array.isArray(r.reroutes)
              ? r.reroutes.reduce((sub, rr) => sub + (Number(rr.amount) || 0), 0)
              : 0),
          0
        )
    : 0

  // Resumed campaigns amount used (pending/approved) also reduce refundable balance
  const totalResumedUsed = Array.isArray(resumedCampaigns)
    ? resumedCampaigns
        .filter((r) => ['pending', 'approved'].includes(String(r.status || '').toLowerCase()))
        .reduce((s, r) => s + (Number(r.amountUsed) || 0), 0)
    : 0

  const refundableBalance = Math.max(
    0,
    refundableBalanceBase - totalRequestedWithdrawals - totalRequestedReroutes - totalResumedUsed
  )

  // active balance should use the base (not the post-deduction refundable), since deductions are still pending
  const activeBalance = totalDeposited - totalSpent - refundableBalanceBase

  return { totalDeposited, totalSpent, refundableBalance, refundableBalanceBase, activeBalance }
}
