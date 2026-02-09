# Monnify Webhook Configuration

This guide explains how to configure Monnify webhooks in the dashboard.

## Webhook Endpoints Created

All webhook endpoints have been created and are ready to receive notifications:

1. **Disbursement Webhook** → `https://yourdomain.com/api/webhooks/monnify/disbursement`
   - Handles withdrawal/disbursement status updates
   - Updates withdrawal records in Firestore
   - Creates success/failure notifications
   - Restores balance if disbursement fails

2. **Transaction Completion Webhook** → `https://yourdomain.com/api/webhooks/monnify/transaction`
   - Handles payment completion events
   - Logs for audit purposes

3. **Refund Completion Webhook** → `https://yourdomain.com/api/webhooks/monnify/refund`
   - Handles refund events
   - Stores refund records in Firestore

4. **Settlement Webhook** → `https://yourdomain.com/api/webhooks/monnify/settlement`
   - Handles settlement notifications
   - Logs settlement records

5. **Wallet Activity Webhook** → `https://yourdomain.com/api/webhooks/monnify/wallet-activity`
   - Logs all wallet activities

6. **Low Balance Notification Webhook** → `https://yourdomain.com/api/webhooks/monnify/low-balance`
   - Alerts on low wallet balance
   - Notifies admins

## Setup Instructions

### Step 1: Get Your Live Domain
Replace `https://yourdomain.com` with your actual production domain (or ngrok URL for testing).

### Step 2: Configure Webhooks in Monnify Dashboard

1. Log in to [Monnify Dashboard](https://app.monnify.com)
2. Navigate to **Settings** → **Webhooks**
3. For each webhook type below, click **Add Webhook**:

#### Add Each Webhook:

| Event Type | Endpoint URL | Required |
|-----------|-----------|----------|
| **Disbursement** | `https://yourdomain.com/api/webhooks/monnify/disbursement` | ✅ YES |
| **Transaction Completion** | `https://yourdomain.com/api/webhooks/monnify/transaction` | Optional |
| **Refund Completion** | `https://yourdomain.com/api/webhooks/monnify/refund` | Optional |
| **Settlement** | `https://yourdomain.com/api/webhooks/monnify/settlement` | Optional |
| **Wallet Activity Notification** | `https://yourdomain.com/api/webhooks/monnify/wallet-activity` | Optional |
| **Low Balance Notification** | `https://yourdomain.com/api/webhooks/monnify/low-balance` | Optional |

### Step 3: Test Webhooks

Use the "Test" button in Monnify dashboard to send test payloads to each endpoint.

You should see in your server logs:
```
[webhook][monnify][disbursement] received event {
  eventType: 'DISBURSEMENT',
  reference: 'xxx',
  status: 'SUCCESSFUL'
}
```

## Webhook Security

All webhooks verify the signature from Monnify using:
- **Algorithm**: HMAC SHA-512
- **Secret**: Your `MONNIFY_SECRET_KEY` from `.env`
- **Header**: `monnify-signature`

The signature is automatically verified in each webhook handler.

## Webhook Events & Actions

### Disbursement Webhook (Most Important)
When a disbursement is made, Monnify sends updates:

**Event Data:**
```json
{
  "reference": "WITHDRAWAL_ID",
  "status": "SUCCESSFUL|PENDING|FAILED",
  "amount": 50000,
  "destinationBankName": "Zenith Bank",
  "transactionReference": "TXN_REF_123"
}
```

**Actions Taken:**
- ✅ **SUCCESSFUL**: Updates withdrawal status to "completed", creates success notification
- ⏳ **PENDING**: Updates withdrawal status to "pending"
- ❌ **FAILED**: Updates withdrawal status to "failed", restores user balance, creates failure notification

### Transaction Completion Webhook
Receives payment confirmations from the Monnify SDK.

### Refund Completion Webhook
Receives refund notifications and stores them in the `refunds` collection.

### Settlement Webhook
Receives settlement notifications when funds are settled to your merchant account.

### Wallet Activity Webhook
Logs all wallet activities (deposits, transfers, etc.).

### Low Balance Notification Webhook
Alerts when wallet balance falls below configured threshold and notifies admins.

## Testing Locally with Ngrok

To test webhooks locally:

```bash
# Start ngrok tunnel (if not already running)
ngrok http 3000

# You'll get a URL like: https://abc123.ngrok.io

# Use in Monnify dashboard:
# https://abc123.ngrok.io/api/webhooks/monnify/disbursement
```

## Firestore Collections Created

The webhooks create/update these Firestore collections:

- `withdrawals` - Updated with withdrawal status (existing)
- `notifications` - Created for success/failure alerts
- `refunds` - Stores refund records
- `settlements` - Stores settlement records
- `wallet_activities` - Logs wallet activities
- `alerts` - Stores low balance alerts

## Debugging

Check server logs for webhook activity:

```
[webhook][monnify][disbursement] received event
[webhook][monnify][disbursement] processing disbursement
[webhook][monnify][disbursement] updated withdrawal [doc_id]
```

If webhooks aren't working:
1. Verify endpoint URL is publicly accessible
2. Check `MONNIFY_SECRET_KEY` is correct in `.env`
3. Verify signature validation isn't failing
4. Check server logs for errors

## Webhook Retry Logic

Monnify will retry failed webhooks multiple times. Your webhook handlers should be idempotent (safe to run multiple times).

All handlers are already idempotent - they find the withdrawal by reference and update it, so duplicate webhook calls won't create duplicate records.
