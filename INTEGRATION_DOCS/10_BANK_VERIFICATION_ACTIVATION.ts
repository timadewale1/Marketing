/**
 * BANK VERIFICATION & ACCOUNT SETUP
 * 
 * Enables users to verify bank accounts for withdrawals.
 * Uses Paystack bank resolution API to validate account details.
 * 
 * Flow:
 * 1. User enters bank code and account number
 * 2. Backend queries Paystack bank resolution API
 * 3. Returns account owner name
 * 4. Backend stores in user profile
 * 5. User can now withdraw to this account
 */

export interface BankVerificationRequest {
  accountNumber: string // 10-digit Nigerian bank account
  bankCode: string      // 3-digit Paystack bank code
}

export interface BankVerificationResponse {
  ok: boolean
  account_number?: string
  account_name?: string
  bank_id?: number
  message?: string
  error?: string
}

/**
 * BANK VERIFICATION ENDPOINT
 * 
 * POST /api/verify-bank
 * 
 * Request:
 * {
 *   "accountNumber": "1234567890",
 *   "bankCode": "007"
 * }
 * 
 * Response Success:
 * {
 *   "ok": true,
 *   "account_number": "1234567890",
 *   "account_name": "John Doe",
 *   "bank_id": 1
 * }
 * 
 * Response Error:
 * {
 *   "ok": false,
 *   "error": "Invalid account number"
 * }
 */

export const bankVerificationEndpoint = `
// POST /api/verify-bank
import { NextRequest, NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

export async function POST(req: NextRequest) {
  try {
    const { accountNumber, bankCode, userId, userType } = await req.json()

    if (!accountNumber || !bankCode) {
      return NextResponse.json(
        { ok: false, error: 'Account number and bank code required' },
        { status: 400 }
      )
    }

    if (accountNumber.length !== 10) {
      return NextResponse.json(
        { ok: false, error: 'Account number must be 10 digits' },
        { status: 400 }
      )
    }

    // Query Paystack bank resolution API
    const paystackUrl = 
      \`https://api.paystack.co/bank/resolve?\` +
      \`account_number=\${accountNumber}&\` +
      \`bank_code=\${bankCode}\`

    const res = await fetch(paystackUrl, {
      headers: {
        Authorization: \`Bearer \${process.env.PAYSTACK_SECRET_KEY}\`,
        Accept: 'application/json'
      }
    })

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: 'Failed to verify account with bank' },
        { status: 502 }
      )
    }

    const data = await res.json()

    if (!data.status) {
      return NextResponse.json(
        { ok: false, error: data.message || 'Invalid account details' },
        { status: 400 }
      )
    }

    const { account_number, account_name } = data.data

    // If userId provided, save to user profile
    if (userId && userType) {
      const { dbAdmin } = await initFirebaseAdmin()
      const collection = userType === 'advertiser' ? 'advertisers' : 'earners'
      
      await dbAdmin.collection(collection).doc(userId).update({
        bankDetails: {
          accountNumber: account_number,
          accountName: account_name,
          bankCode,
          verifiedAt: new Date().toISOString()
        }
      })
    }

    return NextResponse.json({
      ok: true,
      account_number,
      account_name,
      message: 'Account verified successfully'
    })

  } catch (err) {
    console.error('Bank verification error:', err)
    return NextResponse.json(
      { ok: false, error: 'Verification failed' },
      { status: 500 }
    )
  }
}
`

/**
 * FRONTEND: BANK VERIFICATION FORM
 * 
 * Component for collecting and verifying bank details
 */

