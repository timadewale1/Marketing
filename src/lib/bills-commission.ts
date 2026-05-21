type CommissionMode = 'percentage' | 'fixed'

type CommissionRule = {
  label: string
  mode: CommissionMode
  value: number
  cap?: number
}

const RULES: Array<{ match: RegExp; rule: CommissionRule }> = [
  { match: /waec/i, rule: { label: 'WAEC Result Checker PIN', mode: 'fixed', value: 250 } },
  { match: /jamb/i, rule: { label: 'Govt Payment', mode: 'percentage', value: 0.015 } },
  { match: /data/i, rule: { label: 'Data', mode: 'percentage', value: 0.03 } },
  { match: /airtime/i, rule: { label: 'Airtime', mode: 'percentage', value: 0.03 } },
  { match: /mtn/i, rule: { label: 'MTN', mode: 'percentage', value: 0.03 } },
  { match: /airtel/i, rule: { label: 'Airtel', mode: 'percentage', value: 0.034 } },
  { match: /glo/i, rule: { label: 'GLO', mode: 'percentage', value: 0.04 } },
  { match: /9mobile|t2/i, rule: { label: '9mobile', mode: 'percentage', value: 0.04 } },
  { match: /smile/i, rule: { label: 'Smile', mode: 'percentage', value: 0.05 } },
  { match: /electric|power|abedc|aedc|bedc|ekedc|eedc|ibedc|ikedc|jed|kaedco|kedco|phed|yedc/i, rule: { label: 'Electricity', mode: 'percentage', value: 0.011, cap: 1500 } },
  { match: /dstv|startime|startimes/i, rule: { label: 'TV Subscription', mode: 'percentage', value: 0.02 } },
  { match: /insurance|ui-insure/i, rule: { label: 'Insurance', mode: 'percentage', value: 0.02 } },
]

export type BillsCommissionResult = {
  label: string
  rate: number
  profit: number
  cap?: number
}

export function getBillsServiceLabel(serviceID: string, fallback?: string) {
  const normalized = String(serviceID || '').trim()
  for (const { match, rule } of RULES) {
    if (match.test(normalized)) return rule.label
  }
  return fallback || normalized || 'Bills purchase'
}

export function getBillsCommission(serviceID: string, amount: number, serviceLabel?: string): BillsCommissionResult {
  const normalized = `${serviceID || ''} ${serviceLabel || ''}`.trim()
  const rule = RULES.find((entry) => entry.match.test(normalized))?.rule || {
    label: 'Bills purchase',
    mode: 'percentage' as const,
    value: 0.02,
  }

  let profit = 0
  if (rule.mode === 'fixed') {
    profit = rule.value
  } else {
    profit = amount * rule.value
  }

  if (rule.cap) {
    profit = Math.min(profit, rule.cap)
  }

  return {
    label: rule.label,
    rate: rule.value,
    profit: Math.max(0, Math.round(profit)),
    cap: rule.cap,
  }
}
