import * as api from './serviceApi'
import { generateRequestId } from './utils'

export async function getAirtimeNetworks() {
  try {
    const services = await api.getServicesForCategory('airtime')
    if (Array.isArray(services) && services.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return services.map((s: any) => ({ id: s.serviceID || s.code || s.id, name: s.name || s.title }))
    }
  } catch {
    // ignore
  }

  return [
    { id: 'mtn', name: 'MTN' },
    { id: 'glo', name: 'Glo' },
    { id: 'airtel', name: 'Airtel' },
    { id: '9mobile', name: '9mobile' },
  ]
}

export async function purchaseAirtime({ request_id, serviceID, amount, phone }: { request_id?: string; serviceID: string; amount: number | string; phone: string }) {
  const req = request_id || generateRequestId(String(Math.floor(Math.random() * 1000000)))
  const payload = { request_id: req, serviceID, amount: String(amount), phone }
  const res = await api.pay(payload)
  return res
}

const VtpassAirtime = { getAirtimeNetworks, purchaseAirtime }
export default VtpassAirtime
