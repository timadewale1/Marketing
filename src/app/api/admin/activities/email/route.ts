import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { requireAdminSession } from '@/lib/admin-session'
import {
  sendActivationReminderEmail,
  sendAdminUpdateEmail,
  sendEmailsInBatches,
} from '@/lib/mailer'
import { ADVERTISER_ACTIVATION_REQUIRED } from '@/lib/platform-config'

type Role = 'earner' | 'advertiser'

type UserRecord = {
  id: string
  role: Role
  email: string
  name?: string
  activated?: boolean
}

export async function POST(req: Request) {
  try {
    await requireAdminSession()

    const body = await req.json()
    const {
      type,
      audience,
      subject,
      message,
      recipientIds,
    } = body as {
      type?: 'activation_reminder' | 'broadcast'
      audience?: 'earners' | 'advertisers' | 'all'
      subject?: string
      message?: string
      recipientIds?: string[]
    }

    if (!type) {
      return NextResponse.json({ success: false, message: 'Email type is required' }, { status: 400 })
    }

    const { dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin) {
      return NextResponse.json({ success: false, message: 'Firebase admin unavailable' }, { status: 500 })
    }

    const roles: Role[] =
      audience === 'earners'
        ? ['earner']
        : audience === 'advertisers'
          ? ['advertiser']
          : ['earner', 'advertiser']

    const effectiveRoles =
      type === 'activation_reminder' && !ADVERTISER_ACTIVATION_REQUIRED
        ? roles.filter((role) => role === 'earner')
        : roles

    const recipients: UserRecord[] = []

    for (const role of effectiveRoles) {
      const collectionName = role === 'earner' ? 'earners' : 'advertisers'
      const snap = await dbAdmin.collection(collectionName).get()
      snap.docs.forEach((doc) => {
        const data = doc.data() as {
          email?: string
          name?: string
          fullName?: string
          companyName?: string
          activated?: boolean
        }

        if (!data.email) return
        if (recipientIds?.length && !recipientIds.includes(doc.id)) return

        recipients.push({
          id: doc.id,
          role,
          email: String(data.email).trim(),
          name: data.fullName || data.name || data.companyName,
          activated: Boolean(data.activated),
        })
      })
    }

    const filteredRecipients =
      type === 'activation_reminder'
        ? recipients.filter((recipient) => !recipient.activated)
        : recipients

    if (filteredRecipients.length === 0) {
      return NextResponse.json({ success: false, message: 'No matching recipients found' }, { status: 404 })
    }

    if (type === 'broadcast') {
      if (!subject?.trim() || !message?.trim()) {
        return NextResponse.json(
          { success: false, message: 'Subject and message are required for broadcast emails' },
          { status: 400 }
        )
      }
    }

    const failures = await sendEmailsInBatches(
      filteredRecipients,
      async (recipient) => {
        if (type === 'activation_reminder') {
          await sendActivationReminderEmail({
            email: recipient.email,
            name: recipient.name,
            role: recipient.role,
          })
        } else {
          await sendAdminUpdateEmail({
            email: recipient.email,
            name: recipient.name,
            subject: subject as string,
            message: message as string,
          })
        }
      },
      20
    )

    const failed = failures.length
    const sent = filteredRecipients.length - failed
    const resultMessage =
      failed > 0
        ? `Sent ${sent} emails, ${failed} failed`
        : `Sent ${sent} emails successfully`

    if (sent === 0) {
      return NextResponse.json(
        { success: false, message: resultMessage || "No emails were sent", sent, failed },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      message: resultMessage,
      sent,
      failed,
    })
  } catch (error) {
    console.error('Admin email activity error:', error)
    return NextResponse.json({ success: false, message: 'Failed to send admin email activity' }, { status: 500 })
  }
}
