import * as api from './serviceApi'
import { generateRequestId } from './utils'

export async function getTVCategories() {
  try {
    const services = await api.getServicesForCategory('tv-subscription')
    if (Array.isArray(services) && services.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return services.map((s: any) => ({ id: s.serviceID || s.code || s.id, name: s.name || s.title }))
    }
  } catch {
    // ignore
  }

  return [
    { id: 'gotv', name: 'GOtv' },
    { id: 'dstv', name: 'DStv' },
    { id: 'startimes', name: 'Startimes' },
  ]
}

export async function validateSmartcard({ card, serviceID }: { card: string; serviceID: string }) {
  const res = await api.merchantVerify({ billersCode: card, serviceID })
  return res
}

export async function purchaseTV({ request_id, serviceID, variation_code, amount, billersCode, subscription_type }: { request_id?: string; serviceID: string; variation_code?: string; amount?: number | string; billersCode: string; subscription_type?: string }) {
  const req = request_id || generateRequestId(String(Math.floor(Math.random() * 1000000)))
  const payload: Record<string, unknown> = { request_id: req, serviceID, billersCode }
  if (variation_code) payload.variation_code = variation_code
  if (amount) payload.amount = String(amount)
  if (subscription_type) payload.subscription_type = subscription_type
  const res = await api.pay(payload)
  return res
}

const VtpassTV = { getTVCategories, validateSmartcard, purchaseTV }
export default VtpassTV
