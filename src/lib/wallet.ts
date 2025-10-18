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

export const calculateWalletBalances = (campaigns: Campaign[]) => {
  const totalDeposited = campaigns.reduce((sum, c) => sum + (c.budget || 0), 0)
  const totalSpent = campaigns.reduce(
    (sum, c) => sum + (c.generatedLeads || 0) * (c.costPerLead || 0),
    0
  )

  const refundableBalanceBase = Math.max(
    0,
    campaigns
      .filter((c) => c.status === "Stopped" || c.status === "Deleted")
      .reduce(
        (sum, c) =>
          sum + (c.budget || 0) - (c.generatedLeads || 0) * (c.costPerLead || 0),
        0
      )
  )

  const activeBalance = totalDeposited - totalSpent - refundableBalanceBase

  return { totalDeposited, totalSpent, refundableBalance: refundableBalanceBase, activeBalance }
}