export const bankVerificationFormExample = `
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import toast from 'react-hot-toast'

const NIGERIAN_BANKS = [
  { name: 'Access Bank', code: '044' },
  { name: 'GTBank', code: '058' },
  { name: 'First Bank', code: '011' },
  { name: 'Zenith Bank', code: '057' },
  { name: 'UBA', code: '033' },
  { name: 'Wema Bank', code: '035' },
  // ... more banks
]

export function BankVerificationForm({ onSuccess, userId, userType }) {
  const [accountNumber, setAccountNumber] = useState('')
  const [bankCode, setBankCode] = useState('')
  const [verifying, setVerifying] = useState(false)

  const handleVerify = async () => {
    if (!accountNumber || accountNumber.length !== 10) {
      toast.error('Account number must be 10 digits')
      return
    }

    if (!bankCode) {
      toast.error('Please select a bank')
      return
    }

    setVerifying(true)
    try {
      const res = await fetch('/api/verify-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountNumber,
          bankCode,
          userId,
          userType
        })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Verification failed')
      }

      const data = await res.json()
      toast.success(\`Verified: \${data.account_name}\`)

      if (onSuccess) {
        onSuccess({
          accountNumber: data.account_number,
          accountName: data.account_name,
          bankCode
        })
      }

      setAccountNumber('')
      setBankCode('')

    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Bank</label>
        <Select value={bankCode} onValueChange={setBankCode}>
          <SelectTrigger>
            <SelectValue placeholder="Select your bank" />
          </SelectTrigger>
          <SelectContent>
            {NIGERIAN_BANKS.map(bank => (
              <SelectItem key={bank.code} value={bank.code}>
                {bank.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Account Number
        </label>
        <Input
          type="text"
          placeholder="0000000000"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value.replace(/\\D/g, '').slice(0, 10))}
          maxLength="10"
        />
      </div>

      <Button
        onClick={handleVerify}
        disabled={verifying || !accountNumber || !bankCode}
        className="w-full"
      >
        {verifying ? 'Verifying...' : 'Verify Account'}
      </Button>
    </div>
  )
}
`

/**
 * USER ACTIVATION FLOW
 * 
 * Process for new advertisers and earners to activate accounts:
 * 1. Complete profile (email, name, bank details)
 * 2. Verify bank account
 * 3. Complete initial payment/setup
 * 4. Account becomes active
 */

/**
 * ADVERTISER ACTIVATION
 * 
 * POST /api/advertiser/activate
 * 
 * Requirements:
 * - Complete profile
 * - Verified bank account
 * - Initial payment for first campaign
 * 
 * Process:
 * 1. User submits profile data
 * 2. User verifies bank account
 * 3. User makes initial payment
 * 4. System marks account as active
 * 5. User can create campaigns
 */

