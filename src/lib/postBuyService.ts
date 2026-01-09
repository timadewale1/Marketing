export async function postBuyService(payload: Record<string, unknown>, options?: { idToken?: string }) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options?.idToken) headers['Authorization'] = `Bearer ${options.idToken}`
  const res = await fetch('/api/bills/buy-service', { method: 'POST', headers, body: JSON.stringify(payload) })
  let body = null
  try { body = await res.json() } catch (e) { body = null }
  return { ok: res.ok && body?.ok, status: res.status, body, raw: res }
}

export default postBuyService
