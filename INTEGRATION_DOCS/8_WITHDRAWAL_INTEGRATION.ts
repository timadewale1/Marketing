/**
 * WITHDRAWAL & TRANSFER SYSTEM
 * 
 * Handles user withdrawals to bank accounts via Paystack.
 * 
 * Flow:
 * 1. User provides withdrawal amount and bank details
 * 2. Frontend shows fee calculation (10% service fee)
 * 3. Backend creates Paystack transfer recipient
 * 4. Backend initiates transfer
 * 5. Transaction recorded in Firestore
 * 6. Wallet balance deducted
 * 
 * Requirements:
 * - User must have bank account verified via Paystack
 * - Minimum withdrawal: ₦2,000
 * - Service fee: 10% of withdrawal amount
 * - Net amount = Amount - Fee
 */

import admin from 'firebase-admin'

export interface WithdrawalRequest {
  userId: string
  userType: 'advertiser' | 'earner'
  amount: number
  bankAccountNumber: string
  bankCode: string
  bankName: string
  accountName: string
}

export interface TransferRecipient {
  recipientCode: string
  type: string
  domain: string
  name: string
  description: string
  metadata: Record<string, unknown> | null
  active: boolean
  currency: string
  recipient_code: string
  transfer_code?: string
}

export interface WithdrawalTransaction {
  id: string
  userId: string
  userType: 'advertiser' | 'earner'
  amount: number
  fee: number
  netAmount: number
  bankAccount: {
    accountNumber: string
    bankCode: string
    bankName: string
    accountName: string
  }
  status: 'pending' | 'processing' | 'completed' | 'failed'
  paystackTransferCode?: string
  paystackReference?: string
  timestamp: admin.firestore.Timestamp
  completedAt?: admin.firestore.Timestamp
  errorMessage?: string
}

/**
 * Calculate withdrawal fee (10%)
 */
export function calculateWithdrawalFee(amount: number): { fee: number; netAmount: number } {
  const FEE_PERCENTAGE = 0.1
  const fee = Math.round(amount * FEE_PERCENTAGE)
  const netAmount = amount - fee

  return { fee, netAmount }
}

/**
 * Validate withdrawal request
 */
export function validateWithdrawalRequest(request: WithdrawalRequest): { valid: boolean; error?: string } {
  const MIN_WITHDRAWAL = 2000

  if (!request.amount || request.amount < MIN_WITHDRAWAL) {
    return { valid: false, error: `Minimum withdrawal amount is ₦${MIN_WITHDRAWAL}` }
  }

  if (!request.bankAccountNumber || request.bankAccountNumber.length !== 10) {
    return { valid: false, error: 'Invalid bank account number' }
  }

  if (!request.bankCode || request.bankCode.length === 0) {
    return { valid: false, error: 'Invalid bank code' }
  }

  if (!request.accountName) {
    return { valid: false, error: 'Account name required' }
  }

  return { valid: true }
}

/**
 * BACKEND: Create withdrawal request
 * 
 * Flow:
 * 1. Validate request
 * 2. Check wallet balance
 * 3. Deduct from wallet (including fee)
 * 4. Create transfer recipient in Paystack
 * 5. Initiate transfer
 * 6. Record transaction
 * 7. Return status
 * 
 * Environment Variables Required:
 * - PAYSTACK_SECRET_KEY: Paystack API secret key
 */

