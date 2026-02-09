const BASE = process.env.MONNIFY_BASE_URL!
const API_KEY = process.env.MONNIFY_API_KEY!
const SECRET = process.env.MONNIFY_SECRET_KEY!
const MONNIFY_WALLET_ACCOUNT = process.env.MONNIFY_WALLET_ACCOUNT_NUMBER!

// Bank code mappings for Nigerian banks (Monnify format)
const BANK_CODE_MAP: Record<string, string> = {
  '007': 'Zenith Bank',
  '009': 'FCMB',
  '011': 'First Bank',
  '012': 'UBA',
  '014': 'GTBank',
  '015': 'Eco Bank',
  '019': 'Guaranty Trust Bank',
  '020': 'Stanbic IBTC',
  '021': 'Diamond Bank',
  '022': 'Access Bank',
  '023': 'Citibank',
  '024': 'Fidelity Bank',
  '025': 'Union Bank',
  '026': 'Wema Bank',
  '027': 'Sterling Bank',
  '028': 'Skye Bank',
  '030': 'IBTC',
  '031': 'Polaris Bank',
  '032': 'Providus Bank',
  '033': 'Unity Bank',
  '035': 'Wema Bank',
  '036': 'Suntrust Bank',
  '037': 'VFD',
  '039': 'Titan Trust Bank',
  '040': 'Apex Mortgage Bank',
  '041': 'Abbey Mortgage Bank',
  '042': 'Kaiyum Microfinance',
  '050': 'Ecobank',
  '051': 'Ecobank',
  '052': 'Ecobank',
  '053': 'Bank of Industry',
  '054': 'Bank of Agriculture',
  '055': 'Bank of The North',
  '056': 'Guaranty Trust Bank',
  '057': 'Zenith Bank',
  '058': 'FCMB',
  '059': 'Keystone Bank',
  '060': 'Providus Bank',
  '061': 'First City Monument Bank',
  '062': 'Primenext',
  '063': 'Stanbic IBTC',
  '064': 'Stanbic IBTC',
  '065': 'Union Bank',
  '066': 'Union Bank',
  '067': 'Access Bank',
  '068': 'Access Bank',
  '069': 'Access Bank',
  '070': 'Fidelity Bank',
  '071': 'Fidelity Bank',
  '072': 'Fidelity Bank',
  '073': 'GTCO',
  '074': 'Polaris Bank',
  '075': 'Zenith Bank',
  '076': 'Zenith Bank',
  '077': 'First Bank',
  '078': 'First Bank',
  '079': 'First Bank',
  '080': 'First Bank',
  '081': 'First Bank',
  '082': 'First Bank',
  '083': 'UBA',
  '084': 'UBA',
  '085': 'UBA',
  '086': 'UBA',
  '087': 'UBA',
  '088': 'UBA',
  '089': 'UBA',
  '090': 'GTBank',
  '091': 'GTBank',
  '092': 'GTBank',
  '093': 'GTBank',
  '094': 'GTBank',
  '095': 'GTBank',
}

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

export async function refundTransaction({ transactionRef, amountKobo, reason }: { transactionRef: string; amountKobo?: number; reason?: string }) {
  const token = await getAuthToken()

  const body: Record<string, unknown> = {
    transactionReference: transactionRef,
    reason: reason || 'Bill payment service failed - automatic refund',
  }
  if (amountKobo) {
    body.amount = amountKobo / 100 // Monnify uses Naira, not kobo
  }

  const res = await fetch(`${BASE}/api/v1/transactions/refunds`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })

  const json = await res.json()

  if (!res.ok) {
    throw new Error(`Monnify refund failed: ${JSON.stringify(json)}`)
  }

  return json
}

export async function initiateDisbursement({
  amount,
  reference,
  narration,
  destinationBankCode,
  destinationAccountNumber,
  accountName,
}: {
  amount: number // In Naira
  reference: string // Unique reference ID
  narration: string // Description
  destinationBankCode: string // 3-digit bank code
  destinationAccountNumber: string
  accountName?: string
}) {
  const token = await getAuthToken()

  const body = {
    amount,
    reference,
    narration,
    destinationBankCode,
    destinationAccountNumber,
    currency: 'NGN',
    sourceAccountNumber: MONNIFY_WALLET_ACCOUNT,
  }

  const res = await fetch(`${BASE}/api/v2/disbursements/single`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })

  const json = await res.json()

  console.log(`Monnify disbursement response: ${res.status}`, JSON.stringify(json).substring(0, 500))

  if (!res.ok || !json.requestSuccessful) {
    throw new Error(`Monnify disbursement failed: ${JSON.stringify(json)}`)
  }

  return json.responseBody
}

export async function checkDisbursementStatus(reference: string) {
  const token = await getAuthToken()

  const res = await fetch(`${BASE}/api/v2/disbursements/single/summary?reference=${encodeURIComponent(reference)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  })

  const json = await res.json()

  console.log(`Monnify disbursement status: ${res.status}`, JSON.stringify(json).substring(0, 500))

  if (!res.ok) {
    throw new Error(`Monnify status check failed: ${JSON.stringify(json)}`)
  }

  return json.responseBody || json
}

export default { verifyTransaction, initiateTransaction, refundTransaction, initiateDisbursement, checkDisbursementStatus }