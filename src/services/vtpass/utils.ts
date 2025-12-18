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
    if (v === null || v === undefined) continue
    const str = stringifyVerifyValue(v)
    if (str === '') continue
    const label = VERIFY_LABELS[k] || humanizeKey(k)
    out.push({ label, value: str })
  }

  return out
}

/**
 * Try to extract a sensible phone number from a merchant-verify result.
 */
export function extractPhoneFromVerifyResult(result: Record<string, unknown> | null | undefined): string | null {
  if (!result) return null
  // First pass: return any value whose key explicitly indicates phone-like data
  const phoneKeys = ['phone', 'msisdn', 'mobile', 'telephone', 'customer_phone']
  const seen = new Set<unknown>()

  function searchByKey(obj: unknown): string | null {
    if (obj === null || obj === undefined) return null
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const r = searchByKey(item)
        if (r) return r
      }
      return null
    }
    if (typeof obj === 'object') {
      if (seen.has(obj)) return null
      seen.add(obj)
      for (const k of Object.keys(obj as Record<string, unknown>)) {
        const lower = k.toLowerCase()
        for (const pk of phoneKeys) {
          if (lower.includes(pk)) {
            const v = (obj as Record<string, unknown>)[k]
            if (v !== null && v !== undefined) {
              const s = String(v).trim()
              // basic phone sanity check
              if (/^\+?\d{7,15}$/.test(s)) return s
              return s
            }
          }
        }
        const r = searchByKey((obj as Record<string, unknown>)[k])
        if (r) return r
      }
    }
    return null
  }

  const byKey = searchByKey(result)
  if (byKey) return byKey

  // No explicit phone keys found — don't guess from arbitrary numeric fields (meter numbers can be numeric).
  return null
}

function stringifyVerifyValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    // Limit depth by stringifying shallowly: if it's an object with primitive props, show them; otherwise JSON.stringify
    if (typeof v === 'object') {
      const obj = v as Record<string, unknown>
      const simple: Record<string, unknown> = {}
      let count = 0
      for (const k of Object.keys(obj)) {
        const val = obj[k]
        if (val === null || val === undefined) continue
        if (typeof val === 'object') {
          simple[k] = JSON.stringify(val)
        } else {
          simple[k] = val
        }
        count++
        if (count >= 6) break
      }
      return Object.keys(simple).length ? JSON.stringify(simple) : JSON.stringify(v)
    }
    return String(v)
  } catch (e) {
    return String(v)
  }
}

function humanizeKey(k: string) {
  return k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (m) => m.toUpperCase())
}

/**
 * Filter verify result to only include fields relevant to a specific service.
 * Pass an array of preferred key names (case-sensitive) for that service.
 */
export function filterVerifyResultByService(
  result: Record<string, unknown> | null | undefined,
  serviceKeys: string[]
): Record<string, unknown> {
  if (!result) return {}
  const filtered: Record<string, unknown> = {}
  for (const k of serviceKeys) {
    if (k in result) filtered[k] = result[k]
  }
  return filtered
}
