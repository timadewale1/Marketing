// usufPlans.ts
// Markup: +₦200 on every plan.
// Grouping order requested for UI/grouped retrieval:
// AWOOF → SME → SME2 → DATA COUPONS → GIFTING → CORPORATE

export type UsufNetwork = 1 | 2 | 3 | 4 | 5

export const USUF_NETWORKS: Record<UsufNetwork, string> = {
  1: "MTN",
  2: "GLO",
  3: "9MOBILE",
  4: "AIRTEL",
  5: "SMILE",
}

export const DATA_MARKUP_NAIRA = 100

export type UsufPlan = {
  id: number // Data ID (plan_id)
  network: UsufNetwork // network_id
  planType: string
  amount: number // vendor price (₦)
  size: string
  validity: string
}

export type UsufPlanWithSelling = UsufPlan & {
  sellAmount: number
  networkName: string
}

export const sellingPrice = (plan: UsufPlan) => plan.amount + DATA_MARKUP_NAIRA

// Group display order (your requested order)
export const PLAN_TYPE_ORDER = [
  "AWOOF DATA",
  "SME",
  "SME/DATA SHARE", // I keep this near SME for convenience
  "SME2",
  "DATA COUPONS",
  "GIFTING",
  "CORPORATE GIFTING",
  "MTN SPECIAL PROMO/DATA SHARE 2",
] as const

const planTypeRank = (planType: string) => {
  const idx = PLAN_TYPE_ORDER.indexOf(planType as typeof PLAN_TYPE_ORDER[number])
  return idx === -1 ? 999 : idx
}

