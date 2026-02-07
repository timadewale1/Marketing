# Payment & Wallet Integration Guide

Complete reference for payment processing, wallet management, and withdrawal systems in the Blessing platform.

## Overview

The platform supports multiple payment methods and provides a complete wallet ecosystem:

- **Payment Providers**: Paystack, Monnify
- **Wallet Types**: Advertiser wallets, Earner wallets
- **Services**: Bill payments, Campaign payments, Wallet funding, Withdrawals

## Quick Start

### 1. Fund Wallet (User)

**Flow**: User → Select Provider (Paystack/Monnify) → Payment Modal → Verification → Wallet Updated

```typescript
// Frontend
<FundWalletModal
  userId={userId}
  userEmail={email}
  open={open}
  onClose={() => setOpen(false)}
  onSuccess={() => refreshBalance()}
/>

// Backend: POST /api/verify-payment
// Receives payment reference from Paystack or Monnify
// Verifies with provider API
// Updates wallet balance in Firestore
// Records transaction
```

**Files**:
- [3_PAYSTACK_MODAL_COMPONENT.tsx](3_PAYSTACK_MODAL_COMPONENT.tsx) - Paystack SDK integration
- [4_MONNIFY_MODAL_COMPONENT.tsx](4_MONNIFY_MODAL_COMPONENT.tsx) - Monnify SDK integration
- [5_PAYMENT_SELECTOR_COMPONENT.tsx](5_PAYMENT_SELECTOR_COMPONENT.tsx) - Provider selection UI
- [6_FUND_WALLET_MODAL.tsx](6_FUND_WALLET_MODAL.tsx) - Wallet funding UI + verification
- [2_PAYMENT_VERIFICATION_API.ts](2_PAYMENT_VERIFICATION_API.ts) - Backend verification

### 2. Pay for Bills/Services (User)

**Flow**: User → Select Service → Select Provider (Wallet/Paystack) → Payment → VTpass Processing

```typescript
// POST /api/bills/buy-service
{
  "serviceID": "airtime",
  "provider": "wallet",
  "amount": 1000,
  "phone": "08012345678",
  "variation_code": "mtn",
  "payFromWallet": true
}
```

**Files**:
- [9_BILL_PAYMENT_INTEGRATION.ts](9_BILL_PAYMENT_INTEGRATION.ts) - Wallet & Paystack bill payment

### 3. Withdraw Funds (User)

**Flow**: User → Enter Amount → Select Bank Account → Paystack Transfer → Complete

```typescript
// Frontend
<WithdrawDialog
  open={open}
  onClose={() => setOpen(false)}
  onSubmit={(amount) => handleWithdraw(amount)}
  maxAmount={walletBalance}
  bankDetails={userBankDetails}
/>

// Backend: POST /api/withdraw
// Creates Paystack transfer recipient
// Initiates transfer (amount - 10% fee)
// Records withdrawal transaction
// Deducts from wallet
```

**Files**:
- [8_WITHDRAW_DIALOG_COMPONENT.tsx](8_WITHDRAW_DIALOG_COMPONENT.tsx) - Withdrawal UI
- [8_WITHDRAWAL_INTEGRATION.ts](8_WITHDRAWAL_INTEGRATION.ts) - Backend withdrawal logic

### 4. Manage Wallet Balance

**Operations**:
- Get balance: `getWalletBalance(userId, userType)`
- Increment (fund): `incrementWalletBalance(userId, userType, amount, reference, provider)`
- Deduct (bill pay): `deductWalletBalance(userId, userType, amount, description)`
- Reserve (pending): `reserveWalletFunds(userId, userType, amount, reason)`
- Release (refund): `releaseReservedFunds(userId, userType, amount, reason)`

**Files**:
- [7_WALLET_SYSTEM.ts](7_WALLET_SYSTEM.ts) - All wallet operations

## Architecture

