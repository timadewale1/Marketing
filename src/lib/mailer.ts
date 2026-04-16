import nodemailer from 'nodemailer'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

const SMTP_SERVICE = process.env.SMTP_SERVICE || 'gmail'
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SMTP_FROM = process.env.SMTP_FROM
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.pambaadverts.com'
const ADMIN_INBOX_EMAIL = process.env.ADMIN_INBOX_EMAIL || 'pambaadverts@gmail.com'

let transporterPromise: Promise<nodemailer.Transporter | null> | null = null
let lastVerifyError: string | null = null
let lastVerifiedAt: number | null = null

const MAILER_CONFIG_ERROR = 'Mailer not configured: SMTP_USER/SMTP_PASS/SMTP_FROM required'

const resolveErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch (_error) {
    return 'Unknown error'
  }
}

async function getTransporter() {
  if (transporterPromise) return transporterPromise

  transporterPromise = (async () => {
    if (!SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
      lastVerifyError = MAILER_CONFIG_ERROR
      lastVerifiedAt = Date.now()
      console.warn(MAILER_CONFIG_ERROR)
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
      lastVerifyError = null
      lastVerifiedAt = Date.now()
      console.log('SMTP transporter verified successfully')
    } catch (error) {
      lastVerifyError = resolveErrorMessage(error)
      lastVerifiedAt = Date.now()
      console.error('SMTP transporter verification failed:', error)
    }

    return transporter
  })()

  return transporterPromise
}

export async function getMailerDiagnostics() {
  const configured = Boolean(SMTP_USER && SMTP_PASS && SMTP_FROM)
  if (!configured) {
    return {
      configured: false,
      message: MAILER_CONFIG_ERROR,
      service: SMTP_SERVICE,
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
      lastVerifyError,
      lastVerifiedAt: lastVerifiedAt ? new Date(lastVerifiedAt).toISOString() : null,
    }
  }

  await getTransporter()

  return {
    configured: true,
    service: SMTP_SERVICE,
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
    lastVerifyError,
    lastVerifiedAt: lastVerifiedAt ? new Date(lastVerifiedAt).toISOString() : null,
  }
}

export async function assertMailerReady() {
  const diagnostics = await getMailerDiagnostics()
  if (!diagnostics.configured) {
    throw new Error(diagnostics.message || MAILER_CONFIG_ERROR)
  }
  if (diagnostics.lastVerifyError) {
    throw new Error(`SMTP verification failed: ${diagnostics.lastVerifyError}`)
  }
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
  availableSlots,
}: {
  email: string
  name?: string
  taskTitle: string
  taskId: string
  availableSlots?: number
}) {
  const taskUrl = `${APP_URL}/earner/campaigns/${taskId}`
  const slotsText = typeof availableSlots === 'number' && availableSlots > 0
    ? `<p>There are currently <strong>${availableSlots}</strong> slot${availableSlots === 1 ? '' : 's'} available for this task.</p>`
    : ''
  await sendEmail({
    to: email,
    subject: `New Task on Pamba: ${taskTitle}`,
    html: wrapEmail(
      'A new task is live',
      `
        <p>Hi ${name ? String(name) : 'there'},</p>
        <p>A new task is now live on Pamba: <strong>${taskTitle}</strong>.</p>
        ${slotsText}
        <p>Be fast in applying so you do not miss out before the slots fill up.</p>
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
        ${role === 'earner' ? '<p>There are multiple tasks already waiting for you on the platform, and once your account is activated you can jump in, complete them, and start earning money.</p>' : ''}
        <p>Once activation is complete, your dashboard will unlock the full workflow for your account.</p>
      `,
      'Open my dashboard',
      destination
    ),
  })
}

export async function sendVerificationEmail({
  email,
  name,
  verificationUrl,
}: {
  email: string
  name?: string
  verificationUrl: string
}) {
  await sendEmail({
    to: email,
    subject: "Verify your email address for Pamba",
    html: wrapEmail(
      "Confirm your email",
      `
        <p>Hi ${name ? String(name) : "there"},</p>
        <p>Welcome to Pamba. Please confirm your email address to finish setting up your account and unlock your full dashboard experience.</p>
        <p>If the button does not open properly in your mail app, copy and paste the link below into your browser.</p>
      `,
      "Verify my email",
      verificationUrl
    ),
  })
}

