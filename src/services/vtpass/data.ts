import * as api from './serviceApi'
import { generateRequestId } from './utils'

export async function getDataPlans(serviceID: string) {
  try {
    const variations = await api.getVariations(serviceID)
    if (Array.isArray(variations) && variations.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return variations.map((v: any) => ({ code: v.variation_code || v.code || v.id, name: v.name, amount: Number(v.variation_amount || v.amount || 0) }))
    }
  } catch {
    // ignore
  }

  return [
    { code: `${serviceID}_500MB`, name: '500MB', amount: 1000 },
    { code: `${serviceID}_1GB`, name: '1GB', amount: 2000 },
  ]
}

export async function purchaseData({ request_id, serviceID, variation_code, amount, phone }: { request_id?: string; serviceID: string; variation_code?: string; amount?: number | string; phone?: string }) {
  const req = request_id || generateRequestId(String(Math.floor(Math.random() * 1000000)))
  const payload: Record<string, unknown> = { request_id: req, serviceID }
  if (variation_code) payload.variation_code = variation_code
  if (amount) payload.amount = String(amount)
  if (phone) payload.phone = phone
  const res = await api.pay(payload)
  return res
}

const VtpassData = { getDataPlans, purchaseData }
export default VtpassData
