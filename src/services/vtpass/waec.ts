import * as api from './serviceApi'
import { generateRequestId } from './utils'

export async function getWaecVariations() {
  try {
    const vars = await api.getVariations('waec-registration')
    if (Array.isArray(vars) && vars.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return vars.map((v: any) => ({ code: v.variation_code || v.code, name: v.name, amount: Number(v.variation_amount || v.amount || 0) }))
    }
  } catch {
    // ignore
  }
  return []
}

export async function purchaseWaec({ request_id, variation_code, quantity, phone }: { request_id?: string; variation_code: string; quantity?: number; phone?: string }) {
  const req = request_id || generateRequestId(String(Math.floor(Math.random() * 1000000)))
  const payload: Record<string, unknown> = { request_id: req, serviceID: 'waec-registration', variation_code }
  if (quantity) payload.quantity = quantity
  if (phone) payload.phone = phone
  const res = await api.pay(payload)
  return res
}

const VtpassWaec = { getWaecVariations, purchaseWaec }
export default VtpassWaec
