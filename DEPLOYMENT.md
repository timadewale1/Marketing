# Deployment & Local Integration Test Guide

This file explains how to run local integration tests (Firestore emulator + Paystack mock) and how to deploy the Firebase Functions and Next.js site.

## Quick overview
- Run Firestore & Auth emulators (recommended) for safe testing.
- Run the mock Paystack server included in `tools/integration/mock-paystack.js`.
- Start Next dev with `PAYSTACK_BASE_URL` pointed at the mock and `PAYSTACK_SECRET_KEY` set to any value (mock doesn't check it).
- Run `tools/integration/run-withdraw-test.js` with a valid Firebase ID token for a test user.

## Local test steps (PowerShell)

# 1) Start the Firestore + Auth emulator
# From the project root, open a terminal and run:
```powershell
# Install firebase-tools if you don't have it
npx firebase-tools@latest emulators:start --only firestore,auth
```

# 2) Start the mock Paystack server
```powershell
node tools/integration/mock-paystack.js
# by default it listens on http://localhost:4000
```

# 3) Start Next in dev mode with the mock Paystack base URL
```powershell
$env:PAYSTACK_BASE_URL = 'http://localhost:4000';
$env:PAYSTACK_SECRET_KEY = 'sk_test_mock';
npm run dev
```

# 4) Obtain a Firebase ID token for a test user
# You can create a test user and mint a custom token via the Admin SDK, or use the client app to sign in and call `getIdToken()`.

# Example: mint a custom token using a small Node script (requires service account creds). Save it to a file and exchange for ID token. See Firebase docs.

# 5) Run the test runner
```powershell
API_BASE=http://localhost:3000/api; $env:ID_TOKEN='<your_id_token>'; $env:AMOUNT='2500'; node tools/integration/run-withdraw-test.js
```

## Notes about Paystack and transfers
- The mock server returns a deterministic `recipient_code` and a successful `transfer` response. Use this to validate the app logic without hitting Paystack.
- For end-to-end using real Paystack, ensure your `PAYSTACK_SECRET_KEY` is the live secret and that transfers are enabled for your account.

## Deploying Firebase Functions

1. Build functions (if TypeScript):
```powershell
cd functions
npm install
npm run build   # if you have a build step
cd ..
```

2. Set production env vars for functions:
```powershell
firebase functions:config:set paystack.secret="<PAYSTACK_SECRET_KEY>"
# or set them in your CI/env as needed. Alternatively, set process.env directly in your hosting provider.
```

3. Deploy functions only:
```powershell
firebase deploy --only functions
```

4. Deploy the Next.js app (Vercel or Firebase Hosting):
- If using Vercel, connect the repo and set env vars in the Vercel dashboard.
- If using Firebase Hosting + Functions (Next.js SSR), follow the official Next.js + Firebase guide.

## Post-deploy verification
1. Verify scheduled functions are enabled and running in Cloud Functions > Logs.
2. Create a test earner and top up a test balance.
3. Trigger a withdraw via the client and verify the transfer status in Paystack dashboard and Firestore records.

If you want, I can: add automated CI workflows (GitHub Actions) to run the emulator + tests, or create richer mocks (webhook simulation). Tell me which next.