### Payment Flow Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    PAYMENT ENTRY POINTS                 │
├─────────────────────────────────────────────────────────┤
│ • Fund Wallet Modal      → Paystack/Monnify SDK         │
│ • Bill Payment           → Paystack/Wallet              │
│ • Campaign Creation      → Paystack/Wallet              │
│ • Withdrawal Request     → Paystack Transfer            │
└────────────┬────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────┐
│              PAYMENT VERIFICATION (Backend)              │
├─────────────────────────────────────────────────────────┤
│ • Paystack: Query API with reference                    │
│ • Monnify: Trust SDK callback                           │
│ • Check: Amount matches, Status success                 │
└────────────┬────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────┐
│              WALLET & TRANSACTION MANAGEMENT             │
├─────────────────────────────────────────────────────────┤
│ Firestore Collections:                                   │
│ • advertisers/{userId} - balance, reserved              │
│ • earners/{userId}     - balance, reserved              │
│ • advertiserTransactions - all transactions             │
│ • earnerTransactions     - all transactions             │
│ • advertiserWithdrawals - withdrawal records            │
│ • earnerWithdrawals     - withdrawal records            │
└─────────────────────────────────────────────────────────┘
```

### User Types

**Advertisers**:
- Fund wallet via Paystack/Monnify
- Pay for campaigns
- Pay for ads/placements
- Withdraw balance to bank

**Earners**:
- Earn balance from engagement/referrals
- Pay bills from wallet
- Withdraw balance to bank

## Environment Variables

```env
# Paystack (Public & Secret Keys)
NEXT_PUBLIC_PAYSTACK_KEY=<public-key>
PAYSTACK_SECRET_KEY=<secret-key>

# Monnify
NEXT_PUBLIC_MONNIFY_CONTRACT_CODE=<contract-code>
MONNIFY_API_KEY=<api-key>

# VTpass (Bill Payments)
VTPASS_USERNAME=<username>
VTPASS_PASSWORD=<password>
```

## File Reference

| File | Purpose | Type |
|------|---------|------|
| [1_PAYSTACK_SERVICE.ts](1_PAYSTACK_SERVICE.ts) | Core Paystack API operations | Service |
| [2_PAYMENT_VERIFICATION_API.ts](2_PAYMENT_VERIFICATION_API.ts) | Unified payment verification endpoint | API Route |
| [3_PAYSTACK_MODAL_COMPONENT.tsx](3_PAYSTACK_MODAL_COMPONENT.tsx) | Paystack payment modal UI | Component |
| [4_MONNIFY_MODAL_COMPONENT.tsx](4_MONNIFY_MODAL_COMPONENT.tsx) | Monnify payment modal UI | Component |
| [5_PAYMENT_SELECTOR_COMPONENT.tsx](5_PAYMENT_SELECTOR_COMPONENT.tsx) | Provider selection UI | Component |
| [6_FUND_WALLET_MODAL.tsx](6_FUND_WALLET_MODAL.tsx) | Wallet funding UI | Component |
| [7_WALLET_SYSTEM.ts](7_WALLET_SYSTEM.ts) | Wallet balance management | Service |
| [8_WITHDRAWAL_INTEGRATION.ts](8_WITHDRAWAL_INTEGRATION.ts) | Withdrawal backend logic | Service |
| [8_WITHDRAW_DIALOG_COMPONENT.tsx](8_WITHDRAW_DIALOG_COMPONENT.tsx) | Withdrawal UI | Component |
| [9_BILL_PAYMENT_INTEGRATION.ts](9_BILL_PAYMENT_INTEGRATION.ts) | Bill payment processing | Service |

## Payment Verification Logic

### Paystack Verification

```typescript
// 1. Get payment reference from SDK callback
const reference = response.reference

// 2. Verify with Paystack API
const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
  headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
})

const data = await res.json()

// 3. Check conditions
if (data.data.status !== 'success') throw new Error('Payment failed')
if (data.data.amount / 100 < expectedAmount) throw new Error('Amount mismatch')

