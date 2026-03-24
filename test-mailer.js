// Smoke test for mailer functionality - simplified version
// This tests the mailer configuration without importing TypeScript

import nodemailer from 'nodemailer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from .env.local
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env.local')
    const envContent = fs.readFileSync(envPath, 'utf8')
    const lines = envContent.split('\n')

    console.log('📄 Loading env file with', lines.length, 'lines')

    for (const line of lines) {
      const trimmed = line.trim()
      console.log('  Line:', JSON.stringify(trimmed))
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=')
        const value = valueParts.join('=')
        process.env[key] = value
        console.log('  Set:', key, '=', value.substring(0, 10) + '...')
      }
    }
    console.log('✅ Environment variables loaded from .env.local')
  } catch (error) {
    console.log('⚠️  Could not load .env.local:', error.message)
  }
}

// Test SMTP configuration - declared after loading
let SMTP_USER, SMTP_PASS, SMTP_FROM

async function testMailer() {
  console.log('🧪 Testing Mailer Configuration')

  // Load env first
  loadEnv()

  // Now check the variables
  SMTP_USER = process.env.SMTP_USER
  SMTP_PASS = process.env.SMTP_PASS
  SMTP_FROM = process.env.SMTP_FROM

  if (!SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    console.error('❌ Missing SMTP configuration:')
    console.error('  SMTP_USER:', SMTP_USER ? '✓' : '✗')
    console.error('  SMTP_PASS:', SMTP_PASS ? '✓' : '✗')
    console.error('  SMTP_FROM:', SMTP_FROM ? '✓' : '✗')
    return
  }

  console.log('✅ SMTP configuration found')

  try {
    // Create transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false
      }
    })

    // Test connection
    await transporter.verify()
    console.log('✅ SMTP connection successful')

    // Send test email
    const mailOptions = {
      from: SMTP_FROM,
      to: 'test@example.com',
      subject: 'Test Email from Pamba',
      html: '<h1>Test Email</h1><p>This is a test email from the Pamba smoke test.</p>',
    }

    const result = await transporter.sendMail(mailOptions)
    console.log('✅ Test email sent successfully')
    console.log('   Message ID:', result.messageId)

  } catch (error) {
    console.error('❌ Mailer test failed:', error.message)
  }
}

testMailer()