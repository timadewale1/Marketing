import { extractMonnifyReferenceCandidates } from '@/lib/monnify-reference'

const BASE = process.env.MONNIFY_BASE_URL!
const API_KEY = process.env.MONNIFY_API_KEY!
const SECRET = process.env.MONNIFY_SECRET_KEY!
const MONNIFY_WALLET_ACCOUNT = process.env.MONNIFY_WALLET_ACCOUNT_NUMBER!

// Bank code mappings for Nigerian banks (Monnify format)
export const BANK_CODE_MAP: Record<string, string> = {
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

async function retryRequest<T>(fn: () => Promise<T>, maxAttempts: number = 3, baseDelayMs: number = 250): Promise<T> {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt >= maxAttempts) break
      const delayMs = baseDelayMs * attempt
      console.warn(`Monnify request attempt ${attempt} failed, retrying in ${delayMs}ms`, err)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw lastError
}

type MonnifyAuthResponse = {
  requestSuccessful?: boolean
  responseBody?: {
    accessToken?: string
    expiresIn?: number
  }
}

type MonnifyTransactionRecord = Record<string, unknown>
type MonnifyApiEnvelope<T = Record<string, unknown>> = {
  requestSuccessful?: boolean
  responseBody?: T
  responseMessage?: string
  responseCode?: string
}

function normalizeMonnifyAmount(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

function parseMonnifyDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) return parsed

  const normalized = value.replace(' ', 'T')
  const retry = new Date(normalized)
  return Number.isNaN(retry.getTime()) ? null : retry
}

function isSuccessfulMonnifyTransaction(transaction: MonnifyTransactionRecord) {
  const status = String(transaction.paymentStatus || transaction.status || '').toUpperCase()
  return status === 'PAID' || status === 'SUCCESS' || status === 'SUCCESSFUL'
}

function getMonnifyTransactionEmail(transaction: MonnifyTransactionRecord) {
  const customer = transaction.customer
  if (!customer || typeof customer !== 'object') return ''
  return String((customer as Record<string, unknown>).email || '').trim().toLowerCase()
}

function getMonnifyTransactionAmount(transaction: MonnifyTransactionRecord) {
  return normalizeMonnifyAmount(
    transaction.amountPaid ??
    transaction.amount ??
    transaction.totalPayable ??
    transaction.payableAmount
  )
}

function getMonnifyTransactionDate(transaction: MonnifyTransactionRecord) {
  return (
    parseMonnifyDate(transaction.paidOn) ||
    parseMonnifyDate(transaction.completedOn) ||
    parseMonnifyDate(transaction.createdOn)
  )
}

async function getAuthToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token
  }

  const auth = Buffer.from(`${API_KEY}:${SECRET}`).toString('base64')

  const response = await retryRequest<MonnifyAuthResponse>(async () => {
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
    })

    let json: unknown
    try {
      json = await res.json()
    } catch (err) {
      throw new Error(`Monnify auth response JSON parse failed: ${err}`)
    }

    if (!res.ok) {
      throw new Error(`Monnify auth failed: ${JSON.stringify(json)}`)
    }

    return json as MonnifyAuthResponse
  })

  const token = response.responseBody?.accessToken
  const expiresIn = response.responseBody?.expiresIn ?? 0

  if (!token) {
    throw new Error('Monnify auth failed: missing accessToken')
  }

  cachedToken = {
    token,
    expiresAt: Date.now() + expiresIn * 1000,
  }

  return cachedToken.token
}

async function getBasicAuthHeader() {
  const auth = Buffer.from(`${API_KEY}:${SECRET}`).toString('base64')
  return `Basic ${auth}`
}

