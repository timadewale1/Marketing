// /*
//   Minimal test script to call the withdraw endpoint.
//   Usage (set env vars then run via ts-node or compile to JS):
//     - API_BASE: base URL of your app (e.g. http://localhost:3000)
//     - ID_TOKEN: Firebase ID token for the user (auth token)
//     - AMOUNT: amount to withdraw (number)

//   Example:
//     $env:API_BASE="http://localhost:3000"
//     $env:ID_TOKEN="eyJ..."
//     $env:AMOUNT="2500"
//     npx ts-node tools/test-withdraw.ts
// */

// import fetch from 'node-fetch'

// async function main() {
//   const API_BASE = process.env.API_BASE || 'http://localhost:3000'
//   const ID_TOKEN = process.env.ID_TOKEN
//   const AMOUNT = Number(process.env.AMOUNT || '2500')

//   if (!ID_TOKEN) {
//     console.error('Please set ID_TOKEN env var (Firebase ID token)')
//     process.exit(1)
//   }

//   const res = await fetch(`${API_BASE}/api/earner/withdraw`, {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       'Authorization': `Bearer ${ID_TOKEN}`,
//     },
//     body: JSON.stringify({ amount: AMOUNT }),
//   })

//   const data = await res.json().catch(() => null)
//   console.log('status', res.status)
//   console.log('response', data)
// }

// main().catch((e) => console.error(e))