// Example API route handler
export const withdrawalHandlerExample = `
// POST /api/withdraw
import { NextRequest, NextResponse } from 'next/server'
import admin from 'firebase-admin'
import { validateWithdrawalRequest, calculateWithdrawalFee } from '@/lib/withdrawal'
import { createTransferRecipient, initiateTransfer } from '@/services/paystack'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, userType, amount, bankAccountNumber, bankCode, bankName, accountName } = body

    // Validate request
    const validation = validateWithdrawalRequest({
      userId,
      userType,
      amount: Number(amount),
      bankAccountNumber,
      bankCode,
      bankName,
      accountName,
    })

    if (!validation.valid) {
      return NextResponse.json({ ok: false, message: validation.error }, { status: 400 })
    }

    const amountN = Number(amount)
    const { fee, netAmount } = calculateWithdrawalFee(amountN)

    // Check wallet balance
    const userRef = admin
      .firestore()
      .collection(userType === 'advertiser' ? 'advertisers' : 'earners')
      .doc(userId)
    const userSnap = await userRef.get()

    if (!userSnap.exists) {
      return NextResponse.json({ ok: false, message: 'User not found' }, { status: 404 })
    }

    const balance = Number(userSnap.data()?.balance || 0)

    if (balance < amountN) {
      return NextResponse.json(
        { ok: false, message: 'Insufficient balance' },
        { status: 400 }
      )
    }

    // Create withdrawal transaction record
    const withdrawalRef = admin
      .firestore()
      .collection(userType === 'advertiser' ? 'advertiserWithdrawals' : 'earnerWithdrawals')
      .doc()

    // Create transfer recipient in Paystack
    const recipient = await createTransferRecipient({
      type: 'nuban',
      name: accountName,
      account_number: bankAccountNumber,
      bank_code: bankCode,
      currency: 'NGN',
    })

    const recipientCode = recipient.data.recipient_code

    // Initiate transfer
    const transfer = await initiateTransfer({
      source: 'balance',
      amount: netAmount * 100, // Paystack uses kobo
      recipient: recipientCode,
      reason: 'Withdrawal request',
      reference: \`withdrawal_\${withdrawalRef.id}_\${Date.now()}\`,
    })

    const transferCode = transfer.data.transfer_code
    const transferRef = transfer.data.reference

    // Update transaction record
    await withdrawalRef.set({
      userId,
      userType,
      amount: amountN,
      fee,
      netAmount,
      bankAccount: {
        accountNumber: bankAccountNumber,
        bankCode,
        bankName,
        accountName,
      },
      status: 'processing',
      paystackTransferCode: transferCode,
      paystackReference: transferRef,
      timestamp: admin.firestore.Timestamp.now(),
    })

    // Deduct from wallet (INCLUDING FEE)
    await admin.firestore().runTransaction(async (t) => {
      const currentUserSnap = await t.get(userRef)
      const currentBalance = Number(currentUserSnap.data()?.balance || 0)

      t.update(userRef, {
        balance: admin.firestore.FieldValue.increment(-amountN),
      })

      // Record transaction
      const txnRef = admin
        .firestore()
        .collection(userType === 'advertiser' ? 'advertiserTransactions' : 'earnerTransactions')
        .doc()

      t.set(txnRef, {
        userId,
        type: 'withdrawal',
        amount: amountN,
        fee,
        netAmount,
        reference: transferRef,
        provider: 'paystack',
        description: \`Withdrawal to \${bankName} (\${bankAccountNumber})\`,
        status: 'processing',
        timestamp: admin.firestore.Timestamp.now(),
        previousBalance: currentBalance,
        newBalance: currentBalance - amountN,
      })
    })

    return NextResponse.json({
      ok: true,
      message: 'Withdrawal initiated',
      withdrawal: {
        id: withdrawalRef.id,
        amount: amountN,
        fee,
        netAmount,
        status: 'processing',
        transferCode,
      },
    })
  } catch (err) {
    console.error('Withdrawal error:', err)

    if (err instanceof Error) {
      if (err.message.includes('Paystack')) {
        return NextResponse.json(
          { ok: false, message: 'Payment provider error' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json(
      { ok: false, message: 'Withdrawal failed' },
      { status: 500 }
    )
  }
}
`

/**
 * Frontend: Withdraw Dialog Component
 * 
 * Shows:
 * - Amount input field
 * - Bank account details
 * - Fee calculation (10%)
 * - Net amount to receive
 * - Withdrawal restrictions (min ₦2,000, max available balance)
 * 
 * See: 8_WITHDRAW_DIALOG_COMPONENT.tsx
 */

