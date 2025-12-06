import vtpassClient from './client'

// Lightweight wrapper around common VTpass endpoints used across services

export async function getServiceCategories() {
  const res = await vtpassClient.get('/service-categories')
  return res?.data?.content || []
}

export async function getServicesForCategory(identifier: string) {
  const res = await vtpassClient.get(`/services?identifier=${encodeURIComponent(identifier)}`)
  return res?.data?.content || []
}

export async function getVariations(serviceID: string) {
  // Sometimes VTpass sandbox can drop connections; retry a few times before failing
  const maxAttempts = 3
  let attempt = 0
  let lastErr: unknown = null

  while (attempt < maxAttempts) {
    try {
      const res = await vtpassClient.get(`/service-variations?serviceID=${encodeURIComponent(serviceID)}`)
      const content = res?.data?.content || res?.data
      if (content?.variations) return content.variations
      if (Array.isArray(content)) return content
      return []
    } catch (err) {
      // record and retry with backoff for transient network errors
      lastErr = err
      attempt += 1
      const backoff = 300 * Math.pow(2, attempt) // 600ms, 1200ms, ...
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, backoff))
    }
  }

  // after retries, surface the last error
  throw lastErr
}

export async function getOptions(serviceID: string, name: string) {
  const res = await vtpassClient.get(`/options?serviceID=${encodeURIComponent(serviceID)}&name=${encodeURIComponent(name)}`)
  return res?.data?.content || []
}

export async function merchantVerify(payload: Record<string, unknown>) {
  const res = await vtpassClient.post('/merchant-verify', payload)
  return res?.data
}

export async function pay(payload: Record<string, unknown>) {
  const res = await vtpassClient.post('/pay', payload)
  return res?.data
}

export async function requery(request_id: string) {
  const res = await vtpassClient.post('/requery', { request_id })
  return res?.data
}

export default {
  getServiceCategories,
  getServicesForCategory,
  getVariations,
  getOptions,
  merchantVerify,
  pay,
  requery,
}
