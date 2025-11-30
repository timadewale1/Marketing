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
  const res = await vtpassClient.get(`/service-variations?serviceID=${encodeURIComponent(serviceID)}`)
  // content may be an object with .variations
  const content = res?.data?.content || res?.data
  if (content?.variations) return content.variations
  if (Array.isArray(content)) return content
  return []
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
