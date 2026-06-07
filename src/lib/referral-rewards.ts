const REFERRAL_PROMO_START_AT = new Date("2026-06-08T00:00:00+01:00")

const LEGACY_ACTIVATION_REFERRAL_AMOUNT = 500
const PROMO_ACTIVATION_REFERRAL_AMOUNT = 1000
const LEGACY_ADVERTISER_TASK_REFERRAL_RATE = 0.1
const PROMO_ADVERTISER_TASK_REFERRAL_RATE = 0.2

function isPromoActive(now: Date = new Date()) {
  return now.getTime() >= REFERRAL_PROMO_START_AT.getTime()
}

export function getReferralActivationBonusAmount(now: Date = new Date()) {
  return isPromoActive(now) ? PROMO_ACTIVATION_REFERRAL_AMOUNT : LEGACY_ACTIVATION_REFERRAL_AMOUNT
}

export function getReferralActivationBonusLabel(now: Date = new Date()) {
  return `₦${getReferralActivationBonusAmount(now).toLocaleString()}`
}

export function getAdvertiserTaskReferralRate(now: Date = new Date()) {
  return isPromoActive(now) ? PROMO_ADVERTISER_TASK_REFERRAL_RATE : LEGACY_ADVERTISER_TASK_REFERRAL_RATE
}

export function getAdvertiserTaskReferralLabel(now: Date = new Date()) {
  return `${Math.round(getAdvertiserTaskReferralRate(now) * 100)}%`
}

export function getAdvertiserTaskReferralBonusAmount(campaignBudget: number, now: Date = new Date()) {
  const safeBudget = Math.max(0, Math.floor(Number(campaignBudget || 0)))
  return Math.floor(safeBudget * getAdvertiserTaskReferralRate(now))
}

export function getReferralPromoCopy(now: Date = new Date()) {
  return {
    activation: `${getReferralActivationBonusLabel(now)} per activated earner`,
    advertiserTask: `${getAdvertiserTaskReferralLabel(now)} of every task budget`,
  }
}
