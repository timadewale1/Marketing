/**
 * BILL PAYMENT INTEGRATION
 * 
 * Enables users to purchase bills/utilities via VTpass with wallet or Paystack payment.
 * Supports: Airtime, Data, Electricity, Cable TV, Education vouchers.
 * 
 * Two Payment Methods:
 * 1. Pay from Wallet - Deducts from user balance directly
 * 2. Pay via Paystack - Verifies Paystack transaction, then calls VTpass
 * 
 * VTpass Integration:
 * - API: https://api.vtpass.com/v2/pay
 * - Provides utility provider codes and variations
 * - Returns transaction ID and confirmation details
 * 
 * Transaction Flow:
 * 1. User selects service (airtime, data, electricity, etc)
 * 2. User enters required details (phone, account number, quantity)
 * 3. User selects payment method (wallet or Paystack)
 * 4. Backend calls VTpass API
 * 5. Transaction recorded in Firestore
 * 6. User receives confirmation
 */

export interface BillPaymentRequest {
  serviceID: string // 'airtime', 'data', 'electricity', 'tv', 'education', etc
  provider?: 'paystack' | 'wallet'
  amount: number // Amount in Naira
  phone?: string // For airtime/data
  billersCode?: string // For electricity/cable/education
  variation_code?: string // Specific variation (e.g., mtn, airtel for airtime)
  subscription_type?: string // For cable subscriptions (premium, standard, etc)
  quantity?: number // For data/vouchers
  payFromWallet?: boolean
  paystackReference?: string
  userId?: string
  metadata?: Record<string, unknown>
}

export interface BillPaymentResponse {
  ok: boolean
  message?: string
  result?: {
    code: string
    request_id: string
    response_description: string
    amount: number
    transaction_id: string
    status: string
    // ... other VTpass response fields
  }
}

export interface BillTransaction {
  id?: string
  userId: string
  type: 'bill_purchase'
  serviceID: string
  provider: 'paystack' | 'wallet'
  amount: number
  phone?: string
  billersCode?: string
  status: 'pending' | 'completed' | 'failed'
  request_id: string
  transactionId?: string
  paystackReference?: string
  vtpassResponse?: Record<string, unknown>
  createdAt: string
  updatedAt?: string
}

/**
 * PAYMENT FLOW 1: WALLET PAYMENT
 * 
 * Process:
 * 1. Check user has sufficient wallet balance
 * 2. Reserve funds (deduct from balance)
 * 3. Call VTpass API
 * 4. If VTpass succeeds: complete transaction
 * 5. If VTpass fails: restore balance to wallet
 * 
 * Example API Call:
 * POST /api/bills/buy-service
 * {
 *   "serviceID": "airtime",
 *   "provider": "wallet",
 *   "amount": 1000,
 *   "phone": "08012345678",
 *   "variation_code": "mtn",
 *   "payFromWallet": true,
 *   "metadata": { "userId": "user123" }
 * }
 * 
 * Headers:
 * Authorization: Bearer <idToken>
 * 
 * Backend Implementation:
 * 1. Verify Firebase ID token
 * 2. Get user's current balance
 * 3. Check balance >= amount
 * 4. Start transaction:
 *    a. Deduct amount from user.balance
 *    b. Create pending transaction record
 * 5. Call VTpass API
 * 6. If VTpass success (code === '000'):
 *    a. Mark transaction as completed
 *    b. Record in advertiserTransactions/earnerTransactions
 * 7. If VTpass fails:
 *    a. Refund amount back to user.balance
 *    b. Mark transaction as failed
 */

export const walletPaymentExample = `
// POST /api/bills/buy-service - Wallet Payment Handler
const { payFromWallet, serviceID, amount, phone, variation_code, billersCode } = body

if (payFromWallet) {
  // 1. Verify user authentication
  const authHeader = req.headers.get('authorization')
  const idToken = authHeader.split('Bearer ')[1]
  const decoded = await admin.auth().verifyIdToken(idToken)
  const userId = decoded.uid

  // 2. Determine user type (advertiser or earner)
  const advSnap = await db.collection('advertisers').doc(userId).get()
  const earSnap = await db.collection('earners').doc(userId).get()
  
  let userType = advSnap.exists ? 'advertiser' : 'earner'
  let userRef = advSnap.exists 
    ? db.collection('advertisers').doc(userId)
    : db.collection('earners').doc(userId)

  // 3. Create pending transaction record
  const txDocRef = db.collection(userType + 'Transactions').doc()

  // 4. Use transaction to ensure atomicity
  await db.runTransaction(async (t) => {
    const uSnap = await t.get(userRef)
    const balance = Number(uSnap.data()?.balance || 0)

    // Check sufficient balance
    if (balance < amount) {
      throw new Error('Insufficient balance')
    }

    // Deduct from balance (reserve funds)
    t.update(userRef, {
      balance: admin.firestore.FieldValue.increment(-amount)
    })

    // Create pending transaction record
    t.set(txDocRef, {
      userId,
      type: 'vtpass_purchase',
      amount: -amount,
      status: 'pending',
      request_id: generateRequestId(),
      serviceID,
      phone,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    })
  })

  // 5. Call VTpass API
  try {
    const vtRes = await vtpassClient.post('/pay', {
      request_id: generateRequestId(),
      serviceID,
      variation_code,
      billersCode,
      phone,
      amount: String(amount)
    })

    // 6. Check VTpass response
    if (vtRes.data?.code !== '000') {
      // VTpass failed - restore balance
      await userRef.update({
        balance: admin.firestore.FieldValue.increment(amount)
      })
      
      // Mark transaction as failed
      await txDocRef.update({
        status: 'failed',
        response: vtRes.data
      })

      return NextResponse.json({
        ok: false,
        message: vtRes.data?.response_description || 'Purchase failed'
      }, { status: 400 })
    }

    // VTpass succeeded
    await txDocRef.update({
      status: 'completed',
      response: vtRes.data
    })

    return NextResponse.json({
      ok: true,
      result: vtRes.data
    })

  } catch (err) {
    // VTpass call failed - restore balance
    await userRef.update({
      balance: admin.firestore.FieldValue.increment(amount)
    })

    await txDocRef.update({
      status: 'failed',
      error: String(err)
    })

    throw err
  }
}
`

