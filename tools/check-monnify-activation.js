const fs = require("fs")

function loadEnvFile(path) {
  const env = {}
  const raw = fs.readFileSync(path, "utf8")
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[match[1]] = value
  }
  return env
}

async function main() {
  const query = String(process.argv[2] || "").trim()
  const amount = Number(process.argv[3] || 2000)
  if (!query) {
    throw new Error("Usage: node tools/check-monnify-activation.js <email-or-reference> [amount]")
  }

  const env = loadEnvFile(".env.local")
  const base = env.MONNIFY_BASE_URL
  const auth = Buffer.from(`${env.MONNIFY_API_KEY}:${env.MONNIFY_SECRET_KEY}`).toString("base64")

  const loginRes = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  })

  const loginJson = await loginRes.json().catch(() => ({}))
  if (!loginRes.ok) {
    throw new Error(`Monnify auth failed: ${JSON.stringify(loginJson)}`)
  }

  const token = loginJson?.responseBody?.accessToken
  if (!token) {
    throw new Error("Monnify auth did not return access token")
  }

  if (query.includes("|") || query.startsWith("TX_") || query.startsWith("MNFY")) {
    const byRef = []
    for (const url of [
      `${base}/api/v1/transactions/query?transactionReference=${encodeURIComponent(query)}`,
      `${base}/api/v1/sdk/transactions/query/${env.MONNIFY_CONTRACT_CODE}?transactionReference=${encodeURIComponent(query)}&shouldIncludePaymentSessionInfo=true`,
    ]) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      })
      const json = await res.json().catch(() => ({}))
      byRef.push({ url, status: res.status, body: json })
    }

    console.log(JSON.stringify(byRef, null, 2))
    return
  }

  const email = query.toLowerCase()
  const matches = []
  for (let page = 0; page < 8; page++) {
    const res = await fetch(`${base}/api/v1/transactions/search?page=${page}&size=100`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      matches.push({ page, error: json })
      break
    }

    const body = json.responseBody || {}
    const items = Array.isArray(body.content)
      ? body.content
      : Array.isArray(body.transactions)
        ? body.transactions
        : []

    for (const transaction of items) {
      const customer = transaction.customer || {}
      const txEmail = String(customer.email || "").trim().toLowerCase()
      const txAmount = Number(transaction.amountPaid ?? transaction.amount ?? transaction.totalPayable ?? 0)
      if (txEmail !== email || txAmount !== amount) continue

      matches.push({
        page,
        transactionReference: transaction.transactionReference || null,
        paymentReference: transaction.paymentReference || null,
        reference: transaction.reference || null,
        status: transaction.paymentStatus || transaction.status || null,
        paidOn: transaction.paidOn || transaction.completedOn || transaction.createdOn || null,
        description: transaction.paymentDescription || transaction.description || null,
        customerEmail: txEmail,
        amountPaid: txAmount,
      })
    }

    if (items.length < 100) break
  }

  console.log(JSON.stringify(matches, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