export const withdrawDialogExample = `
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'

interface WithdrawDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (amount: number) => Promise<void>
  maxAmount: number
  bankDetails: {
    accountNumber: string
    bankName: string
    accountName: string
  } | null
}

export function WithdrawDialog({
  open,
  onClose,
  onSubmit,
  maxAmount,
  bankDetails,
}: WithdrawDialogProps) {
  const [amount, setAmount] = useState<number | ''>('')
  const [submitting, setSubmitting] = useState(false)
  const minWithdraw = 2000

  const handleSubmit = async () => {
    if (!amount || Number(amount) < minWithdraw) return
    if (Number(amount) > maxAmount) return

    setSubmitting(true)
    try {
      await onSubmit(Number(amount))
      setAmount('')
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const fee =
    typeof amount === 'number' && amount > 0
      ? Math.round(Number(amount) * 0.1)
      : 0
  const net =
    typeof amount === 'number' && amount > 0
      ? Math.max(0, Number(amount) - fee)
      : 0

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Withdraw Funds</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {bankDetails && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="font-medium">{bankDetails.accountName}</div>
              <div className="text-sm">
                {bankDetails.bankName} • {bankDetails.accountNumber}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label>Amount to withdraw</label>
            <Input
              type="number"
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value === '' ? '' : Number(e.target.value))
              }
              placeholder="Enter amount"
              min={minWithdraw}
              max={maxAmount}
            />
          </div>

          {amount && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex justify-between text-sm">
                <span>Service fee (10%)</span>
                <span>₦{fee.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-medium mt-2">
                <span>Net to receive</span>
                <span>₦{net.toLocaleString()}</span>
              </div>
            </div>
          )}

          <Button onClick={handleSubmit} disabled={submitting} className="w-full">
            {submitting ? 'Processing...' : 'Withdraw'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
`

/**
 * WEBHOOK HANDLER: Update withdrawal status
 * 
 * Paystack sends webhook when transfer completes:
 * 
 * Event: transfer.success
 * - Update transaction status to 'completed'
 * - Record completion timestamp
 * 
 * Event: transfer.failed
 * - Update transaction status to 'failed'
 * - Record error message
 * - REFUND the amount back to wallet (amount + fee)
 * 
 * See: 2_PAYMENT_VERIFICATION_API.ts for webhook verification
 */

export const webhookHandlerExample = `
// Handle Paystack withdrawal webhook
if (event.event === 'transfer.success') {
  const { reference, transfer_code, amount } = event.data

  // Update withdrawal record
  const withdrawalSnap = await admin
    .firestore()
    .collection(userType === 'advertiser' ? 'advertiserWithdrawals' : 'earnerWithdrawals')
    .where('paystackReference', '==', reference)
    .limit(1)
    .get()

  if (!withdrawalSnap.empty) {
    const withdrawal = withdrawalSnap.docs[0]
    await withdrawal.ref.update({
      status: 'completed',
      completedAt: admin.firestore.Timestamp.now(),
    })
  }
}

if (event.event === 'transfer.failed') {
  const { reference } = event.data

  const withdrawalSnap = await admin
    .firestore()
    .collection(userType === 'advertiser' ? 'advertiserWithdrawals' : 'earnerWithdrawals')
    .where('paystackReference', '==', reference)
    .limit(1)
    .get()

  if (!withdrawalSnap.empty) {
    const withdrawal = withdrawalSnap.docs[0]
    const withdrawalData = withdrawal.data()

    // REFUND to wallet
    const userRef = admin
      .firestore()
      .collection(userType === 'advertiser' ? 'advertisers' : 'earners')
      .doc(withdrawalData.userId)

    await admin.firestore().runTransaction(async (t) => {
      // Refund full amount (including fee)
      t.update(userRef, {
        balance: admin.firestore.FieldValue.increment(withdrawalData.amount),
      })

      // Update withdrawal as failed
      t.update(withdrawal.ref, {
        status: 'failed',
        errorMessage: event.data.reason || 'Transfer failed',
      })
    })
  }
}
`