/**
 * PAYMENT FLOW 2: PAYSTACK PAYMENT
 * 
 * Process:
 * 1. User completes Paystack payment
 * 2. Backend receives Paystack reference
 * 3. Verify transaction with Paystack API
 * 4. If verified: call VTpass API
 * 5. Record transaction in Firestore
 * 
 * Example API Call:
 * POST /api/bills/buy-service
 * {
 *   "serviceID": "data",
 *   "provider": "paystack",
 *   "amount": 2000,
 *   "phone": "08012345678",
 *   "variation_code": "mtn-1gb",
 *   "paystackReference": "7119051211"
 * }
 * 
 * Backend Implementation:
 * 1. Verify Paystack reference with Paystack API
 * 2. Check status === 'success'
 * 3. Check paid amount matches requested amount
 * 4. Call VTpass API
 * 5. Record transaction in Firestore
 */

export const paystackPaymentExample = `
// POST /api/bills/buy-service - Paystack Payment Handler
if (provider === 'paystack' && paystackReference) {
  // 1. Verify with Paystack
  const res = await fetch(\`https://api.paystack.co/transaction/verify/\${paystackReference}\`, {
    headers: {
      Authorization: \`Bearer \${process.env.PAYSTACK_SECRET_KEY}\`,
      Accept: 'application/json'
    }
  })

  if (!res.ok) {
    return NextResponse.json({
      ok: false,
      message: 'Failed to verify payment with provider'
    }, { status: 502 })
  }

  const vd = await res.json()

  // Check payment successful
  if (vd.data?.status !== 'success') {
    return NextResponse.json({
      ok: false,
      message: 'Payment not successful'
    }, { status: 400 })
  }

  // Check amount matches (Paystack returns amount in kobo)
  const paidAmount = Number(vd.data?.amount || 0) / 100
  if (paidAmount < Number(amount)) {
    return NextResponse.json({
      ok: false,
      message: 'Paid amount does not match'
    }, { status: 400 })
  }

  // 2. Call VTpass API
  const vtRes = await vtpassClient.post('/pay', {
    request_id: generateRequestId(),
    serviceID,
    variation_code,
    phone,
    amount: String(amount)
  })

  // 3. Record transaction
  await db.collection('vtpassTransactions').add({
    request_id: generateRequestId(),
    serviceID,
    amount,
    phone,
    paystackReference,
    response: vtRes.data,
    status: vtRes.data?.code === '000' ? 'completed' : 'failed',
    createdAt: new Date().toISOString()
  })

  return NextResponse.json({
    ok: vtRes.data?.code === '000',
    result: vtRes.data
  })
}
`

/**
 * SUPPORTED SERVICES
 * 
 * 1. Airtime (serviceID: 'airtime')
 *    - Variations: mtn, airtel, glo, etisalat, smile
 *    - Parameters: phone, variation_code, amount
 * 
 * 2. Mobile Data (serviceID: 'data')
 *    - Variations: mtn-1gb, airtel-1gb, etc
 *    - Parameters: phone, variation_code
 * 
 * 3. Electricity (serviceID: 'electricity')
 *    - Biller codes vary by provider (EKEDC, IKEDC, etc)
 *    - Parameters: billersCode, amount, phone
 * 
 * 4. Cable TV (serviceID: 'tv')
 *    - Providers: DStv, GoTV, Startimes
 *    - Parameters: billersCode, subscription_type, amount
 * 
 * 5. Education (serviceID: 'education')
 *    - JAMB, WAEC, NECO exam registrations
 *    - Parameters: amount, variation_code
 */

export const supportedServices = {
  airtime: {
    name: 'Airtime',
    icon: 'phone',
    variations: {
      mtn: { name: 'MTN', code: 'mtn' },
      airtel: { name: 'Airtel', code: 'airtel' },
      glo: { name: 'Glo', code: 'glo' },
      etisalat: { name: 'Etisalat', code: 'etisalat' },
      smile: { name: 'Smile', code: 'smile' },
    },
  },
  data: {
    name: 'Mobile Data',
    icon: 'wifi',
    variations: {
      'mtn-1gb': { name: 'MTN 1GB', code: 'mtn-1gb' },
      'airtel-1gb': { name: 'Airtel 1GB', code: 'airtel-1gb' },
      // ... many more variations
    },
  },
  electricity: {
    name: 'Electricity',
    icon: 'zap',
    providers: [
      { name: 'EKEDC', code: 'ikeja-electric' },
      { name: 'IKEDC', code: 'ikedc' },
      { name: 'AEDC', code: 'abuja-electric' },
      // ... more providers
    ],
  },
  tv: {
    name: 'Cable TV',
    icon: 'tv',
    providers: [
      { name: 'DStv', code: 'dstv' },
      { name: 'GoTV', code: 'gotv' },
      { name: 'Startimes', code: 'startimes' },
    ],
  },
  education: {
    name: 'Education',
    icon: 'book',
    variations: {
      jamb: { name: 'JAMB Registration', code: 'jamb' },
      waec: { name: 'WAEC Registration', code: 'waec' },
      neco: { name: 'NECO Registration', code: 'neco' },
    },
  },
}
