# Monnify & Payment Testing Checklist

## Pre-Test Verification ✅
- [ ] `.env` file has `MONNIFY_BASE_URL=https://sandbox.monnify.com`
- [ ] `.env` file has `MONNIFY_API_KEY` and `MONNIFY_SECRET_KEY` set
- [ ] Run `npm run dev` (or `yarn dev`) to start the dev server
- [ ] No TypeScript/build errors in console

## Paystack Tests (Should Still Work)
- [ ] **Wallet Funding - Paystack**
  - [ ] Go to `/advertiser/wallet`
  - [ ] Click "Fund Wallet"
  - [ ] Select "Paystack" provider
  - [ ] Enter ₦500+
  - [ ] See Paystack payment form
  - [ ] Complete test payment (use test card: `4111111111111111`, any future date, any CVC)
  - [ ] Verify success toast appears and redirects

- [ ] **Campaign Creation - Paystack**
  - [ ] Go to `/advertiser/create-campaign`
  - [ ] Fill campaign details
  - [ ] Set budget (₦500+)
  - [ ] Click "Review & Pay"
  - [ ] Click payment button
  - [ ] Select "Paystack"
  - [ ] Complete payment → should create campaign

## Monnify Tests (New Functionality)
- [ ] **Wallet Funding - Monnify**
  - [ ] Go to `/advertiser/wallet`
  - [ ] Click "Fund Wallet"
  - [ ] Select "Monnify" provider ← **New**
  - [ ] Enter ₦500+
  - [ ] Should see Monnify payment form (NOT Paystack)
  - [ ] Check browser DevTools → Network tab
    - [ ] POST to `/api/monnify/initiate` should succeed (200)
    - [ ] Response should have `transactionReference`
  - [ ] Complete Monnify payment
  - [ ] Success toast & redirect confirm verification worked

- [ ] **Campaign Creation - Monnify**
  - [ ] Go to `/advertiser/create-campaign`
  - [ ] Fill campaign details & set budget
  - [ ] Click payment button
  - [ ] Select "Monnify" provider ← **New**
  - [ ] See Monnify payment form
  - [ ] Complete payment → campaign created

- [ ] **Bills - All Types (Monnify)**
  - [ ] `/bills/airtime` → Pay with Monnify ← **New**
  - [ ] `/bills/data` → Pay with Monnify ← **New**
  - [ ] `/bills/electricity` → Pay with Monnify ← **New**
  - [ ] `/bills/education` → Pay with Monnify ← **New**
  - [ ] `/bills/tv` → Pay with Monnify ← **New**

## Provider Selector UI Tests
- [ ] **Payment Selector Modal Appears**
  - [ ] When initiating payment, dialog shows with amount
  - [ ] "Paystack" button is clickable
  - [ ] "Monnify" button is clickable
  - [ ] Provider highlights when selected
  - [ ] "Cancel" closes modal

## Edge Cases
- [ ] **Invalid Amount**
  - [ ] Enter ₦0 or negative → button disabled
  - [ ] Enter ₦1000000 → payment initiates (no hard limit)

- [ ] **Network Error Handling**
  - [ ] Disable internet during payment → see error toast
  - [ ] Verify "Failed to verify payment" message appears

- [ ] **Payment Cancelled**
  - [ ] Start payment with Monnify
  - [ ] Close payment window (don't complete)
  - [ ] Modal should close gracefully
  - [ ] No error toast (normal cancel)

## Admin Verification (Optional)
- [ ] Admin can see transactions with provider info
- [ ] Admin can verify payments from either provider

## Debugging if Issues Occur

### Monnify Payment Window Doesn't Appear
1. **Check Network Tab:**
   - Did POST to `/api/monnify/initiate` succeed?
   - Is response valid JSON with data?
2. **Check Console Errors:**
   - Any auth errors?
   - Missing Monnify SDK?
3. **Verify Env Vars:**
   ```bash
   echo $MONNIFY_BASE_URL
   echo $MONNIFY_API_KEY
   ```

### Payment Verification Fails
1. **Server Logs:**
   - Check terminal running `npm run dev`
   - Look for errors in `/api/verify-payment`
2. **Check `.env`:**
   - Are keys correct?
   - Did you restart dev server after changing `.env`?

### Error: "Failed to load payment provider"
- **Solution:** Check browser console for network errors
- **Likely cause:** Monnify API endpoint paths don't match your account

---

## After All Tests Pass ✅
- [ ] Both Paystack and Monnify work for all payment flows
- [ ] Provider selector UI works smoothly
- [ ] No console errors
- [ ] Ready for production deployment
