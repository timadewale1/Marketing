import * as api from './serviceApi'
import { generateRequestId } from './utils'

// Education services: WAEC (serviceID=waec) and JAMB (serviceID=jamb)

export async function getWaecVariations() {
  try {
    const vars = await api.getVariations('waec')
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
  const payload: Record<string, unknown> = { request_id: req, serviceID: 'waec', variation_code }
  if (quantity) payload.quantity = quantity
  if (phone) payload.phone = phone
  const res = await api.pay(payload)
  return res
}

export async function getJambVariations() {
  try {
    const vars = await api.getVariations('jamb')
    if (Array.isArray(vars) && vars.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return vars.map((v: any) => ({ code: v.variation_code || v.code, name: v.name, amount: Number(v.variation_amount || v.amount || 0) }))
    }
  } catch {
    // ignore
  }
  return []
}

export async function verifyJambProfile({ profileId }: { profileId: string }) {
  const res = await api.merchantVerify({ billersCode: profileId, serviceID: 'jamb', type: 'profile' })
  return res
}

export async function purchaseJamb({ request_id, variation_code, billersCode, amount, phone }: { request_id?: string; variation_code: string; billersCode: string; amount?: number | string; phone?: string }) {
  const req = request_id || generateRequestId(String(Math.floor(Math.random() * 1000000)))
  const payload: Record<string, unknown> = { request_id: req, serviceID: 'jamb', variation_code, billersCode }
  if (amount) payload.amount = String(amount)
  if (phone) payload.phone = phone
  const res = await api.pay(payload)
  return res
}

const VtpassEducation = { getWaecVariations, purchaseWaec, getJambVariations, verifyJambProfile, purchaseJamb }
export default VtpassEducation
