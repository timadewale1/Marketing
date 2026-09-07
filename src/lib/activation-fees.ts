// Multi-level referral system for Pamba Business Network
// Level 1: Direct referrer gets ₦2,000 (legacy reference kept here for history; current activation fee is ₦4,500)
// Level 2: Referrer's referrer gets ₦500
// Level 3: Referrer's referrer's referrer gets ₦300
// Level 4: Referrer's referrer's referrer's referrer gets ₦200
// Total distributed: ₦3,000 out of ₦4,500 membership fee

export const ACTIVATION_FEE = 4500;

export const REFERRAL_DISTRIBUTION = {
  LEVEL_1: 2000,  // Direct referrer
  LEVEL_2: 500,   // Referrer's referrer
  LEVEL_3: 300,   // Referrer's referrer's referrer
  LEVEL_4: 200,   // Referrer's referrer's referrer's referrer
};

export const TOTAL_REFERRAL_POOL = 3000; // Total distributed to referrers
export const PLATFORM_CHARGE = 1500;     // ₦1,500 for platform operations

export const REFERRAL_LEVELS = [
  { level: 1, amount: REFERRAL_DISTRIBUTION.LEVEL_1, label: '1st Generation' },
  { level: 2, amount: REFERRAL_DISTRIBUTION.LEVEL_2, label: '2nd Generation' },
  { level: 3, amount: REFERRAL_DISTRIBUTION.LEVEL_3, label: '3rd Generation' },
  { level: 4, amount: REFERRAL_DISTRIBUTION.LEVEL_4, label: '4th Generation' },
];

export function getTotalActivationFee(): number {
  return ACTIVATION_FEE;
}

export function getReferralBonusForLevel(level: 1 | 2 | 3 | 4): number {
  const amounts: Record<number, number> = {
    1: REFERRAL_DISTRIBUTION.LEVEL_1,
    2: REFERRAL_DISTRIBUTION.LEVEL_2,
    3: REFERRAL_DISTRIBUTION.LEVEL_3,
    4: REFERRAL_DISTRIBUTION.LEVEL_4,
  };
  return amounts[level] || 0;
}

export function getActivationFeeLabel(): string {
  return `₦${ACTIVATION_FEE.toLocaleString()}`;
}

export function getReferralPoolLabel(): string {
  return `₦${TOTAL_REFERRAL_POOL.toLocaleString()}`;
}

export function getPlatformChargeLabel(): string {
  return `₦${PLATFORM_CHARGE.toLocaleString()}`;
}

export function getReferralDistributionSummary() {
  return {
    totalFee: ACTIVATION_FEE,
    referralPool: TOTAL_REFERRAL_POOL,
    platformCharge: PLATFORM_CHARGE,
    levels: REFERRAL_LEVELS.map(l => ({
      ...l,
      amountLabel: `₦${l.amount.toLocaleString()}`,
    })),
    totalDistributed: Object.values(REFERRAL_DISTRIBUTION).reduce((a, b) => a + b, 0),
  };
}