export const USUF_DATA_PLANS: UsufPlan[] = [
  // ======================================================
  // MTN (1) — grouped internally as: AWOOF → SME → SME2 → DATA COUPONS → GIFTING → CORPORATE → PROMO
  // ======================================================

  // MTN — AWOOF DATA
  { id: 11, network: 1, planType: "AWOOF DATA", amount: 2650, size: "5.0 GB", validity: "1 month" },
  { id: 294, network: 1, planType: "AWOOF DATA", amount: 2000, size: "3.0 GB", validity: "1 month" },
  { id: 305, network: 1, planType: "AWOOF DATA", amount: 1000, size: "3.2 GB", validity: "1 month" },
  { id: 366, network: 1, planType: "AWOOF DATA", amount: 499, size: "1.0 GB", validity: "1 month" },
  { id: 368, network: 1, planType: "AWOOF DATA", amount: 2499, size: "6.0 GB", validity: "1 month" },
  { id: 406, network: 1, planType: "AWOOF DATA", amount: 799, size: "1.0 GB", validity: "1 month" },
  { id: 408, network: 1, planType: "AWOOF DATA", amount: 199, size: "230.0 MB", validity: "1 month" },
  { id: 418, network: 1, planType: "AWOOF DATA", amount: 3499, size: "11.0 GB", validity: "1 month" },
  { id: 419, network: 1, planType: "AWOOF DATA", amount: 1500, size: "2.0 GB", validity: "1 month" },
  { id: 438, network: 1, planType: "AWOOF DATA", amount: 750, size: "1.0 GB", validity: "1 month" },
  { id: 442, network: 1, planType: "AWOOF DATA", amount: 599, size: "1.5 GB", validity: "1 month" },
  { id: 444, network: 1, planType: "AWOOF DATA", amount: 1500, size: "3.5 GB", validity: "1 month" },
  { id: 459, network: 1, planType: "AWOOF DATA", amount: 349, size: "500.0 MB", validity: "1 month" },
  { id: 463, network: 1, planType: "AWOOF DATA", amount: 550, size: "1.2 GB", validity: "1 month" },
  { id: 464, network: 1, planType: "AWOOF DATA", amount: 480, size: "750.0 MB", validity: "1 month" },
  { id: 512, network: 1, planType: "AWOOF DATA", amount: 250, size: "1.0 GB", validity: "1 month" },
  { id: 516, network: 1, planType: "AWOOF DATA", amount: 550, size: "2.5 GB", validity: "1 month" },

  // MTN — SME
  { id: 420, network: 1, planType: "SME", amount: 1209, size: "2.0 GB", validity: "1 month" },
  { id: 426, network: 1, planType: "SME", amount: 599, size: "1.0 GB", validity: "1 month" },
  { id: 427, network: 1, planType: "SME", amount: 425, size: "500.0 MB", validity: "1 month" },
  { id: 460, network: 1, planType: "SME", amount: 2400, size: "5.0 GB", validity: "1 month" },
  { id: 461, network: 1, planType: "SME", amount: 1600, size: "3.0 GB", validity: "1 month" },

  // MTN — SME/DATA SHARE (kept near SME per your order)
  { id: 405, network: 1, planType: "SME/DATA SHARE", amount: 2500, size: "5.0 GB", validity: "1 month" },
  { id: 462, network: 1, planType: "SME/DATA SHARE", amount: 1800, size: "3.0 GB", validity: "1 month" },
  { id: 472, network: 1, planType: "SME/DATA SHARE", amount: 1350, size: "2.0 GB", validity: "1 month" },
  { id: 481, network: 1, planType: "SME/DATA SHARE", amount: 700, size: "1.0 GB", validity: "1 month" },
  { id: 502, network: 1, planType: "SME/DATA SHARE", amount: 440, size: "500.0 MB", validity: "1 month" },

  // MTN — SME2
  { id: 465, network: 1, planType: "SME2", amount: 1850, size: "3.0 GB", validity: "1 month" },
  { id: 467, network: 1, planType: "SME2", amount: 1380, size: "2.0 GB", validity: "1 month" },
  { id: 479, network: 1, planType: "SME2", amount: 650, size: "1.0 GB", validity: "1 month" },
  { id: 503, network: 1, planType: "SME2", amount: 2400, size: "5.0 GB", validity: "1 month" },
  { id: 504, network: 1, planType: "SME2", amount: 440, size: "500.0 MB", validity: "1 month" },

  // MTN — DATA COUPONS
  { id: 43, network: 1, planType: "DATA COUPONS", amount: 6900, size: "10.0 GB", validity: "1 month" },
  { id: 289, network: 1, planType: "DATA COUPONS", amount: 260, size: "1.0 GB", validity: "1 month" },
//   { id: 292, network: 1, planType: "DATA COUPONS", amount: 1500000, size: "750.0 MB", validity: "1 month" },
  { id: 421, network: 1, planType: "DATA COUPONS", amount: 2500, size: "3.5 GB", validity: "1 month" },
  { id: 505, network: 1, planType: "DATA COUPONS", amount: 650, size: "1.0 GB", validity: "1 month" },

  // MTN — GIFTING
  { id: 291, network: 1, planType: "GIFTING", amount: 2000, size: "3.0 GB", validity: "1 month" },
  { id: 303, network: 1, planType: "GIFTING", amount: 2650, size: "5.0 GB", validity: "1 month" },
  { id: 327, network: 1, planType: "GIFTING", amount: 75, size: "75.0 MB", validity: "1 month" },
  { id: 328, network: 1, planType: "GIFTING", amount: 99, size: "110.0 MB", validity: "1 month" },
  { id: 331, network: 1, planType: "GIFTING", amount: 499, size: "1.0 GB", validity: "1 month" },
  { id: 334, network: 1, planType: "GIFTING", amount: 749, size: "2.0 GB", validity: "1 month" },
  { id: 335, network: 1, planType: "GIFTING", amount: 450, size: "750.0 MB", validity: "1 month" },
  { id: 336, network: 1, planType: "GIFTING", amount: 749, size: "2.5 GB", validity: "1 month" },
  { id: 337, network: 1, planType: "GIFTING", amount: 899, size: "2.5 GB", validity: "1 month" },
  { id: 339, network: 1, planType: "GIFTING", amount: 799, size: "1.0 GB", validity: "1 month" },
  { id: 341, network: 1, planType: "GIFTING", amount: 999, size: "1.5 GB", validity: "1 month" },
  { id: 342, network: 1, planType: "GIFTING", amount: 2499, size: "6.0 GB", validity: "1 month" },
  { id: 343, network: 1, planType: "GIFTING", amount: 1499, size: "2.0 GB", validity: "1 month" },
  { id: 344, network: 1, planType: "GIFTING", amount: 2999, size: "6.75 GB", validity: "1 month" },
  { id: 345, network: 1, planType: "GIFTING", amount: 1999, size: "2.7 GB", validity: "1 month" },
  { id: 348, network: 1, planType: "GIFTING", amount: 4999, size: "14.5 GB", validity: "1 month" },
  { id: 349, network: 1, planType: "GIFTING", amount: 4499, size: "10.0 GB", validity: "1 month" },
  { id: 350, network: 1, planType: "GIFTING", amount: 5499, size: "12.5 GB", validity: "1 month" },
  { id: 351, network: 1, planType: "GIFTING", amount: 6499, size: "16.5 GB", validity: "1 month" },
  { id: 355, network: 1, planType: "GIFTING", amount: 11000, size: "36.0 GB", validity: "1 month" },
  { id: 357, network: 1, planType: "GIFTING", amount: 18000, size: "75.0 GB", validity: "1 month" },
  { id: 358, network: 1, planType: "GIFTING", amount: 35000, size: "165.0 GB", validity: "1 month" },
  { id: 359, network: 1, planType: "GIFTING", amount: 55000, size: "250.0 GB", validity: "1 month" },
  { id: 369, network: 1, planType: "GIFTING", amount: 999, size: "3.2 GB", validity: "1 month" },
  { id: 413, network: 1, planType: "GIFTING", amount: 3499, size: "5.5 GB", validity: "1 month" },
  { id: 414, network: 1, planType: "GIFTING", amount: 3499, size: "11.0 GB", validity: "1 month" },
  { id: 415, network: 1, planType: "GIFTING", amount: 499, size: "500.0 MB", validity: "1 month" },
  { id: 417, network: 1, planType: "GIFTING", amount: 2499, size: "3.5 GB", validity: "1 month" },
  { id: 429, network: 1, planType: "GIFTING", amount: 9000, size: "25.0 GB", validity: "1 month" },
  { id: 436, network: 1, planType: "GIFTING", amount: 599, size: "1.5 GB", validity: "1 month" },
  { id: 441, network: 1, planType: "GIFTING", amount: 480, size: "1.2 GB", validity: "1 month" },
  { id: 446, network: 1, planType: "GIFTING", amount: 5000, size: "20.0 GB", validity: "1 month" },
  { id: 448, network: 1, planType: "GIFTING", amount: 249, size: "470.0 MB", validity: "1 month" },
  { id: 457, network: 1, planType: "GIFTING", amount: 1499, size: "3.5 GB", validity: "1 month" },
  { id: 458, network: 1, planType: "GIFTING", amount: 349, size: "500.0 MB", validity: "1 month" },
  { id: 511, network: 1, planType: "GIFTING", amount: 260, size: "1.0 GB", validity: "1 month" },
  { id: 514, network: 1, planType: "GIFTING", amount: 550, size: "2.5 GB", validity: "1 month" },

  // MTN — CORPORATE GIFTING
  { id: 295, network: 1, planType: "CORPORATE GIFTING", amount: 2550, size: "5.0 GB", validity: "1 month" },
  { id: 356, network: 1, planType: "CORPORATE GIFTING", amount: 18000, size: "75.0 GB", validity: "1 month" },
  { id: 422, network: 1, planType: "CORPORATE GIFTING", amount: 4500, size: "10.0 GB", validity: "1 month" },
  { id: 423, network: 1, planType: "CORPORATE GIFTING", amount: 5500, size: "12.5 GB", validity: "1 month" },
  { id: 424, network: 1, planType: "CORPORATE GIFTING", amount: 6500, size: "16.5 GB", validity: "1 month" },
  { id: 428, network: 1, planType: "CORPORATE GIFTING", amount: 7500, size: "20.0 GB", validity: "1 month" },
  { id: 431, network: 1, planType: "CORPORATE GIFTING", amount: 1500, size: "1.8 GB", validity: "1 month" },
  { id: 433, network: 1, planType: "CORPORATE GIFTING", amount: 3500, size: "7.0 GB", validity: "1 month" },
  { id: 434, network: 1, planType: "CORPORATE GIFTING", amount: 1000, size: "1.5 GB", validity: "1 month" },
  { id: 439, network: 1, planType: "CORPORATE GIFTING", amount: 699, size: "1.0 GB", validity: "1 month" },
  { id: 440, network: 1, planType: "CORPORATE GIFTING", amount: 480, size: "1.2 GB", validity: "1 month" },
  { id: 443, network: 1, planType: "CORPORATE GIFTING", amount: 1499, size: "3.5 GB", validity: "1 month" },
  { id: 445, network: 1, planType: "CORPORATE GIFTING", amount: 4999, size: "20.0 GB", validity: "1 month" },
  { id: 447, network: 1, planType: "CORPORATE GIFTING", amount: 250, size: "470.0 MB", validity: "1 month" },
  { id: 513, network: 1, planType: "CORPORATE GIFTING", amount: 250, size: "1.0 GB", validity: "1 month" },
  { id: 515, network: 1, planType: "CORPORATE GIFTING", amount: 550, size: "2.5 GB", validity: "1 month" },

  // MTN — MTN SPECIAL PROMO/DATA SHARE 2 (kept last; your requested order didn't mention it)
  { id: 485, network: 1, planType: "MTN SPECIAL PROMO/DATA SHARE 2", amount: 620, size: "1.0 GB", validity: "1 month" },
  { id: 486, network: 1, planType: "MTN SPECIAL PROMO/DATA SHARE 2", amount: 1260, size: "2.0 GB", validity: "1 month" },
  { id: 487, network: 1, planType: "MTN SPECIAL PROMO/DATA SHARE 2", amount: 1740, size: "3.0 GB", validity: "1 month" },
  { id: 488, network: 1, planType: "MTN SPECIAL PROMO/DATA SHARE 2", amount: 2400, size: "5.0 GB", validity: "1 month" },
  { id: 489, network: 1, planType: "MTN SPECIAL PROMO/DATA SHARE 2", amount: 430, size: "500.0 MB", validity: "1 month" },

  // ======================================================
  // AIRTEL (4)
  // ======================================================

  // AIRTEL — AWOOF DATA
  { id: 315, network: 4, planType: "AWOOF DATA", amount: 3100, size: "10.0 GB", validity: "1 month" },
  { id: 469, network: 4, planType: "AWOOF DATA", amount: 799, size: "3.0 GB", validity: "1 month" },
  { id: 470, network: 4, planType: "AWOOF DATA", amount: 260, size: "600.0 MB", validity: "1 month" },
  { id: 478, network: 4, planType: "AWOOF DATA", amount: 598, size: "1.5 GB", validity: "1 month" },
  { id: 490, network: 4, planType: "AWOOF DATA", amount: 650, size: "2.0 GB", validity: "1 month" },
  { id: 491, network: 4, planType: "AWOOF DATA", amount: 79, size: "150.0 MB", validity: "1 month" },
  { id: 492, network: 4, planType: "AWOOF DATA", amount: 139, size: "300.0 MB", validity: "1 month" },
  { id: 493, network: 4, planType: "AWOOF DATA", amount: 499, size: "1.5 GB", validity: "1 month" },

  // AIRTEL — SME2 (as pasted)
  { id: 496, network: 4, planType: "SME2", amount: 120, size: "100.0 MB", validity: "1 month" },
  { id: 497, network: 4, planType: "SME2", amount: 490, size: "500.0 GB", validity: "1 month" },
  { id: 498, network: 4, planType: "SME2", amount: 295, size: "300.0 MB", validity: "1 month" },
  { id: 499, network: 4, planType: "SME2", amount: 950, size: "1.0 GB", validity: "1 month" },

  // AIRTEL — DATA COUPONS
  { id: 308, network: 4, planType: "DATA COUPONS", amount: 75, size: "150.0 MB", validity: "1 month" },
  { id: 313, network: 4, planType: "DATA COUPONS", amount: 1100, size: "3.0 GB", validity: "1 month" },
  { id: 325, network: 4, planType: "DATA COUPONS", amount: 350, size: "1.0 GB", validity: "1 month" },
  { id: 468, network: 4, planType: "DATA COUPONS", amount: 120, size: "200.0 MB", validity: "1 month" },
  { id: 494, network: 4, planType: "DATA COUPONS", amount: 1100, size: "3.0 GB", validity: "1 month" },
  { id: 508, network: 4, planType: "DATA COUPONS", amount: 600, size: "3.2 GB", validity: "1 month" },
  { id: 509, network: 4, planType: "DATA COUPONS", amount: 1100, size: "6.5 GB", validity: "1 month" },

  // AIRTEL — GIFTING
  { id: 383, network: 4, planType: "GIFTING", amount: 599, size: "1.5 GB", validity: "1 month" },
  { id: 384, network: 4, planType: "GIFTING", amount: 499, size: "1.0 GB", validity: "1 month" },
  { id: 385, network: 4, planType: "GIFTING", amount: 749, size: "2.0 GB", validity: "1 month" },
  { id: 386, network: 4, planType: "GIFTING", amount: 999, size: "3.0 GB", validity: "1 month" },
  { id: 387, network: 4, planType: "GIFTING", amount: 1499, size: "5.0 GB", validity: "1 month" },
  { id: 388, network: 4, planType: "GIFTING", amount: 2999, size: "10.0 GB", validity: "1 month" },
  { id: 389, network: 4, planType: "GIFTING", amount: 2499, size: "6.0 GB", validity: "1 month" },
  { id: 390, network: 4, planType: "GIFTING", amount: 1499, size: "3.5 GB", validity: "1 month" },
  { id: 391, network: 4, planType: "GIFTING", amount: 99, size: "100.0 MB", validity: "1 month" },
  { id: 392, network: 4, planType: "GIFTING", amount: 2999, size: "8.0 GB", validity: "1 month" },
  { id: 393, network: 4, planType: "GIFTING", amount: 2499, size: "4.0 GB", validity: "1 month" },
  { id: 449, network: 4, planType: "GIFTING", amount: 230, size: "200.0 MB", validity: "1 month" },

  // AIRTEL — CORPORATE GIFTING
  { id: 239, network: 4, planType: "CORPORATE GIFTING", amount: 839, size: "1.0 GB", validity: "1 month" },
  { id: 240, network: 4, planType: "CORPORATE GIFTING", amount: 1539, size: "2.0 GB", validity: "1 month" },
  { id: 241, network: 4, planType: "CORPORATE GIFTING", amount: 2040, size: "3.0 GB", validity: "1 month" },
  { id: 242, network: 4, planType: "CORPORATE GIFTING", amount: 500, size: "500.0 MB", validity: "1 month" },
  { id: 243, network: 4, planType: "CORPORATE GIFTING", amount: 300, size: "300.0 MB", validity: "1 month" },
  { id: 244, network: 4, planType: "CORPORATE GIFTING", amount: 110, size: "100.0 MB", validity: "1 month" },
  { id: 250, network: 4, planType: "CORPORATE GIFTING", amount: 4090, size: "10.0 GB", validity: "1 month" },
  { id: 454, network: 4, planType: "CORPORATE GIFTING", amount: 2540, size: "4.0 GB", validity: "1 month" },

  // AIRTEL — vendor table had this label; kept exact
  { id: 495, network: 4, planType: "MTN SPECIAL PROMO/DATA SHARE 2", amount: 100, size: "100.0 MB", validity: "1 month" },

  // ======================================================
  // GLO (2)
  // ======================================================

  // GLO — AWOOF DATA
  { id: 362, network: 2, planType: "AWOOF DATA", amount: 299, size: "1.5 GB", validity: "1 month" },
  { id: 363, network: 2, planType: "AWOOF DATA", amount: 499, size: "2.5 GB", validity: "1 month" },
  { id: 364, network: 2, planType: "AWOOF DATA", amount: 1999, size: "10.0 GB", validity: "1 month" },

  // GLO — GIFTING
  { id: 394, network: 2, planType: "GIFTING", amount: 2999, size: "8.0 GB", validity: "1 month" },
  { id: 395, network: 2, planType: "GIFTING", amount: 349, size: "1.0 GB", validity: "1 month" },
  { id: 396, network: 2, planType: "GIFTING", amount: 499, size: "2.0 GB", validity: "1 month" },
  { id: 397, network: 2, planType: "GIFTING", amount: 599, size: "3.55 GB", validity: "1 month" },
  { id: 398, network: 2, planType: "GIFTING", amount: 999, size: "5.1 GB", validity: "1 month" },
  { id: 400, network: 2, planType: "GIFTING", amount: 1999, size: "6.25 GB", validity: "1 month" },
  { id: 401, network: 2, planType: "GIFTING", amount: 2499, size: "7.5 GB", validity: "1 month" },
  { id: 402, network: 2, planType: "GIFTING", amount: 2999, size: "10.0 GB", validity: "1 month" },
  { id: 403, network: 2, planType: "GIFTING", amount: 3999, size: "12.5 GB", validity: "1 month" },
  { id: 404, network: 2, planType: "GIFTING", amount: 4999, size: "16.0 GB", validity: "1 month" },
  { id: 451, network: 2, planType: "GIFTING", amount: 99, size: "110.0 MB", validity: "1 month" },
  { id: 452, network: 2, planType: "GIFTING", amount: 199, size: "260.0 MB", validity: "1 month" },
  { id: 453, network: 2, planType: "GIFTING", amount: 49, size: "50.0 MB", validity: "1 month" },

  // GLO — CORPORATE GIFTING
  { id: 258, network: 2, planType: "CORPORATE GIFTING", amount: 450, size: "1.024 GB", validity: "1 month" },
  { id: 259, network: 2, planType: "CORPORATE GIFTING", amount: 899, size: "2.048 GB", validity: "1 month" },
  { id: 260, network: 2, planType: "CORPORATE GIFTING", amount: 1299, size: "3.072 GB", validity: "1 month" },
  { id: 261, network: 2, planType: "CORPORATE GIFTING", amount: 2200, size: "5.12 GB", validity: "1 month" },
  { id: 262, network: 2, planType: "CORPORATE GIFTING", amount: 4300, size: "10.24 GB", validity: "1 month" },
  { id: 263, network: 2, planType: "CORPORATE GIFTING", amount: 257, size: "500.0 MB", validity: "1 month" },
  { id: 264, network: 2, planType: "CORPORATE GIFTING", amount: 135, size: "200.0 MB", validity: "1 month" },
  { id: 476, network: 2, planType: "CORPORATE GIFTING", amount: 355, size: "1.0 GB", validity: "1 month" },
  { id: 480, network: 2, planType: "CORPORATE GIFTING", amount: 320, size: "1.0 GB", validity: "1 month" },
  { id: 517, network: 2, planType: "CORPORATE GIFTING", amount: 1050, size: "3.0 GB", validity: "1 month" },
  { id: 518, network: 2, planType: "CORPORATE GIFTING", amount: 1600, size: "5.0 GB", validity: "1 month" },

  // ======================================================
  // 9MOBILE (3)
  // ======================================================

  // 9MOBILE — CORPORATE GIFTING
  { id: 280, network: 3, planType: "CORPORATE GIFTING", amount: 550, size: "1.0 GB", validity: "1 month" },
  { id: 281, network: 3, planType: "CORPORATE GIFTING", amount: 1050, size: "2.0 GB", validity: "1 month" },
  { id: 282, network: 3, planType: "CORPORATE GIFTING", amount: 1600, size: "3.0 GB", validity: "1 month" },
  { id: 283, network: 3, planType: "CORPORATE GIFTING", amount: 2450, size: "5.0 GB", validity: "1 month" },
  { id: 284, network: 3, planType: "CORPORATE GIFTING", amount: 300, size: "500.0 MB", validity: "1 month" },
  { id: 285, network: 3, planType: "CORPORATE GIFTING", amount: 4900, size: "10.0 GB", validity: "1 month" },
  { id: 287, network: 3, planType: "CORPORATE GIFTING", amount: 2100, size: "4.0 GB", validity: "1 month" },
]

