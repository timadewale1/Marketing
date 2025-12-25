#!/usr/bin/env node
// Simple test runner that POSTs to the local Next API withdraw endpoint.
// Usage:
//   API_BASE=http://localhost:3000/api ID_TOKEN=<firebase_id_token> AMOUNT=2500 node tools/integration/run-withdraw-test.js

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api'
const ID_TOKEN = process.env.ID_TOKEN
const AMOUNT = process.env.AMOUNT || '2500'

async function run() {
  if (!ID_TOKEN) {
    console.error('Please provide ID_TOKEN env var (Firebase ID token for a test user)')
    process.exit(1)
  }

  const url = `${API_BASE}/earner/withdraw`
  console.log('POST', url, 'amount=', AMOUNT)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ID_TOKEN}`,
      },
      body: JSON.stringify({ amount: Number(AMOUNT) }),
    })
    const json = await res.json()
    console.log('Status:', res.status)
    console.log('Response:', JSON.stringify(json, null, 2))
    process.exit(res.ok ? 0 : 2)
  } catch (err) {
    console.error('Request failed', err)
    process.exit(2)
  }
}

run()