async function monnifyGet<T = Record<string, unknown>>(
  path: string,
  {
    authMode = 'bearer',
  }: {
    authMode?: 'bearer' | 'basic'
  } = {}
) {
  const authorization = authMode === 'basic'
    ? await getBasicAuthHeader()
    : `Bearer ${await getAuthToken()}`

  const res = await fetch(`${BASE}${path}`, {
    method: 'GET',
    headers: {
      Authorization: authorization,
      Accept: 'application/json',
    },
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Monnify request failed for ${path}: ${JSON.stringify(json)}`)
  }

  return json as MonnifyApiEnvelope<T>
}

export async function getWalletBalance(accountNumber: string = MONNIFY_WALLET_ACCOUNT) {
  try {
    return await monnifyGet<Record<string, unknown>>(
      `/api/v1/disbursements/wallet/balance?accountNumber=${encodeURIComponent(accountNumber)}`,
      { authMode: 'bearer' }
    )
  } catch (bearerError) {
    console.warn('Monnify wallet balance bearer request failed, retrying with basic auth', bearerError)
    return monnifyGet<Record<string, unknown>>(
      `/api/v1/disbursements/wallet/balance?accountNumber=${encodeURIComponent(accountNumber)}`,
      { authMode: 'basic' }
    )
  }
}

export async function getWalletTransactions({
  accountNumber = MONNIFY_WALLET_ACCOUNT,
  pageNo = 0,
  pageSize = 20,
}: {
  accountNumber?: string
  pageNo?: number
  pageSize?: number
} = {}) {
  const query = new URLSearchParams({
    accountNumber,
    pageNo: String(pageNo),
    pageSize: String(pageSize),
  })

  try {
    return await monnifyGet<Record<string, unknown>>(
      `/api/v1/disbursements/wallet/transactions?${query.toString()}`,
      { authMode: 'bearer' }
    )
  } catch (bearerError) {
    console.warn('Monnify wallet transactions bearer request failed, retrying with basic auth', bearerError)
    return monnifyGet<Record<string, unknown>>(
      `/api/v1/disbursements/wallet/transactions?${query.toString()}`,
      { authMode: 'basic' }
    )
  }
}

export async function getWalletStatement({
  accountNumber = MONNIFY_WALLET_ACCOUNT,
  startDate,
  endDate,
  enableTimeFilter = false,
  pageNo = 0,
  pageSize = 20,
}: {
  accountNumber?: string
  startDate?: number | null
  endDate?: number | null
  enableTimeFilter?: boolean
  pageNo?: number
  pageSize?: number
} = {}) {
  const query = new URLSearchParams({
    startDate: String(startDate ?? 0),
    endDate: String(endDate ?? Date.now()),
    enableTimeFilter: String(enableTimeFilter),
    pageNo: String(pageNo),
    pageSize: String(pageSize),
  })

  try {
    return await monnifyGet<Record<string, unknown>>(
      `/api/v1/disbursements/wallet/${encodeURIComponent(accountNumber)}/statement?${query.toString()}`,
      { authMode: 'bearer' }
    )
  } catch (bearerError) {
    console.warn('Monnify wallet statement bearer request failed, retrying with basic auth', bearerError)
    return monnifyGet<Record<string, unknown>>(
      `/api/v1/disbursements/wallet/${encodeURIComponent(accountNumber)}/statement?${query.toString()}`,
      { authMode: 'basic' }
    )
  }
}

export async function searchDisbursementTransactions({
  sourceAccountNumber = MONNIFY_WALLET_ACCOUNT,
  pageNo = 0,
  pageSize = 20,
  startDate,
  endDate,
  amountFrom,
  amountTo,
}: {
  sourceAccountNumber?: string
  pageNo?: number
  pageSize?: number
  startDate?: number | null
  endDate?: number | null
  amountFrom?: number | null
  amountTo?: number | null
} = {}) {
  const query = new URLSearchParams({
    sourceAccountNumber,
    pageNo: String(pageNo),
    pageSize: String(pageSize),
  })

  if (startDate != null) query.set('startDate', String(startDate))
  if (endDate != null) query.set('endDate', String(endDate))
  if (amountFrom != null) query.set('amountFrom', String(amountFrom))
  if (amountTo != null) query.set('amountTo', String(amountTo))

  return monnifyGet<Record<string, unknown>>(
    `/api/v2/disbursements/search-transactions?${query.toString()}`
  )
}

export async function getTransactionsSearch({
  page = 0,
  size = 20,
}: {
  page?: number
  size?: number
} = {}) {
  const query = new URLSearchParams({
    page: String(page),
    size: String(size),
  })

  return monnifyGet<Record<string, unknown>>(`/api/v1/transactions/search?${query.toString()}`)
}

export async function getSettlementInformationForTransaction(transactionReference: string) {
  return monnifyGet<Record<string, unknown>>(
    `/api/v1/settlement-detail?transactionReference=${encodeURIComponent(transactionReference)}`
  )
}

function getTransactionSearchItems(payload: Record<string, unknown> | null | undefined) {
  const responseBody = payload?.responseBody
  if (!responseBody || typeof responseBody !== 'object') return []

  const body = responseBody as Record<string, unknown>
  if (Array.isArray(body.content)) return body.content as MonnifyTransactionRecord[]
  if (Array.isArray(body.transactions)) return body.transactions as MonnifyTransactionRecord[]
  if (Array.isArray(body.data)) return body.data as MonnifyTransactionRecord[]
  return []
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

  function extractResponseReferences(payload: Record<string, unknown> | null | undefined) {
    const responseBody = payload?.responseBody
    if (!responseBody || typeof responseBody !== 'object') return []
    return extractMonnifyReferenceCandidates(reference, responseBody as Record<string, unknown>)
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

  // Strategy 2: Try transactions search endpoint
  console.log(`Trying transactions search endpoint`)
  const searchResult = await tryWithRetry(async () => {
    for (let pageNo = 0; pageNo < 5; pageNo++) {
      const url = `${BASE}/api/v1/transactions/search?page=${pageNo}&size=100`
      const attempt = await queryUrl(url)
      if (attempt.res.ok && attempt.json?.requestSuccessful) {
        const transactions = getTransactionSearchItems(attempt.json as Record<string, unknown>)
        const found = transactions.find((transaction: Record<string, unknown>) => {
          const candidates = extractMonnifyReferenceCandidates(reference, transaction)
          return candidates.includes(reference)
        })
        if (found) {
          return { res: attempt.res, json: { requestSuccessful: true, responseBody: found } }
        }
      }

      const transactionsCount = getTransactionSearchItems(attempt.json as Record<string, unknown>).length
      if (!attempt.res.ok || !attempt.json?.requestSuccessful || transactionsCount < 100) {
        return attempt
      }
    }

    return { res: new Response(null, { status: 404 }), json: { requestSuccessful: false } }
  })
  if (searchResult) return searchResult

  // Strategy 2b: fallback to merchant transactions endpoint for older accounts
  console.log(`Trying merchant transactions endpoint`)
  const merchantResult = await tryWithRetry(async () => {
    for (let pageNo = 0; pageNo < 5; pageNo++) {
      const url = `${BASE}/api/v1/merchant/transactions?pageSize=100&pageNo=${pageNo}`
      const attempt = await queryUrl(url)
      if (attempt.res.ok && attempt.json?.requestSuccessful) {
        const transactions = Array.isArray(attempt.json?.responseBody?.transactions)
          ? (attempt.json.responseBody.transactions as Array<Record<string, unknown>>)
          : []
        const found = transactions.find((transaction: Record<string, unknown>) => {
          const candidates = extractMonnifyReferenceCandidates(reference, transaction)
          return candidates.includes(reference)
        })
        if (found) {
          return { res: attempt.res, json: { requestSuccessful: true, responseBody: found } }
        }
      }

      const transactionsCount = Array.isArray(attempt.json?.responseBody?.transactions)
        ? attempt.json.responseBody.transactions.length
        : 0
      if (!attempt.res.ok || !attempt.json?.requestSuccessful || transactionsCount < 100) {
        return attempt
      }
    }

    return { res: new Response(null, { status: 404 }), json: { requestSuccessful: false } }
  })
  if (merchantResult) return merchantResult

  // Strategy 3: Try direct transaction query endpoints
  console.log(`Trying direct transaction query endpoints`)
  const directResult = await tryWithRetry(async () => {
    const url = `${BASE}/api/v1/transactions/query?transactionReference=${encodeURIComponent(reference)}`
    return queryUrl(url)
  })
  if (directResult) return directResult

  // Strategy 4: Retry SDK query and accept when Monnify returns the same payment under an alternate reference field
  if (contractCode) {
    console.log(`Trying SDK endpoint alternate-reference match`)
    const alternateSdkResult = await tryWithRetry(async () => {
      const url = `${BASE}/api/v1/sdk/transactions/query/${contractCode}?transactionReference=${encodeURIComponent(reference)}&shouldIncludePaymentSessionInfo=true`
      const attempt = await queryUrl(url)
      if (attempt.res.ok && attempt.json?.requestSuccessful) {
        const candidates = extractResponseReferences(attempt.json)
        if (candidates.includes(reference)) {
          return attempt
        }
      }
      return attempt
    })
    if (alternateSdkResult) return alternateSdkResult
  }

  // Log all failed attempts
  console.error(`All Monnify verification attempts failed for reference: ${reference}`)
  const lastUrl = `${BASE}/api/v1/transactions/query?transactionReference=${encodeURIComponent(reference)}`
  const last = await queryUrl(lastUrl)
  throw new Error(`Monnify verify failed: ${JSON.stringify({ status: last.res.status, body: last.json })}`)
}

export async function findSuccessfulTransactionMatch({
  references = [],
  email,
  amount,
  notBefore,
}: {
  references?: string[]
  email?: string | null
  amount?: number | null
  notBefore?: Date | string | null
}) {
  const token = await getAuthToken()
  const normalizedReferences = [...new Set(references.map((value) => String(value || '').trim()).filter(Boolean))]
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const normalizedAmount = normalizeMonnifyAmount(amount)
  const notBeforeDate = notBefore instanceof Date ? notBefore : parseMonnifyDate(notBefore)

  async function queryUrl(pageNo: number) {
    const url = `${BASE}/api/v1/transactions/search?page=${pageNo}&size=100`
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    const json = await res.json().catch(() => ({}))
    return { res, json }
  }

  for (let pageNo = 0; pageNo < 5; pageNo++) {
    const attempt = await queryUrl(pageNo)
    if (!attempt.res.ok || !attempt.json?.requestSuccessful) {
      break
    }

    const transactions = getTransactionSearchItems(attempt.json as Record<string, unknown>)

    for (const transaction of transactions) {
      if (!isSuccessfulMonnifyTransaction(transaction)) continue

      const candidates = extractMonnifyReferenceCandidates('', transaction)
      if (normalizedReferences.length > 0 && candidates.some((candidate) => normalizedReferences.includes(candidate))) {
        return transaction
      }

      if (!normalizedEmail || normalizedAmount == null) continue

      const transactionEmail = getMonnifyTransactionEmail(transaction)
      const transactionAmount = getMonnifyTransactionAmount(transaction)
      if (!transactionEmail || transactionEmail !== normalizedEmail) continue
      if (transactionAmount == null || transactionAmount !== normalizedAmount) continue

      const transactionDate = getMonnifyTransactionDate(transaction)
      if (notBeforeDate && transactionDate && transactionDate.getTime() + 5 * 60 * 1000 < notBeforeDate.getTime()) {
        continue
      }

      return transaction
    }

    if (transactions.length < 100) {
      break
    }
  }

  for (let pageNo = 0; pageNo < 5; pageNo++) {
    const url = `${BASE}/api/v1/merchant/transactions?pageSize=100&pageNo=${pageNo}`
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.requestSuccessful) {
      break
    }

    const transactions = Array.isArray(json?.responseBody?.transactions)
      ? (json.responseBody.transactions as MonnifyTransactionRecord[])
      : []

    for (const transaction of transactions) {
      if (!isSuccessfulMonnifyTransaction(transaction)) continue

      const candidates = extractMonnifyReferenceCandidates('', transaction)
      if (normalizedReferences.length > 0 && candidates.some((candidate) => normalizedReferences.includes(candidate))) {
        return transaction
      }

      if (!normalizedEmail || normalizedAmount == null) continue

      const transactionEmail = getMonnifyTransactionEmail(transaction)
      const transactionAmount = getMonnifyTransactionAmount(transaction)
      if (!transactionEmail || transactionEmail !== normalizedEmail) continue
      if (transactionAmount == null || transactionAmount !== normalizedAmount) continue

      const transactionDate = getMonnifyTransactionDate(transaction)
      if (notBeforeDate && transactionDate && transactionDate.getTime() + 5 * 60 * 1000 < notBeforeDate.getTime()) {
        continue
      }

      return transaction
    }

    if (transactions.length < 100) {
      break
    }
  }

  return null
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
}: {
  amount: number // In Naira
  reference: string // Unique reference ID
  narration: string // Description
  destinationBankCode: string // 3-digit bank code
  destinationAccountNumber: string
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

  const disbursementResponse = await retryRequest(async () => {
    const res = await fetch(`${BASE}/api/v2/disbursements/single`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })

    const json = await res.json().catch((err) => {
      throw new Error(`Monnify disbursement response JSON parse failed: ${err}`)
    })

    console.log(`Monnify disbursement response: ${res.status}`, JSON.stringify(json).substring(0, 500))

    if (!res.ok || !json.requestSuccessful) {
      throw new Error(`Monnify disbursement failed: ${JSON.stringify(json)}`)
    }

    return json
  }, 3, 500)

  return disbursementResponse.responseBody
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

const monnify = {
  verifyTransaction,
  findSuccessfulTransactionMatch,
  initiateTransaction,
  refundTransaction,
  initiateDisbursement,
  checkDisbursementStatus,
  getWalletBalance,
  getWalletTransactions,
  getWalletStatement,
  searchDisbursementTransactions,
  getTransactionsSearch,
  getSettlementInformationForTransaction,
}

export default monnify