// 4. Record and update wallet
await recordTransaction(...)
await updateWalletBalance(...)
```

### Monnify Verification

```typescript
// 1. Trust SDK onComplete callback
// If callback is triggered, payment succeeded
const onComplete = (response) => {
  // Response contains:
  // - transactionReference
  // - paymentReference
  // - paidOn
  // - metadata
  
  // 2. No backend verification needed
  // SDK already validated the payment
  
  // 3. Record and update wallet
  await recordTransaction(response)
  await updateWalletBalance(response.transactionReference)
}
```

## Reserved Funds Pattern

For operations that may fail (like bill payments), funds are "reserved":

```
Available Balance = Total Balance - Reserved
```

**Example Flow**:
```
1. User has ₦5,000
2. User pays ₦1,000 bill using wallet
3. ₦1,000 reserved, available = ₦4,000
4. If bill payment succeeds: keep reserved
5. If bill payment fails: release reserved, available = ₦5,000
```

## Common Workflows

### Workflow 1: New User Funds Wallet

```
1. User clicks "Fund Wallet"
2. Modal appears with Paystack/Monnify options
3. User selects provider
4. Payment modal opens
5. User completes payment
6. SDK returns reference/response
7. Frontend sends to /api/verify-payment
8. Backend verifies with provider
9. Wallet balance incremented
10. Transaction recorded
11. User sees confirmation
```

### Workflow 2: User Withdraws

```
1. User enters withdrawal amount (min ₦2,000)
2. System shows 10% fee and net amount
3. Backend creates Paystack recipient for bank account
4. Paystack initiates transfer to recipient
5. ₦(Amount + Fee) deducted from wallet
6. Transaction marked 'processing'
7. Paystack webhook on completion
8. Transaction marked 'completed'
9. User sees transaction in history
```

### Workflow 3: Bill Payment from Wallet

```
1. User selects bill service (airtime, data, etc)
2. User enters amount and details (phone, etc)
3. Backend reserves amount from wallet
4. Backend calls VTpass API
5. If VTpass succeeds:
   a. Transaction marked 'completed'
   b. Reserved amount stays deducted
6. If VTpass fails:
   a. Reserved amount refunded to wallet
   b. Transaction marked 'failed'
   c. Error shown to user
```

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Insufficient balance" | Not enough funds | Fund wallet first |
| "Payment verification failed" | Invalid reference | Complete payment again |
| "Transfer failed" | Paystack API error | Retry withdrawal |
| "VTpass purchase failed" | Service unavailable | Retry or select different service |
| "Invalid ID token" | Auth token expired | Re-authenticate |

### Error Recovery

```typescript
// Wallet deduction fails -> Refund
if (vtpass.failed) {
  await releaseReservedFunds(userId, userType, amount)
}

// Withdrawal fails -> Refund
if (paystack.transfer.failed) {
  await updateWalletBalance(userId, userType, +(amount + fee))
}

// Payment verification fails -> No wallet update
if (provider.verification.failed) {
  // Do nothing - wallet stays unchanged
}
```

## Security Considerations

1. **Always verify payments server-side** before updating wallet
2. **Never trust client-provided amounts** - always check with provider API
3. **Use Firebase transactions** for atomicity (balance + transaction record)
4. **Validate ID tokens** for authenticated requests
5. **Use webhook signatures** to verify Paystack/Monnify webhooks (HMAC-SHA512)
6. **Never log sensitive data** (API keys, full account numbers)

## Testing

### Fund Wallet Test Flow

```bash
1. Use test Paystack keys
2. Use test Monnify contract code
3. Complete payment in test mode
4. Verify transaction records in Firestore
5. Check wallet balance updated
```

### Bill Payment Test Flow

```bash
1. Use test VTpass credentials
2. Select bill service
3. Use wallet payment
4. Verify balance deducted and transaction recorded
5. Check VTpass transaction collection
```

### Withdrawal Test Flow

```bash
1. Fund wallet with test payment
2. Add test bank account
3. Initiate withdrawal
4. Verify transaction created
5. Check webhook handling on completion
```

## Performance Notes

- Payment verification ~2-3s (network request to Paystack)
- Wallet updates use atomic transactions (< 100ms)
- Bill payment ~5-10s (Paystack verification + VTpass API)
- Withdrawal ~2-3s (Paystack transfer API call)

## Monitoring

**Key Metrics to Track**:
- Payment success rate by provider
- Average transaction amount
- Bill payment service reliability
- Withdrawal processing time
- Failed transaction reasons
- Wallet balance distribution

**Logging**:
- All payment verifications
- All wallet balance updates
- All transaction creations
- All provider API calls
- All errors and failures

---

**Last Updated**: 2026
**Version**: 1.0
