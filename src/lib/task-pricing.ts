export const EARNER_PAYOUT_RATE = 0.6

export function computeEarnerPayout(costPerLead: number | string) {
  const safeCost = Math.max(0, Number(costPerLead || 0))
  return Math.round(safeCost * EARNER_PAYOUT_RATE)
}

export function computeAdvertiserCharge(
  reservedAmount: number | string | undefined,
  costPerLead: number | string | undefined,
  earnerAmount: number | string | undefined
) {
  const reserved = Math.max(0, Number(reservedAmount || 0))
  if (reserved > 0) return reserved

  const cost = Math.max(0, Number(costPerLead || 0))
  if (cost > 0) return cost

  const payout = Math.max(0, Number(earnerAmount || 0))
  return payout > 0 ? Math.round(payout / EARNER_PAYOUT_RATE) : 0
}
