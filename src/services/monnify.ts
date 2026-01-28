const BASE = process.env.MONNIFY_BASE_URL!
const API_KEY = process.env.MONNIFY_API_KEY!
const SECRET = process.env.MONNIFY_SECRET_KEY!

let cachedToken: { token: string; expiresAt: number } | null = null

async function getAuthToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token
  }

  const auth = Buffer.from(`${API_KEY}:${SECRET}`).toString('base64')

  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  })

  const json = await res.json()

  if (!res.ok) {
    throw new Error(`Monnify auth failed: ${JSON.stringify(json)}`)
  }

  cachedToken = {
    token: json.responseBody.accessToken,
    expiresAt: Date.now() + json.responseBody.expiresIn * 1000,
  }

  return cachedToken.token
}

export async function verifyTransaction(reference: string) {
  const token = await getAuthToken()

  const contractCode = process.env.MONNIFY_CONTRACT_CODE || process.env.NEXT_PUBLIC_MONNIFY_CONTRACT_CODE || undefined

  async function queryUrl(url: string, method: string = 'GET') {
    console.log(`Monnify query: ${method} ${url}`)
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    const json = await res.json().catch(() => ({}))
    console.log(`Monnify response: ${res.status}`, JSON.stringify(json).substring(0, 500))
    return { res, json }
  }

  // Helper to retry with backoff in case of sync delay
  async function tryWithRetry(attemptFn: () => Promise<{ res: Response; json: Record<string, unknown> }>, maxAttempts: number = 3) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const result = await attemptFn()
      if (result.res.ok && result.json?.requestSuccessful) {
        return result.json
      }
      if (attempt < maxAttempts - 1) {
        // Wait before retrying (100ms * attempt) to allow Monnify to sync
        const delayMs = 100 * (attempt + 1)
        console.log(`Monnify query failed, retrying in ${delayMs}ms...`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
    return null
  }

  // Strategy 1: Try SDK transactions endpoint with contract code
  if (contractCode) {
    console.log(`Trying SDK endpoint with contract code: ${contractCode}`)
    const result = await tryWithRetry(async () => {
      const url = `${BASE}/api/v1/sdk/transactions/query/${contractCode}?transactionReference=${encodeURIComponent(reference)}&shouldIncludePaymentSessionInfo=false`
      return queryUrl(url)
    })
    if (result) return result
  }

  // Strategy 2: Try merchant transactions endpoint
  console.log(`Trying merchant transactions endpoint`)
  const merchantResult = await tryWithRetry(async () => {
    const url = `${BASE}/api/v1/merchant/transactions?pageSize=20&pageNo=0`
    const attempt = await queryUrl(url)
    if (attempt.res.ok && attempt.json?.requestSuccessful) {
      const transactions = attempt.json?.responseBody?.transactions || []
      const found = transactions.find((t: { transactionReference: string }) => t.transactionReference === reference)
      if (found) {
        return { res: attempt.res, json: { requestSuccessful: true, responseBody: found } }
      }
    }
    return attempt
  })
  if (merchantResult) return merchantResult

  // Strategy 3: Try direct transaction query endpoints
  console.log(`Trying direct transaction query endpoints`)
  const directResult = await tryWithRetry(async () => {
    const url = `${BASE}/api/v1/transactions/query?transactionReference=${encodeURIComponent(reference)}`
    return queryUrl(url)
  })
  if (directResult) return directResult

  // Log all failed attempts
  console.error(`All Monnify verification attempts failed for reference: ${reference}`)
  const lastUrl = `${BASE}/api/v1/transactions/query?transactionReference=${encodeURIComponent(reference)}`
  const last = await queryUrl(lastUrl)
  throw new Error(`Monnify verify failed: ${JSON.stringify({ status: last.res.status, body: last.json })}`)
}

export async function initiateTransaction(payload: Record<string, unknown>) {
  const token = await getAuthToken()

  const res = await fetch(`${BASE}/api/v1/sdk/transactions/init-transaction`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const json = await res.json()

  if (!res.ok) {
    throw new Error(`Monnify initiate failed: ${JSON.stringify(json)}`)
  }

  return json
}

export default { verifyTransaction, initiateTransaction }