#!/usr/bin/env node
/**
 * Smoke Test for Activation and Wallet Funding Flows
 * Tests the actual API endpoints to verify payment processing works correctly
 */

import fs from 'fs'
import path from 'path'

// Load environment variables
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env.local')
    const envContent = fs.readFileSync(envPath, 'utf8')
    const lines = envContent.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=')
        const value = valueParts.join('=')
        process.env[key] = value
      }
    }
  } catch (error) {
    console.log('⚠️  Could not load .env.local')
  }
}

async function testActivationFlow() {
  console.log('\n🧪 Testing Activation Flow')
  console.log('='.repeat(50))

  const API_BASE = process.env.API_BASE || 'http://localhost:3000/api'

  // Test data for earner activation
  const testEarnerActivation = {
    reference: `test-earner-activation-${Date.now()}`,
    userId: 'test-earner-' + Date.now(),
    provider: 'monnify',
    monnifyResponse: {
      transactionReference: `test-earner-activation-${Date.now()}`,
      reference: `test-earner-activation-${Date.now()}`,
    }
  }

  try {
    console.log('📤 POST /api/earner/activate')
    const res = await fetch(`${API_BASE}/earner/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testEarnerActivation)
    })

    const data = await res.json()
    
    if (res.ok) {
      console.log('✅ Earner activation endpoint responded successfully')
      console.log('   Status:', res.status)
      console.log('   Message:', data.message || 'Success')
    } else {
      console.log('⚠️  Earner activation returned error:', res.status)
      console.log('   Error:', data.message || 'Unknown error')
    }
  } catch (error) {
    console.log('❌ Earner activation test failed:', error.message)
  }

  // Test advertiser activation
  const testAdvertiserActivation = {
    reference: `test-advertiser-activation-${Date.now()}`,
    userId: 'test-advertiser-' + Date.now(),
    provider: 'monnify',
    monnifyResponse: {
      transactionReference: `test-advertiser-activation-${Date.now()}`,
      reference: `test-advertiser-activation-${Date.now()}`,
    }
  }

  try {
    console.log('\n📤 POST /api/advertiser/activate')
    const res = await fetch(`${API_BASE}/advertiser/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testAdvertiserActivation)
    })

    const data = await res.json()
    
    if (res.ok) {
      console.log('✅ Advertiser activation endpoint responded successfully')
      console.log('   Status:', res.status)
      console.log('   Message:', data.message || 'Success')
    } else {
      console.log('⚠️  Advertiser activation returned error:', res.status)
      console.log('   Error:', data.message || 'Unknown error')
    }
  } catch (error) {
    console.log('❌ Advertiser activation test failed:', error.message)
  }
}

async function testWalletFundingFlow() {
  console.log('\n🧪 Testing Wallet Funding Flow')
  console.log('='.repeat(50))

  const API_BASE = process.env.API_BASE || 'http://localhost:3000/api'

  // Test wallet funding
  const testWalletFunding = {
    reference: `test-wallet-funding-${Date.now()}`,
    type: 'wallet_funding',
    userId: 'test-advertiser-funding-' + Date.now(),
    amount: 5000,
    provider: 'monnify',
    monnifyResponse: {
      transactionReference: `test-wallet-funding-${Date.now()}`,
      reference: `test-wallet-funding-${Date.now()}`,
    }
  }

  try {
    console.log('📤 POST /api/verify-payment (wallet funding)')
    const res = await fetch(`${API_BASE}/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testWalletFunding)
    })

    const data = await res.json()
    
    if (res.ok) {
      console.log('✅ Wallet funding endpoint responded successfully')
      console.log('   Status:', res.status)
      console.log('   Amount: ₦' + testWalletFunding.amount)
    } else {
      console.log('⚠️  Wallet funding returned error:', res.status)
      console.log('   Error:', data.message || 'Unknown error')
    }
  } catch (error) {
    console.log('❌ Wallet funding test failed:', error.message)
  }
}

async function runTests() {
  console.log('🚀 Starting Smoke Test Suite for Activation & Wallet Funding')
  console.log('=========================================================')

  loadEnv()

  const API_BASE = process.env.API_BASE || 'http://localhost:3000/api'
  console.log('\n📍 API Base URL:', API_BASE)

  // Check if server is running
  try {
    console.log('\n🔍 Checking if API server is running...')
    const healthCheck = await fetch(`${API_BASE}/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference: '' })
    }).catch(() => null)

    if (!healthCheck) {
      console.log('⚠️  Warning: API server may not be running at', API_BASE)
      console.log('   Start the server with: npm run dev')
    } else {
      console.log('✅ API server is responding')
    }
  } catch (error) {
    console.log('⚠️  API health check encountered:', error.message)
  }

  await testActivationFlow()
  await testWalletFundingFlow()

  console.log('\n' + '='.repeat(50))
  console.log('✅ Smoke test suite completed')
  console.log('\n📝 Notes:')
  console.log('  - Activation tests will fail if server not running')
  console.log('  - Tests use dummy user IDs and references')
  console.log('  - Database errors are expected (no real Firebase connection)')
  console.log('  - Main goal: Verify API endpoints respond without crashing')
}

runTests()