export const advertiserActivationExample = `
// POST /api/advertiser/activate
import { NextRequest, NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

export async function POST(req: NextRequest) {
  try {
    const {
      userId,
      email,
      businessName,
      businessWebsite,
      accountNumber,
      bankCode,
      paystackReference,
      initialAmount
    } = await req.json()

    const { admin, dbAdmin } = await initFirebaseAdmin()

    // 1. Verify user authentication
    try {
      await admin.auth().getUser(userId)
    } catch (err) {
      return NextResponse.json(
        { ok: false, message: 'Invalid user' },
        { status: 400 }
      )
    }

    // 2. Verify bank account
    const bankRes = await fetch('https://api.paystack.co/bank/resolve?' +
      \`account_number=\${accountNumber}&bank_code=\${bankCode}\`,
      {
        headers: {
          Authorization: \`Bearer \${process.env.PAYSTACK_SECRET_KEY}\`
        }
      }
    )

    if (!bankRes.ok) {
      return NextResponse.json(
        { ok: false, message: 'Bank account verification failed' },
        { status: 400 }
      )
    }

    const bankData = await bankRes.json()
    if (!bankData.status) {
      return NextResponse.json(
        { ok: false, message: 'Invalid bank account' },
        { status: 400 }
      )
    }

    // 3. Verify Paystack payment
    const paystackRes = await fetch(
      \`https://api.paystack.co/transaction/verify/\${paystackReference}\`,
      {
        headers: {
          Authorization: \`Bearer \${process.env.PAYSTACK_SECRET_KEY}\`
        }
      }
    )

    if (!paystackRes.ok) {
      return NextResponse.json(
        { ok: false, message: 'Payment verification failed' },
        { status: 400 }
      )
    }

    const paystackData = await paystackRes.json()
    if (paystackData.data?.status !== 'success') {
      return NextResponse.json(
        { ok: false, message: 'Payment not successful' },
        { status: 400 }
      )
    }

    // 4. Create/update advertiser profile
    const db = dbAdmin as import('firebase-admin').firestore.Firestore

    await db.collection('advertisers').doc(userId).set({
      uid: userId,
      email,
      businessName,
      businessWebsite,
      bankDetails: {
        accountNumber,
        accountName: bankData.data.account_name,
        bankCode,
        verifiedAt: new Date().toISOString()
      },
      balance: Number(initialAmount),
      status: 'active',
      activatedAt: new Date().toISOString(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true })

    // 5. Record initial transaction
    await db.collection('advertiserTransactions').add({
      userId,
      type: 'deposit',
      amount: Number(initialAmount),
      reference: paystackReference,
      provider: 'paystack',
      description: 'Initial activation deposit',
      status: 'completed',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    })

    // 6. Create activation notification
    await db.collection('adminNotifications').add({
      type: 'advertiser_activated',
      advertiserEmail: email,
      businessName,
      amount: Number(initialAmount),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      read: false
    })

    return NextResponse.json({
      ok: true,
      message: 'Account activated successfully',
      advertiser: {
        uid: userId,
        status: 'active',
        balance: Number(initialAmount)
      }
    })

  } catch (err) {
    console.error('Advertiser activation error:', err)
    return NextResponse.json(
      { ok: false, message: 'Activation failed' },
      { status: 500 }
    )
  }
}
`

/**
 * EARNER ACTIVATION
 * 
 * Similar flow for earners:
 * 1. Complete profile
 * 2. Verify bank account
 * 3. Accept terms and conditions
 * 4. Account becomes active
 * 
 * POST /api/earner/activate
 */

export const earnerActivationExample = `
// POST /api/earner/activate
// Similar to advertiser but may not require initial payment
// Earners can start earning immediately and withdraw later

export async function POST(req: NextRequest) {
  const {
    userId,
    email,
    fullName,
    accountNumber,
    bankCode,
    acceptTerms
  } = await req.json()

  // ... similar verification flow as advertiser

  // Create earner profile
  await db.collection('earners').doc(userId).set({
    uid: userId,
    email,
    fullName,
    bankDetails: {
      accountNumber,
      accountName: bankData.data.account_name,
      bankCode
    },
    balance: 0,
    status: 'active',
    acceptedTermsAt: acceptTerms ? new Date().toISOString() : null,
    activatedAt: new Date().toISOString()
  })

  return NextResponse.json({
    ok: true,
    message: 'Earner account activated'
  })
}
`

/**
 * SUPPORTED BANKS (Sample)
 * 
 * Nigerian banks with their Paystack codes:
 */

export const supportedBanks = [
  { name: 'Access Bank', code: '044' },
  { name: 'First Bank of Nigeria', code: '011' },
  { name: 'Guaranty Trust Bank', code: '058' },
  { name: 'United Bank for Africa', code: '033' },
  { name: 'Zenith Bank', code: '057' },
  { name: 'WEMA Bank', code: '035' },
  { name: 'Ecobank Nigeria', code: '050' },
  { name: 'Sterling Bank', code: '232' },
  { name: 'Citibank Nigeria', code: '084' },
  { name: 'FCMB', code: '214' },
  { name: 'HSBC Nigeria', code: '024' },
  { name: 'IEbank', code: '901' },
  { name: 'Keystone Bank', code: '082' },
  { name: 'Polaris Bank', code: '076' },
  { name: 'Standard Chartered Bank', code: '068' },
  { name: 'Stanbic IBTC Bank', code: '221' },
  { name: 'Union Bank of Nigeria', code: '032' },
  { name: 'Unity Bank', code: '215' },
  { name: 'VFD', code: '566' },
]
