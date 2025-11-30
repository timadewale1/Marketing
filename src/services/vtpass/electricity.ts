import * as api from './serviceApi'
import { generateRequestId } from './utils'

export async function getDiscos() {
  try {
    // services endpoint with identifier 'electricity-bill' should list providers
    const services = await api.getServicesForCategory('electricity-bill')
    if (Array.isArray(services) && services.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return services.map((s: any) => ({ id: s.serviceID || s.code || s.id, name: s.name || s.title }))
    }
  } catch {
    // ignore
  }

  return [
    { id: 'ikeja-electric', name: 'Ikeja Electric' },
    { id: 'eko-electric', name: 'Eko Electric' },
  ]
}

export async function validateMeter({ meter, serviceID, type }: { meter: string; serviceID: string; type?: string }) {
  const payload: Record<string, unknown> = { billersCode: meter, serviceID }
  if (type) payload.type = type
  const res = await api.merchantVerify(payload)
  return res
}

export async function purchaseElectricity({ request_id, serviceID, amount, billersCode, variation_code }: { request_id?: string; serviceID: string; amount: number | string; billersCode: string; variation_code?: string }) {
  const req = request_id || generateRequestId(String(Math.floor(Math.random() * 1000000)))
  const payload: Record<string, unknown> = { request_id: req, serviceID, billersCode, amount: String(amount) }
  if (variation_code) payload.variation_code = variation_code
  const res = await api.pay(payload)
  return res
}

const VtpassElectricity = { getDiscos, validateMeter, purchaseElectricity }
export default VtpassElectricity
