#!/usr/bin/env node
// Simple mock Paystack server for local integration testing
import http from 'http'

const port = process.env.MOCK_PAYSTACK_PORT || 4000

const routes = {
  '/transferrecipient': (req, res) => {
    const resp = {
      status: true,
      message: 'Recipient created',
      data: {
        recipient_code: 'RCP_MOCK_12345',
      },
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(resp))
  },
  '/transfer': (req, res) => {
    const resp = {
      status: true,
      message: 'Transfer queued',
      data: {
        id: 'TRF_MOCK_12345',
        reference: 'REF_MOCK_12345',
        status: 'success',
      },
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(resp))
  },
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(404)
    return res.end('Not found')
  }

  const url = new URL(req.url, `http://localhost:${port}`)
  const handler = routes[url.pathname]
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    if (handler) return handler(req, res)
    res.writeHead(404)
    res.end(JSON.stringify({ status: false, message: 'Not implemented in mock', path: url.pathname }))
  })
})

server.listen(port, () => {
  console.log(`Mock Paystack server listening on http://localhost:${port}`)
  console.log('Endpoints: POST /transferrecipient  POST /transfer')
})

// Graceful shutdown
process.on('SIGINT', () => process.exit())
process.on('SIGTERM', () => process.exit())
