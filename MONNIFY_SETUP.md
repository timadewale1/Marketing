# Monnify Integration Setup Guide

## Environment Variables
Confirm these are set in your `.env` file:
```env
MONNIFY_BASE_URL=https://sandbox.monnify.com
MONNIFY_API_KEY=MK_TEST_9XXA9XNKHD
MONNIFY_SECRET_KEY=EVU3HEH5JQ533SQTGSG64F52N36ATN35
```

## How to Verify Your Monnify API Paths

The Monnify service helper expects 3 API endpoints. Follow these steps to confirm they match your account:

### Step 1: Check Your Monnify Dashboard
1. Log in to your Monnify dashboard: https://sandbox.monnify.com (or https://app.monnify.com for live)
2. Go to **Settings** → **Developers** or **API Keys** section
3. Look for **API Documentation** or **Integration Guide** link
4. Note the exact base URL (e.g., `https://sandbox.monnify.com` or `https://app.monnify.com`)

### Step 2: Verify the Three API Endpoints

The current implementation in `src/services/monnify.ts` uses:

#### **1. Authentication Endpoint**
- **Path:** `/api/v1/auth/login`
- **Full URL:** `{MONNIFY_BASE_URL}/api/v1/auth/login`
- **Method:** POST
- **Body:** `{ apiKey: "...", secret: "..." }`
- **Response:** Should contain `responseBody.accessToken` or `accessToken`

**How to verify:**
```bash
curl -X POST https://sandbox.monnify.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"apiKey\":\"YOUR_API_KEY\",\"secret\":\"YOUR_SECRET_KEY\"}"
```
Expected response should have an `accessToken` field.

#### **2. Transaction Initiation Endpoint**
- **Path:** `/api/v1/transactions/initiate`
- **Full URL:** `{MONNIFY_BASE_URL}/api/v1/transactions/initiate`
- **Method:** POST
- **Headers:** `Authorization: Bearer {token}`, `Content-Type: application/json`
- **Body:** Payment details (amount, email, phone, etc.)

**How to verify:**
```bash
curl -X POST https://sandbox.monnify.com/api/v1/transactions/initiate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "currency": "NGN",
    "email": "test@example.com",
    "customerName": "Test Customer"
  }'
```

#### **3. Transaction Verification Endpoint**
- **Path:** `/api/v1/transactions/{reference}`
- **Full URL:** `{MONNIFY_BASE_URL}/api/v1/transactions/{reference}`
- **Method:** GET
- **Headers:** `Authorization: Bearer {token}`, `Accept: application/json`
- **Response:** Should contain payment status (e.g., `paymentStatus: "PAID"`)

**How to verify:**
```bash
curl -X GET https://sandbox.monnify.com/api/v1/transactions/YOUR_REFERENCE \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Accept: application/json"
```

### Step 3: Check Response Shapes

The code handles multiple response formats. When testing, check:

**Authentication Response:**
```json
{
  "responseBody": {
    "accessToken": "...",
    "expiresIn": 3600
  }
  // or direct fields
  "accessToken": "...",
  "expiresIn": 3600
}
```

**Verification Response:**
```json
{
  "responseBody": {
    "paymentStatus": "PAID",
    "amount": 100
  }
  // or
  "status": "success",
  "paymentStatus": "PAID"
}
```

### Step 4: Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| `401 Unauthorized` on auth | Check API key/secret in `.env` matches dashboard |
| `404 Not Found` | Verify base URL and endpoint paths match Monnify docs |
| `accessToken` not found | Check Monnify response structure in their API docs |
| `paymentStatus` field missing | Verify transaction reference exists and status response format |

### Step 5: If Paths Don't Match

If your Monnify account uses different paths (e.g., `/api/auth/login` instead of `/api/v1/auth/login`):

**Update `src/services/monnify.ts`:**

```typescript
// Line ~45: Change auth path
const authUrl = `${BASE.replace(/\/+$/, '')}/YOUR_AUTH_PATH`

// Line ~74: Change verify path
const verifyUrl = `${BASE.replace(/\/+$/, '')}/YOUR_VERIFY_PATH`

// Line ~82: Change initiate path
const url = `${BASE.replace(/\/+$/, '')}/YOUR_INITIATE_PATH`
```

### Step 6: Test with Payment Selector

Once verified:

1. Go to **Advertiser Wallet** page (`/advertiser/wallet`)
2. Click "Fund Wallet"
3. Select **Monnify** as payment provider
4. Enter test amount (₦100+)
5. You should see Monnify payment window appear

## Live vs Sandbox

**Sandbox Testing (Current Setup)**
- Base URL: `https://sandbox.monnify.com`
- Credentials: Test keys from sandbox dashboard
- No real money charged

**Going Live**
1. Change to live credentials in `.env`:
```env
MONNIFY_BASE_URL=https://app.monnify.com
MONNIFY_API_KEY=MK_LIVE_YOUR_KEY
MONNIFY_SECRET_KEY=YOUR_LIVE_SECRET_KEY
```
2. Re-test all flows
3. Deploy to production

## Support

If endpoints still don't work:
1. Check **Monnify API Documentation** in your dashboard
2. Contact Monnify support with your request logs
3. Verify response format in browser DevTools Network tab