export async function sendPasswordResetLinkEmail({
  email,
  name,
  resetUrl,
}: {
  email: string
  name?: string
  resetUrl: string
}) {
  await sendEmail({
    to: email,
    subject: "Reset your Pamba password",
    html: wrapEmail(
      "Reset your password",
      `
        <p>Hi ${name ? String(name) : "there"},</p>
        <p>We received a request to reset your Pamba password. Use the button below to choose a new password securely.</p>
        <p>If you did not request this, you can safely ignore this email and your account will stay unchanged.</p>
      `,
      "Reset my password",
      resetUrl
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
  const buildDirectAdvertPackages = () => {
    const selectedDurations = [3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60]
    const weeklyRate = 10000 / 7
    const computedPrice = (days: number) => {
      if (days === 3) return 5000
      if (days === 7) return 10000
      if (days < 7) {
        const perDayBetweenAnchors = (10000 - 5000) / (7 - 3)
        return Math.ceil((5000 + (days - 3) * perDayBetweenAnchors) / 500) * 500
      }
      return Math.ceil((days * weeklyRate) / 500) * 500
    }

    return selectedDurations.map((days) => ({
      days,
      price: computedPrice(days),
    }))
  }

  const packageCards = buildDirectAdvertPackages()
    .map(
      (pkg) => `
        <div style="border: 1px solid #fde68a; border-radius: 14px; padding: 14px 16px; background: #fffbeb;">
          <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.22em; color: #92400e;">Package</div>
          <div style="margin-top: 8px; font-size: 22px; font-weight: 700; color: #111827;">${pkg.days} day${pkg.days === 1 ? '' : 's'}</div>
          <div style="margin-top: 4px; font-size: 16px; font-weight: 600; color: #b45309;">₦${pkg.price.toLocaleString()}</div>
        </div>
      `
    )
    .join('')

  await sendEmail({
    to: email,
    subject: `${businessName}, let’s get your direct advert live on Pamba`,
    html: wrapEmail(
      'Your direct advert request is in',
      `
        <p>Hi ${contactName ? String(contactName) : 'there'},</p>
        <p>Thank you for reaching out to Pamba for <strong>${businessName}</strong>. We are excited about the opportunity to help you put your brand in front of the right audience.</p>
        <p>Your request has been received successfully, and we would love to move you to the next step by helping you choose the advert duration that fits your campaign goals best.</p>
        <div style="margin: 24px 0; padding: 18px; border-radius: 16px; background: linear-gradient(135deg, rgba(245,158,11,0.12), rgba(146,64,14,0.08)); border: 1px solid #fcd34d;">
          <p style="margin: 0 0 10px; font-size: 18px; font-weight: 700; color: #111827;">Current direct advert packages</p>
          <p style="margin: 0; color: #57534e;">Here are the available package options we can run for you right now. These are built from our current 3-day and 1-week pricing.</p>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 20px 0 24px;">
          ${packageCards}
        </div>
        <p>If you already know what you want, simply <strong>reply to this email with your preferred package choice</strong>, and our team will continue the setup process with you right away.</p>
        <p>You can reply with something as simple as:</p>
        <ul style="padding-left: 20px; color: #374151;">
          <li><strong>“We want the 7-day package.”</strong></li>
          <li><strong>“Please reserve the 30-day package for us.”</strong></li>
          <li><strong>“We need a custom plan and want to discuss the best option.”</strong></li>
        </ul>
        <p>We are looking forward to helping your advert gain strong visibility on Pamba, and we will be happy to guide you to the best-fit option for your campaign.</p>
        <p>Once you reply with your preferred package, we will take it from there.</p>
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
  availableSlots,
}: {
  campaignId: string
  campaignTitle: string
  availableSlots?: number
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
      availableSlots,
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

export async function sendEarnerStrikeEmail({
  email,
  name,
  strikeCount,
  reason,
  suspended = false,
}: {
  email: string
  name?: string
  strikeCount: number
  reason?: string | null
  suspended?: boolean
}) {
  await sendEmail({
    to: email,
    subject: suspended ? "Your Pamba earner account has been suspended" : `Strike ${strikeCount} recorded on your Pamba account`,
    html: wrapEmail(
      suspended ? "Account suspended" : "Strike recorded",
      `
        <p>Hi ${name ? String(name) : "there"},</p>
        <p>Your earner account currently has <strong>${strikeCount} strike${strikeCount === 1 ? "" : "s"}</strong>.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
        ${
          suspended
            ? "<p>Your account has reached the strike limit and is now suspended. You will not be able to participate in tasks until an admin reviews and unsuspends the account.</p>"
            : "<p>Please review future submissions carefully. Repeated rejected proofs can lead to suspension at 5 strikes.</p>"
        }
      `,
      "Open my dashboard",
      `${APP_URL}/earner`
    ),
  })
}

export async function sendEarnerStrikeRemovedEmail({
  email,
  name,
  strikeCount,
}: {
  email: string
  name?: string
  strikeCount: number
}) {
  await sendEmail({
    to: email,
    subject: "A strike was removed from your Pamba account",
    html: wrapEmail(
      "Strike removed",
      `
        <p>Hi ${name ? String(name) : "there"},</p>
        <p>One of your previous rejected submissions has now been verified, so your strike count has been reduced.</p>
        <p>Your current strike count is <strong>${strikeCount}</strong>.</p>
      `,
      "Open my dashboard",
      `${APP_URL}/earner`
    ),
  })
}

export async function sendAdminActionEmail({
  subject,
  title,
  message,
  adminPath,
}: {
  subject: string
  title: string
  message: string
  adminPath: string
}) {
  await sendEmail({
    to: ADMIN_INBOX_EMAIL,
    subject,
    html: wrapEmail(
      title,
      `<div style="white-space: pre-wrap;">${message}</div>`,
      "Open admin page",
      `${APP_URL}${adminPath.startsWith("/") ? adminPath : `/${adminPath}`}`
    ),
  })
}
