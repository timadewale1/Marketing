# Payment & Wallet Integration Documentation

Complete reference documentation for the PAMBA platform's payment processing, wallet management, and withdrawal systems.

This folder contains extracted, organized code examples and integration guides with sensitive information removed.

## Quick Navigation

### 📘 Getting Started
- **[PAYMENT_INTEGRATION_GUIDE.md](PAYMENT_INTEGRATION_GUIDE.md)** - Start here! Complete overview of payment flows, wallet operations, and integration patterns

### 🔧 Core Services

#### Payment Processing
- **[1_PAYSTACK_SERVICE.ts](1_PAYSTACK_SERVICE.ts)** - Paystack API integration (transfers, recipients, webhooks)
- **[2_PAYMENT_VERIFICATION_API.ts](2_PAYMENT_VERIFICATION_API.ts)** - Unified backend payment verification for Paystack & Monnify

#### Payment Modals (Frontend)
- **[3_PAYSTACK_MODAL_COMPONENT.tsx](3_PAYSTACK_MODAL_COMPONENT.tsx)** - Paystack SDK payment modal
- **[4_MONNIFY_MODAL_COMPONENT.tsx](4_MONNIFY_MODAL_COMPONENT.tsx)** - Monnify SDK payment modal
- **[5_PAYMENT_SELECTOR_COMPONENT.tsx](5_PAYMENT_SELECTOR_COMPONENT.tsx)** - Provider selection UI

#### Wallet Management (Frontend)
- **[6_FUND_WALLET_MODAL.tsx](6_FUND_WALLET_MODAL.tsx)** - Wallet funding UI component

#### Wallet Management (Backend)
- **[7_WALLET_SYSTEM.ts](7_WALLET_SYSTEM.ts)** - All wallet operations (balance, transactions, reserved funds)

#### Withdrawals
- **[8_WITHDRAWAL_INTEGRATION.ts](8_WITHDRAWAL_INTEGRATION.ts)** - Backend withdrawal/transfer logic
- **[8_WITHDRAW_DIALOG_COMPONENT.tsx](8_WITHDRAW_DIALOG_COMPONENT.tsx)** - Withdrawal UI component

#### Bill Payments
- **[9_BILL_PAYMENT_INTEGRATION.ts](9_BILL_PAYMENT_INTEGRATION.ts)** - VTpass bill payment (airtime, data, electricity, cable TV)

#### Account Setup
- **[10_BANK_VERIFICATION_ACTIVATION.ts](10_BANK_VERIFICATION_ACTIVATION.ts)** - Bank verification, advertiser activation, earner activation

---

## Architecture Overview

### Payment Flows Supported

1. **Wallet Funding** - User deposits money via Paystack/Monnify
2. **Bill Payments** - User purchases bills/utilities using wallet or Paystack
3. **Campaign Payments** - Advertiser pays for campaigns via Paystack/wallet
4. **Withdrawals** - User withdraws balance to bank account via Paystack
5. **Earnings** - Earner balance updated from referrals/engagement

### Key Concepts

**Wallet Balance**: User's available funds
- Incremented by: Deposits (Paystack/Monnify), Referral earnings
- Decremented by: Bill payments, Campaign payments, Withdrawals

**Reserved Funds**: Temporarily held funds for pending transactions
- Used for: Bill payment processing, Pending transfers
- Released on: Transaction completion or failure

**User Types**: Platform supports two main user types
- **Advertiser**: Funds wallet, pays for campaigns/services
- **Earner**: Earns balance, pays bills, withdraws

**Payment Providers**: Multiple payment gateway integrations
- **Paystack**: Primary payment gateway (payment, transfers, webhooks)
- **Monnify**: Alternative payment gateway (SDK-based integration)
- **VTpass**: Bill payment processor (airtime, data, utilities)

---

## File Organization

### By Technology Stack

**Backend Services (TypeScript/Node.js)**
- `1_PAYSTACK_SERVICE.ts` - API calls
- `2_PAYMENT_VERIFICATION_API.ts` - Route handler
- `7_WALLET_SYSTEM.ts` - Business logic
- `8_WITHDRAWAL_INTEGRATION.ts` - Business logic
- `9_BILL_PAYMENT_INTEGRATION.ts` - Business logic
- `10_BANK_VERIFICATION_ACTIVATION.ts` - Route handlers

**Frontend Components (React/TypeScript)**
- `3_PAYSTACK_MODAL_COMPONENT.tsx` - Modal UI
- `4_MONNIFY_MODAL_COMPONENT.tsx` - Modal UI
- `5_PAYMENT_SELECTOR_COMPONENT.tsx` - Form UI
- `6_FUND_WALLET_MODAL.tsx` - Modal UI
- `8_WITHDRAW_DIALOG_COMPONENT.tsx` - Dialog UI

**Documentation**
- `PAYMENT_INTEGRATION_GUIDE.md` - Architecture & workflows
- `README.md` - This file

### By Business Feature

**User Onboarding**
- `10_BANK_VERIFICATION_ACTIVATION.ts` - Account activation

