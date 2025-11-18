import { initFirebaseAdmin } from './firebaseAdmin'

const DEFAULT_BASE = process.env.DATAWAY_BASE_URL || 'https://sandbox.datawayapp.com/vendor/'
const PUB = process.env.DATAWAY_PUBLIC_KEY || 'PUBK_Fpx5C2rIVMw8AR9ltfWhls3UO'
const PRV = process.env.DATAWAY_PRIVATE_KEY || 'PRVK_zXiGBQ7ORPtKWLCYLDFwxtLnO'

function baseUrl() {
  return (process.env.DATAWAY_BASE_URL || DEFAULT_BASE).replace(/\/$/, '') + '/'
}

async function saveTransaction(collection: string, payload: Record<string, unknown>) {
  try {
    const { dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin) return null
    const doc = await dbAdmin.collection(collection).add({ ...payload, createdAt: new Date().toISOString() })
    return doc.id
  } catch (err) {
    console.warn('Failed to save transaction', err)
    return null
  }
}

export async function callVend(body: Record<string, unknown>) {
  const url = baseUrl() + 'vend'
  const params = new URLSearchParams()
  params.append('api_public_key', process.env.DATAWAY_PUBLIC_KEY || PUB)
  params.append('api_private_key', process.env.DATAWAY_PRIVATE_KEY || PRV)

  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue
    params.append(k, String(v))
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const text = await res.text()
  let json: unknown = null
  try { json = JSON.parse(text) } catch { json = text }

  // Save to firestore collection
  const savedId = await saveTransaction('dataway_transactions', { type: 'vend', request: body, response: json, statusCode: res.status })
  return { status: res.status, body: json, savedId }
}

export async function callQuery(reference: string) {
  const url = baseUrl() + 'query-transaction'
  const params = new URLSearchParams()
  params.append('api_public_key', process.env.DATAWAY_PUBLIC_KEY || PUB)
  params.append('api_private_key', process.env.DATAWAY_PRIVATE_KEY || PRV)
  params.append('reference', reference)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const text = await res.text()
  let json: unknown = null
  try { json = JSON.parse(text) } catch { json = text }
  const savedId = await saveTransaction('dataway_transactions', { type: 'query', request: { reference }, response: json, statusCode: res.status })
  return { status: res.status, body: json, savedId }
}

export async function callBalance() {
  const url = baseUrl() + 'balance'
  const params = new URLSearchParams()
  params.append('api_public_key', process.env.DATAWAY_PUBLIC_KEY || PUB)
  params.append('api_private_key', process.env.DATAWAY_PRIVATE_KEY || PRV)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const text = await res.text()
  let json: unknown = null
  try { json = JSON.parse(text) } catch { json = text }
  const savedId = await saveTransaction('dataway_transactions', { type: 'balance', request: {}, response: json, statusCode: res.status })
  return { status: res.status, body: json, savedId }
}

export async function getCategories() {
  const url = baseUrl() + 'get-service-categories'
  const res = await fetch(url, { method: 'GET' })
  const text = await res.text()
  let json: unknown = null
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json }
}

export async function getServices(slug: string) {
  const url = baseUrl() + `get-services?slug=${encodeURIComponent(slug)}`
  const res = await fetch(url, { method: 'GET' })
  const text = await res.text()
  let json: unknown = null
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json }
}

export async function getServiceVariations(service_slug: string) {
  const url = baseUrl() + `get-service-variations?service_slug=${encodeURIComponent(service_slug)}`
  const res = await fetch(url, { method: 'GET' })
  const text = await res.text()
  let json: unknown = null
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json }
}

export async function validateBiller(payload: Record<string, unknown>) {
  const url = baseUrl() + 'validate-biller'
  const params = new URLSearchParams()
  params.append('api_public_key', process.env.DATAWAY_PUBLIC_KEY || PUB)
  params.append('api_private_key', process.env.DATAWAY_PRIVATE_KEY || PRV)
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || v === null) continue
    params.append(k, String(v))
  }
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() })
  const text = await res.text()
  let json: unknown = null
  try { json = JSON.parse(text) } catch { json = text }
  // Save validate response
  await saveTransaction('dataway_transactions', { type: 'validate', request: payload, response: json, statusCode: res.status })
  return { status: res.status, body: json }
}

const api = { callVend, callQuery, callBalance }
export default api
