export const SERVICE_CHARGE = 50

export function applyMarkup(amount: number | string) {
  const n = Number(amount) || 0
  return n + SERVICE_CHARGE
}

export function formatCurrency(n: number) {
  return n.toLocaleString()
}

/**
 * Generates a VTpass-compatible request_id. Must be at least 12 chars where
 * the first 12 are YYYYMMDDHHMM in Africa/Lagos timezone (GMT+1).
 * You can append an optional suffix to guarantee uniqueness.
 */
export function generateRequestId(suffix = ''): string {
  const now = new Date()
  // Convert to UTC milliseconds then add +1 hour for Lagos (no DST)
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000)
  const lagos = new Date(utc + 3600 * 1000)
  const Y = lagos.getFullYear()
  const M = String(lagos.getMonth() + 1).padStart(2, '0')
  const D = String(lagos.getDate()).padStart(2, '0')
  const hh = String(lagos.getHours()).padStart(2, '0')
  const mm = String(lagos.getMinutes()).padStart(2, '0')
  const base = `${Y}${M}${D}${hh}${mm}` // 12 chars
  return `${base}${suffix}`
}

// Friendly labels for merchant-verify responses (VTpass uses inconsistent keys)
const VERIFY_LABELS: Record<string, string> = {
  // common
  Customer_Name: 'Name',
  customerName: 'Name',
  name: 'Name',
  Full_Name: 'Name',
  fullName: 'Name',

  // account / meter
  Account_Number: 'Account Number',
  Meter_Number: 'Meter Number',
  Customer_Number: 'Account / Meter',

  // meter type
  Meter_Type: 'Meter Type',
  Customer_Type: 'Customer Type',

  // amounts
  Minimum_Amount: 'Min Purchase',
  Min_Purchase_Amount: 'Min Purchase',
  Renewal_Amount: 'Renewal Amount',
  Amount: 'Amount',

  // location / district
  Customer_District: 'District',
  Customer_District_Reference: 'District',

  // generic
  Due_Date: 'Due Date',
  email: 'Email',
  phone: 'Phone',
  msisdn: 'Phone',
  accountName: 'Account Name',
}

/**
 * Format a merchant-verify response into an ordered array of label/value pairs.
 * preferredKeys (optional) will be displayed first in order if present.
 */
export function formatVerifyResult(result: Record<string, unknown> | null | undefined, preferredKeys: string[] = []) {
  if (!result) return [] as Array<{ label: string; value: string }>
  const out: Array<{ label: string; value: string }> = []

  const seen = new Set<string>()
  for (const k of preferredKeys) {
    if (k in result) {
      const v = result[k]
      out.push({ label: VERIFY_LABELS[k] || humanizeKey(k), value: String(v ?? '') })
      seen.add(k)
    }
  }

  // then add any remaining known keys in a stable order
  const keys = Object.keys(result)
  for (const k of keys) {
    if (seen.has(k)) continue
    const v = result[k]
    if (v === null || v === undefined || String(v) === '') continue
    const label = VERIFY_LABELS[k] || humanizeKey(k)
    out.push({ label, value: String(v) })
  }

  return out
}

function humanizeKey(k: string) {
  return k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (m) => m.toUpperCase())
}
