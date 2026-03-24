import nodemailer from 'nodemailer'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

const SMTP_SERVICE = process.env.SMTP_SERVICE || 'gmail'
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SMTP_FROM = process.env.SMTP_FROM
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pambaadverts.com'

function getTransporter() {
  if (!SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    console.warn('Mailer not configured: SMTP_USER/SMTP_PASS/SMTP_FROM required')
    return null
  }

  // Allow optional override of host/port/secure for self-managed SMTP or other providers.
  const smtpHost = process.env.SMTP_HOST
  const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined
  const smtpSecure = smtpPort === 465

  if (smtpHost && smtpPort) {
    return nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    })
  }

  return nodemailer.createTransport({
    service: SMTP_SERVICE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  })
}

export async function sendNewTaskEmail({
  email,
  name,
  taskTitle,
  taskId,
}: {
  email: string
  name?: string
  taskTitle: string
  taskId: string
}) {
  const transporter = getTransporter()
  if (!transporter) {
    console.warn('Skipping sendNewTaskEmail; SMTP transporter not available')
    return
  }

  const taskUrl = `${APP_URL}/earner/campaigns/${taskId}`

  const mailOptions = {
    from: SMTP_FROM,
    to: email,
    subject: `New Task on Pamba: ${taskTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111; font-size: 16px;">
        <h2 style="margin-bottom: 0.2rem;">New task created on Pamba</h2>
        <p>Hi ${name ? String(name) : 'there'},</p>
        <p>
          A new task is now live on Pamba: <strong>${taskTitle}</strong>.
          Participate now before it is filled up.
        </p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${taskUrl}" style="background-color: #1d4ed8; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 8px; display: inline-block;">Participate Now</a>
        </p>
        <p style="font-size: 14px; color: #666;">Or copy/paste this link in your browser:</p>
        <p style="font-size: 14px; word-break: break-word;">${taskUrl}</p>
        <p style="color: #666; font-size: 13px; margin-top: 20px;">Thanks for being part of the Pamba community.</p>
      </div>
    `,
  }

  try {
    await transporter.sendMail(mailOptions)
    console.log(`New task email sent to ${email}`)
  } catch (error) {
    console.error(`Failed to send new task email to ${email}:`, error)
  }
}

export async function sendNewTaskNotificationToEarners({
  campaignId,
  campaignTitle,
}: {
  campaignId: string
  campaignTitle: string
}) {
  const { dbAdmin } = await initFirebaseAdmin()
  if (!dbAdmin) {
    console.warn('sendNewTaskNotificationToEarners: dbAdmin unavailable')
    return
  }

  const earnersRef = dbAdmin.collection('earners').where('activated', '==', true)
  const snapshot = await earnersRef.get()
  if (snapshot.empty) {
    console.log('No activated earners found for new task notification')
    return
  }

  await Promise.all(
    snapshot.docs.map(async (doc) => {
      const data = doc.data() as { email?: string; fullName?: string }
      const recipientEmail = data.email
      if (!recipientEmail) return

      try {
        await sendNewTaskEmail({
          email: recipientEmail,
          name: data.fullName,
          taskTitle: campaignTitle,
          taskId: campaignId,
        })
      } catch (err) {
        console.error(`Failed to send new task otp to earner ${doc.id}`, err)
      }
    })
  )
}
