export type BuyServiceResult = {
  response_description?: string
  transactionId?: string
  requestId?: string
  request_id?: string
  purchased_code?: string
  token?: string
  content?: {
    transactions?: {
      transactionId?: string
      [key: string]: unknown
    }
    transactionId?: string
    transaction_id?: string
    token?: string
    purchased_code?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type BuyServiceResponseBody = {
  ok?: boolean
  message?: string
  result?: BuyServiceResult
  [key: string]: unknown
}

export type BuyServiceResponse = {
  ok: boolean
  status: number
  body: BuyServiceResponseBody
  raw: Response
}

export async function postBuyService(payload: Record<string, unknown>, options?: { idToken?: string }): Promise<BuyServiceResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options?.idToken) headers['Authorization'] = `Bearer ${options.idToken}`
  const res = await fetch('/api/bills/buy-service', { method: 'POST', headers, body: JSON.stringify(payload) })
  let body: BuyServiceResponseBody = {}
  try { body = (await res.json()) as BuyServiceResponseBody } catch (_error) { body = {} }
  return { ok: Boolean(res.ok && body.ok), status: res.status, body, raw: res }
}

export default postBuyService