**Payments**
- `3_PAYSTACK_MODAL_COMPONENT.tsx` - UI
- `4_MONNIFY_MODAL_COMPONENT.tsx` - UI
- `5_PAYMENT_SELECTOR_COMPONENT.tsx` - UI
- `2_PAYMENT_VERIFICATION_API.ts` - Backend
- `1_PAYSTACK_SERVICE.ts` - API integration

**Wallet**
- `6_FUND_WALLET_MODAL.tsx` - Fund UI
- `7_WALLET_SYSTEM.ts` - Operations
- `2_PAYMENT_VERIFICATION_API.ts` - Balance update

**Bills**
- `9_BILL_PAYMENT_INTEGRATION.ts` - Payment processing

**Withdrawals**
- `8_WITHDRAW_DIALOG_COMPONENT.tsx` - UI
- `8_WITHDRAWAL_INTEGRATION.ts` - Backend
- `1_PAYSTACK_SERVICE.ts` - Transfers

---

## Key Integration Points

### 1. Payment Modal Flow
```
PaymentSelector → PaystackModal/MonnifyModal → SDK Callback → verify-payment API → Wallet Update
```

### 2. Wallet Funding Flow
```
FundWalletModal → Payment Provider → Verification → Wallet Balance Increment → Transaction Record
```

### 3. Bill Payment Flow
```
Bill Selection → Payment Method → Reserve Funds → VTpass API → Transaction Record → Balance Update
```

### 4. Withdrawal Flow
```
Withdraw Dialog → Create Transfer Recipient → Paystack Transfer → Deduct Balance → Wait for Webhook
```

---

✅ **Kept for Reference**:
- Integration patterns
- API endpoint structures
- Data validation logic
- Error handling patterns
- Workflow sequences
- Code architecture

---

## Development Notes

### Environment Setup
```bash
# Required environment variables
NEXT_PUBLIC_PAYSTACK_KEY=<sandbox-key>
PAYSTACK_SECRET_KEY=<sandbox-secret>
NEXT_PUBLIC_MONNIFY_CONTRACT_CODE=<test-code>
MONNIFY_API_KEY=<test-key>
VTPASS_USERNAME=<test-username>
VTPASS_PASSWORD=<test-password>
```

### Testing Workflows
- Use Paystack test keys for payment integration
- Use Monnify sandbox contract code for SDK testing
- Use test VTpass credentials for bill payments
- Verify Firestore collections and transactions

### Common Patterns

**Transaction Atomicity**
```typescript
await db.runTransaction(async (t) => {
  // Multiple operations guaranteed atomic
  t.update(...) // Update balance
  t.set(...)    // Create record
})
```

**Error Recovery**
```typescript
if (vtpass.failed) {
  await releaseReservedFunds(...) // Refund on failure
}
```

**Provider-Agnostic Verification**
```typescript
if (provider === 'paystack') {
  // Query Paystack API
} else if (provider === 'monnify') {
  // Trust SDK callback
}
```

---

## Database Schema Reference

### Collections Used

**User Collections**
- `advertisers/{userId}` - Advertiser profiles with balance
- `earners/{userId}` - Earner profiles with balance

**Transaction Collections**
- `advertiserTransactions` - All advertiser transactions
- `earnerTransactions` - All earner transactions
- `vtpassTransactions` - All bill payment transactions

**Withdrawal Collections**
- `advertiserWithdrawals` - Advertiser withdrawal records
- `earnerWithdrawals` - Earner withdrawal records

**Financial Records**
- `campaigns` - Campaign payment records
- `adminNotifications` - Payment-related notifications

---

## API Endpoints

### Payment Verification
```
POST /api/verify-payment
- Handles Paystack & Monnify verification
- Updates wallet balance on success
- Records transaction
```

### Bill Purchase
```
POST /api/bills/buy-service
- Wallet payment: Reserve → VTpass → Commit/Refund
- Paystack payment: Verify → VTpass
```

### Bank Verification
```
POST /api/verify-bank
- Queries Paystack bank resolution
- Validates account details
- Saves to user profile
```

### Withdraw/Transfer
```
POST /api/withdraw
- Creates transfer recipient
- Initiates Paystack transfer
- Deducts from wallet
- Records transaction
```

---

## Performance Metrics

Typical processing times:
- Payment verification: 2-3 seconds
- Wallet update: < 100ms (atomic transaction)
- Bill payment: 5-10 seconds
- Withdrawal initiation: 2-3 seconds
- Bank verification: 1-2 seconds

---

## Support & Maintenance

### Common Issues

| Issue | Solution |
|-------|----------|
| Payment not verifying | Check reference format, verify provider API |
| Wallet not updating | Check Firebase transaction, verify amount |
| Transfer failing | Check bank details, verify Paystack balance |
| Bill payment stuck | Check VTpass status, retry or refund |

### Monitoring Points

- Payment success rates by provider
- Average transaction amount and duration
- Withdrawal processing time
- Failed transaction analysis
- Wallet balance distribution

