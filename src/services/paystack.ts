import crypto from 'crypto'

const PAYSTACK_BASE = process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co'
const SECRET = process.env.PAYSTACK_SECRET_KEY || ''

async function call(path: string, body: Record<string, unknown>) {
  if (!SECRET) throw new Error('PAYSTACK_SECRET_KEY not configured')
  console.debug('[paystack] request', path, body)
  // Validate base URL
  if (!/^https?:\/\//i.test(PAYSTACK_BASE)) {
    console.error('[paystack] invalid PAYSTACK_BASE_URL:', PAYSTACK_BASE)
    throw new Error('PAYSTACK_BASE_URL must be an absolute URL (e.g. https://api.paystack.co or http://localhost:3000)')
  }

  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })
  let json: Record<string, unknown> | null = null
  let textBody: string | null = null
  try {
    json = await res.json()
  } catch (e) {
    try {
      textBody = await res.text()
    } catch (e2) {
      console.error('[paystack] failed to read non-json response', e2)
    }
    console.error('[paystack] invalid json response', e)
  }
  console.debug('[paystack] response', path, res.status, json ?? textBody)
  if (!res.ok) {
    const msg = json?.message || textBody || `Paystack error ${res.status}`
    throw new Error(String(msg))
  }
  if (!json) throw new Error('Paystack returned non-JSON response')
  return json
}

export async function createTransferRecipient({ name, accountNumber, bankCode, currency = 'NGN' }: { name: string; accountNumber: string; bankCode: string; currency?: string }) {
  const body = {
    type: 'nuban',
    name,
    account_number: accountNumber,
    bank_code: bankCode,
    currency,
  }
  const j = await call('/transferrecipient', body)
  return (j.data as Record<string, unknown>)?.recipient_code
}

export async function initiateTransfer({ recipient, amountKobo, reason }: { recipient: string; amountKobo: number; reason?: string }) {
  const body = {
    source: 'balance',
    amount: amountKobo,
    recipient,
    reason: reason || 'Withdrawal transfer',
  }
  const j = await call('/transfer', body)
  const transferData = j.data

  // If using a local mock Paystack, simulate webhook delivery so the
  // withdrawal can be auto-finalized during local testing.
  try {
    if (/localhost|paystack-mock/.test(PAYSTACK_BASE)) {
      const payload = { event: 'transfer.success', data: transferData }
      const raw = JSON.stringify(payload)
      const sig = crypto.createHmac('sha512', SECRET).update(raw).digest('hex')
      const webhookUrl = (process.env.PAYSTACK_LOCAL_WEBHOOK_URL || 'http://localhost:3000') + '/api/paystack/transfer-webhook'
      console.debug('[paystack] sending local webhook to', webhookUrl, payload)
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-paystack-signature': sig,
        },
        body: raw,
      })
    }
  } catch (e) {
    console.error('[paystack] failed to deliver local webhook', e)
  }

  return transferData
}

export async function refundTransaction({ transactionRef, amountKobo, reason }: { transactionRef: string; amountKobo?: number; reason?: string }) {
  const body: Record<string, unknown> = {
    transaction: transactionRef,
    reason: reason || 'Bill payment service failed - automatic refund',
  }
  if (amountKobo) {
    body.amount = amountKobo
  }
  const j = await call('/refund', body)
  return j.data
}

export function verifyWebhookSignature(rawBody: string, signature: string | null) {
  if (!SECRET) return false
  if (!signature) return false
  const hmac = crypto.createHmac('sha512', SECRET).update(rawBody).digest('hex')
  return hmac === signature
}

export default { createTransferRecipient, initiateTransfer, refundTransaction, verifyWebhookSignature }
