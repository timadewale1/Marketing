#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { initializeApp, cert, getApps } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')

function loadEnvFile(filePath) {
  const out = {}
  if (!fs.existsSync(filePath)) return out
  const raw = fs.readFileSync(filePath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

function isPaidStatus(status) {
  const normalized = String(status || '').trim().toUpperCase()
  return ['PAID', 'SUCCESS', 'SUCCESSFUL', 'COMPLETED'].includes(normalized)
}

function extractRefs(data) {
  const set = new Set()
  const rawRefs = []
  if (Array.isArray(data.references)) rawRefs.push(...data.references)
  if (data.reference) rawRefs.push(data.reference)
  if (data.activationReference) rawRefs.push(data.activationReference)
  if (Array.isArray(data.activationReferences)) rawRefs.push(...data.activationReferences)
  for (const value of rawRefs) {
    const ref = String(value || '').trim()
    if (!ref) continue
    set.add(ref)
  }
  return [...set]
}

async function getMonnifyToken(baseUrl, apiKey, secretKey) {
  const auth = Buffer.from(`${apiKey}:${secretKey}`).toString('base64')
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`Monnify auth failed: ${response.status} ${JSON.stringify(json)}`)
  }
  const token = json?.responseBody?.accessToken
  if (!token) throw new Error('Monnify auth did not return access token')
  return token
}

async function verifyReference(baseUrl, token, ref) {
  const encoded = encodeURIComponent(ref)
  const endpoints = [
    `${baseUrl}/api/v2/merchant/transactions/query?paymentReference=${encoded}`,
    `${baseUrl}/api/v2/merchant/transactions/query?transactionReference=${encoded}`,
    `${baseUrl}/api/v1/transactions/query?transactionReference=${encoded}`,
  ]

  for (const url of endpoints) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    const json = await response.json().catch(() => ({}))
    const body = json?.responseBody || {}
    const status = body.paymentStatus || body.status
    if (response.ok && isPaidStatus(status)) {
      return { paid: true, status: String(status || ''), url }
    }
  }
  return { paid: false }
}

async function main() {
  const env = {
    ...loadEnvFile(path.join(process.cwd(), '.env')),
    ...process.env,
  }

  const serviceAccountRaw = firstNonEmpty(env.FIREBASE_SERVICE_ACCOUNT_KEY, env.FIREBASE_SERVICE_ACCOUNT)
  if (!serviceAccountRaw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not found')
  }
  const serviceAccount = JSON.parse(serviceAccountRaw)

  if (getApps().length === 0) {
    initializeApp({ credential: cert(serviceAccount) })
  }
  const db = getFirestore()

  const baseUrl = firstNonEmpty(env.MONNIFY_BASE_URL, 'https://api.monnify.com')
  const apiKey = firstNonEmpty(env.MONNIFY_API_KEY)
  const secretKey = firstNonEmpty(env.MONNIFY_SECRET_KEY)
  if (!apiKey || !secretKey) {
    throw new Error('Missing MONNIFY_API_KEY / MONNIFY_SECRET_KEY in env')
  }

  const token = await getMonnifyToken(baseUrl, apiKey, secretKey)

  const fridayStart = new Date('2026-06-12T00:00:00.000Z')
  const activationsSnap = await db
    .collection('activationAttempts')
    .where('createdAt', '>=', Timestamp.fromDate(fridayStart))
    .orderBy('createdAt', 'desc')
    .get()
  const completedDocs = activationsSnap.docs.filter((doc) => String(doc.data()?.status || '').toLowerCase() === 'completed')

  const unconfirmed = []
  let confirmedCount = 0

  for (const doc of completedDocs) {
    const data = doc.data() || {}
    const userId = String(data.userId || '')
    const role = String(data.role || '')
    const refs = extractRefs(data)
    if (!userId || refs.length === 0) {
      unconfirmed.push({
        activationAttemptId: doc.id,
        userId,
        role,
        references: refs,
        reason: 'missing_reference',
      })
      continue
    }

    let confirmed = false
    for (const ref of refs) {
      const result = await verifyReference(baseUrl, token, ref)
      if (result.paid) {
        confirmed = true
        break
      }
    }

    if (confirmed) {
      confirmedCount += 1
      continue
    }

    const userCollections = role === 'advertiser' ? ['advertisers'] : role === 'earner' ? ['earners'] : ['earners', 'advertisers']
    let profile = null
    for (const col of userCollections) {
      const snap = await db.collection(col).doc(userId).get()
      if (snap.exists) {
        profile = snap.data() || {}
        break
      }
    }

    unconfirmed.push({
      activationAttemptId: doc.id,
      userId,
      role,
      name: firstNonEmpty(profile?.fullName, profile?.name, profile?.businessName, profile?.companyName),
      email: firstNonEmpty(profile?.email, data.email),
      references: refs,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
    })
  }

  const output = {
    from: fridayStart.toISOString(),
    totalCompletedAttempts: completedDocs.length,
    confirmedByMonnify: confirmedCount,
    unconfirmedCount: unconfirmed.length,
    unconfirmed,
  }

  console.log(JSON.stringify(output, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
