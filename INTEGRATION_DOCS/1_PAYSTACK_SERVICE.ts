/**
 * PAYSTACK SERVICE INTEGRATION
 * 
 * This file contains the core Paystack service for payment processing,
 * webhook verification, and fund transfers.
 * 
 * Required Environment Variables:
 * - PAYSTACK_BASE_URL: https://api.paystack.co
 * - PAYSTACK_SECRET_KEY: Your Paystack secret key
 * - NEXT_PUBLIC_PAYSTACK_KEY: Your Paystack public key
 */

import crypto from 'crypto'

const PAYSTACK_BASE = process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co'
const SECRET = process.env.PAYSTACK_SECRET_KEY || ''

/**
 * Make API calls to Paystack
 */
async function call(path: string, body: Record<string, unknown>) {
  if (!SECRET) throw new Error('PAYSTACK_SECRET_KEY not configured')

  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`Paystack API error: ${res.status}`, text)
    throw new Error(`Paystack API ${res.status}: ${text}`)
  }

  return res.json()
}

/**
 * Create a transfer recipient (bank account holder)
 * Required for processing withdrawals/transfers
 */
export async function createTransferRecipient({
  name,
  accountNumber,
  bankCode,
  currency = 'NGN',
}: {
  name: string
  accountNumber: string
  bankCode: string
  currency?: string
}) {
  const result = await call('/transferrecipient', {
    type: 'nuban',
    name,
    account_number: accountNumber,
    bank_code: bankCode,
    currency,
  })

  return result.data
}

/**
 * Initiate a transfer to a recipient
 */
export async function initiateTransfer({
  recipient,
  amountKobo,
  reason,
}: {
  recipient: string
  amountKobo: number
  reason?: string
}) {
  const result = await call('/transfer', {
    source: 'balance',
    recipient,
    amount: amountKobo,
    reason: reason || 'Withdrawal',
  })

  return result.data
}

/**
 * Verify webhook signature from Paystack
 * Call this on webhook endpoints to ensure the request is from Paystack
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null
) {
  if (!SECRET) return false
  if (!signature) return false

  const hmac = crypto
    .createHmac('sha512', SECRET)
    .update(rawBody)
    .digest('hex')

  return hmac === signature
}

export default { createTransferRecipient, initiateTransfer, verifyWebhookSignature }
