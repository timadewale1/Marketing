import nodemailer from 'nodemailer'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

const SMTP_SERVICE = process.env.SMTP_SERVICE || 'gmail'
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SMTP_FROM = process.env.SMTP_FROM
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pambaadverts.com'
const ADMIN_INBOX_EMAIL = process.env.ADMIN_INBOX_EMAIL || 'pambaadverts@gmail.com'

let transporterPromise: Promise<nodemailer.Transporter | null> | null = null

async function getTransporter() {
  if (transporterPromise) return transporterPromise

  transporterPromise = (async () => {
    if (!SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
      console.warn('Mailer not configured: SMTP_USER/SMTP_PASS/SMTP_FROM required')
      return null
    }

    const smtpHost = process.env.SMTP_HOST
    const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined
    const smtpSecure = smtpPort === 465

    const transporter = smtpHost && smtpPort
      ? nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          auth: {
            user: SMTP_USER,
            pass: SMTP_PASS,
          },
        })
      : nodemailer.createTransport({
          service: SMTP_SERVICE,
          auth: {
            user: SMTP_USER,
            pass: SMTP_PASS,
          },
        })

    try {
      await transporter.verify()
      console.log('SMTP transporter verified successfully')
    } catch (error) {
      console.error('SMTP transporter verification failed:', error)
    }

    return transporter
  })()

  return transporterPromise
}

async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}) {
  const transporter = await getTransporter()
  if (!transporter) {
    throw new Error('SMTP transporter not available')
  }

  return transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject,
    html,
  })
}

export async function sendEmailsInBatches<T>(
  items: T[],
  sender: (item: T) => Promise<void>,
  chunkSize = 20
) {
  const errors: Array<{ item: T; error: unknown }> = []

  for (let index = 0; index < items.length; index += chunkSize) {
    const chunk = items.slice(index, index + chunkSize)
    const results = await Promise.allSettled(chunk.map((item) => sender(item)))
    results.forEach((result, chunkIndex) => {
      if (result.status === 'rejected') {
        errors.push({ item: chunk[chunkIndex], error: result.reason })
      }
    })
  }

  return errors
}

