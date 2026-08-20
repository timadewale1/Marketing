import type { Firestore } from 'firebase-admin/firestore'

type CampaignLike = {
  originalBudget?: number | string
  budget?: number | string
}

type CampaignTxLike = {
  type?: string
  amount?: number | string
}

export async function computeSafeCampaignRefundAmount(
  db: Firestore,
  campaignId: string,
  campaign: CampaignLike
) {
  const txSnap = await db.collection('advertiserTransactions').where('campaignId', '==', campaignId).get()
  const txs = txSnap.docs.map((doc) => doc.data() as CampaignTxLike)

  const topUps = txs.reduce((sum, tx) => {
    return tx.type === 'campaign_top_up' ? sum + Math.abs(Number(tx.amount || 0)) : sum
  }, 0)

  const debits = txs.reduce((sum, tx) => {
    return tx.type === 'debit' ? sum + Math.abs(Number(tx.amount || 0)) : sum
  }, 0)

  const recordedBudget = Math.max(0, Number(campaign.originalBudget || campaign.budget || 0))
  const ledgerBasedCap = Math.max(0, recordedBudget + topUps - debits)
  const liveBudget = Math.max(0, Number(campaign.budget || 0))

  return Math.min(liveBudget, ledgerBasedCap)
}