/**
 * Flat list by network (already includes sellAmount + networkName)
 * Sorted by your requested planType order, then by sellAmount asc.
 */
export function getPlans(networkId: UsufNetwork): UsufPlanWithSelling[] {
  return USUF_DATA_PLANS.filter((p) => p.network === networkId)
    .map((p) => ({
      ...p,
      sellAmount: sellingPrice(p),
      networkName: USUF_NETWORKS[p.network],
    }))
    .sort((a, b) => {
      const ra = planTypeRank(a.planType)
      const rb = planTypeRank(b.planType)
      if (ra !== rb) return ra - rb
      if (a.sellAmount !== b.sellAmount) return a.sellAmount - b.sellAmount
      return a.id - b.id
    })
}

/**
 * Grouped version for UI sections/tabs (AWOOF → SME → SME2 → DATA COUPONS → GIFTING → CORPORATE)
 */
export function getPlansGrouped(networkId: UsufNetwork): {
  networkId: UsufNetwork
  networkName: string
  groups: Array<{ planType: string; plans: UsufPlanWithSelling[] }>
} {
  const list = getPlans(networkId)

  const map = new Map<string, UsufPlanWithSelling[]>()
  for (const p of list) {
    const key = p.planType
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(p)
  }

  const orderedKeys = Array.from(map.keys()).sort((a, b) => planTypeRank(a) - planTypeRank(b))

  return {
    networkId,
    networkName: USUF_NETWORKS[networkId],
    groups: orderedKeys.map((k) => ({
      planType: k,
      plans: map.get(k)!.sort((a, b) => a.sellAmount - b.sellAmount || a.id - b.id),
    })),
  }
}

// Optional: validate a plan selection by Data ID
export function getPlanById(planId: number): UsufPlanWithSelling | null {
  const p = USUF_DATA_PLANS.find((x) => x.id === planId)
  if (!p) return null
  return { ...p, sellAmount: sellingPrice(p), networkName: USUF_NETWORKS[p.network] }
}