function wrapEmail(title: string, body: string, ctaLabel?: string, ctaUrl?: string) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; background: #f8fafc; padding: 24px;">
      <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb;">
        <div style="background: linear-gradient(135deg, #f59e0b, #92400e); padding: 24px 28px; color: #ffffff;">
          <div style="font-size: 12px; letter-spacing: 0.3em; text-transform: uppercase; opacity: 0.9;">Pamba</div>
          <h1 style="margin: 10px 0 0; font-size: 24px;">${title}</h1>
        </div>
        <div style="padding: 28px;">
          ${body}
          ${
            ctaLabel && ctaUrl
              ? `<p style="text-align: center; margin: 28px 0 12px;">
                  <a href="${ctaUrl}" style="background: #111827; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 999px; display: inline-block; font-weight: 600;">
                    ${ctaLabel}
                  </a>
                </p>
                <p style="font-size: 13px; color: #6b7280; word-break: break-word;">${ctaUrl}</p>`
              : ''
          }
        </div>
      </div>
    </div>
  `
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
  const taskUrl = `${APP_URL}/earner/campaigns/${taskId}`
  await sendEmail({
    to: email,
    subject: `New Task on Pamba: ${taskTitle}`,
    html: wrapEmail(
      'A new task is live',
      `
        <p>Hi ${name ? String(name) : 'there'},</p>
        <p>A new task is now live on Pamba: <strong>${taskTitle}</strong>.</p>
        <p>Jump in early so you do not miss the available slots.</p>
      `,
      'Participate now',
      taskUrl
    ),
  })
}

export async function sendActivationReminderEmail({
  email,
  name,
  role,
}: {
  email: string
  name?: string
  role: 'earner' | 'advertiser'
}) {
  const destination = `${APP_URL}/${role}`
  const actionText =
    role === 'earner'
      ? 'activate your earner account so you can start completing tasks and earning'
      : 'activate your advertiser account so you can start creating campaigns'

  await sendEmail({
    to: email,
    subject: `Complete your ${role} activation on Pamba`,
    html: wrapEmail(
      'Complete your activation',
      `
        <p>Hi ${name ? String(name) : 'there'},</p>
        <p>This is a reminder to ${actionText}.</p>
        <p>Once activation is complete, your dashboard will unlock the full workflow for your account.</p>
      `,
      'Open my dashboard',
      destination
    ),
  })
}

export async function sendAdminUpdateEmail({
  email,
  name,
  subject,
  message,
}: {
  email: string
  name?: string
  subject: string
  message: string
}) {
  await sendEmail({
    to: email,
    subject,
    html: wrapEmail(
      subject,
      `
        <p>Hi ${name ? String(name) : 'there'},</p>
        <div style="white-space: pre-wrap;">${message}</div>
      `
    ),
  })
}

export async function sendDirectAdvertRequestEmail({
  businessName,
  contactName,
  email,
  phone,
  advertType,
  duration,
  message,
}: {
  businessName: string
  contactName: string
  email: string
  phone: string
  advertType?: string | null
  duration?: string | null
  message?: string | null
}) {
  await sendEmail({
    to: ADMIN_INBOX_EMAIL,
    subject: `New direct advert request from ${businessName}`,
    html: wrapEmail(
      'New direct advert request',
      `
        <p>A new direct advert request was submitted on Pamba.</p>
        <p><strong>Business:</strong> ${businessName}</p>
        <p><strong>Contact person:</strong> ${contactName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Advert type:</strong> ${advertType || 'Not specified'}</p>
        <p><strong>Requested duration:</strong> ${duration || 'Not specified'}</p>
        <p><strong>Message:</strong><br/>${message || 'No extra message supplied.'}</p>
      `,
      'Open admin requests',
      `${APP_URL}/admin/direct-ad-requests`
    ),
  })
}

export async function sendDirectAdvertAcceptedEmail({
  businessName,
  contactName,
  email,
}: {
  businessName: string
  contactName?: string | null
  email: string
}) {
  await sendEmail({
    to: email,
    subject: `We received your direct advert request for ${businessName}`,
    html: wrapEmail(
      'Direct advert request received',
      `
        <p>Hi ${contactName ? String(contactName) : 'there'},</p>
        <p>We received your direct advert request for <strong>${businessName}</strong>.</p>
        <p>Our team will review the request and get back to you shortly with the next steps.</p>
      `,
      'Visit Pamba',
      APP_URL
    ),
  })
}

export async function sendContactAlertEmail({
  name,
  email,
  message,
}: {
  name: string
  email: string
  message: string
}) {
  await sendEmail({
    to: ADMIN_INBOX_EMAIL,
    subject: `New contact form message from ${name}`,
    html: wrapEmail(
      'New contact form message',
      `
        <p>A new message was sent through the contact page.</p>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong></p>
        <div style="white-space: pre-wrap;">${message}</div>
      `,
      'Open admin notifications',
      `${APP_URL}/admin/notifications`
    ),
  })
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
    return { attempted: 0, sent: 0, failed: 0 }
  }

  const snapshot = await dbAdmin
    .collection('earners')
    .where('activated', '==', true)
    .get()

  const recipients = snapshot.docs
    .map((doc) => {
      const data = doc.data() as { email?: string; name?: string; fullName?: string; status?: string }
      return {
        id: doc.id,
        email: data.email?.trim(),
        name: data.fullName || data.name,
        status: String(data.status || 'active').toLowerCase(),
      }
    })
    .filter((recipient) => recipient.email && recipient.status !== 'suspended')

  if (recipients.length === 0) {
    console.log('No activated earner emails found for new task notification')
    return { attempted: 0, sent: 0, failed: 0 }
  }

  const failures = await sendEmailsInBatches(recipients, async (recipient) => {
    await sendNewTaskEmail({
      email: recipient.email as string,
      name: recipient.name,
      taskTitle: campaignTitle,
      taskId: campaignId,
    })
  }, 20)

  if (failures.length > 0) {
    console.error(
      'New task notification failures:',
      failures.map((failure) => ({
        id: (failure.item as { id: string }).id,
        error: failure.error instanceof Error ? failure.error.message : String(failure.error),
      }))
    )
  }

  return {
    attempted: recipients.length,
    sent: recipients.length - failures.length,
    failed: failures.length,
  }
}
