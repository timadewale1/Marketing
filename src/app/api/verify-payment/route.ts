import { NextRequest, NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import type { Firestore as AdminFirestore } from 'firebase-admin/firestore'
import { extractMonnifyReferenceCandidates, processWalletFundingWithRetry, awardAdvertiserFirstTaskReferralBonusInTransaction } from '@/lib/paymentProcessing'
import { confirmMonnifyPaymentWithRetries, isMonnifyImmediateSuccessResponse } from '@/lib/monnify-confirmation'
import { logPaymentLifecycle } from '@/lib/payment-reconciliation'
import { notifyAdminOfTaskCreated } from '@/lib/task-admin-alerts'
import { sendNewTaskNotificationToEarners } from '@/lib/mailer'

const WALLET_FUNDING_CONFIRMATION_RETRY_DELAYS_MS = [0, 2000, 5000, 10000, 20000, 40000, 60000, 150000]

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('verify-payment called with body:', JSON.stringify(body))
    const { reference, campaignData, type, userId, amount, provider, monnifyResponse } = body
    const requestedUserType = String(body?.userType || '').trim().toLowerCase()

    if (!reference) {
      return NextResponse.json({ success: false, message: 'Missing payment reference' }, { status: 400 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin || !admin) {
      return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })
    }
    const adminDb = dbAdmin as AdminFirestore
    let referenceCandidates = provider === 'monnify'
      ? extractMonnifyReferenceCandidates(String(reference), monnifyResponse || null)
      : [String(reference)]

    let monnifyConfirmed = provider !== 'monnify'
    let monnifyConfirmation: Awaited<ReturnType<typeof confirmMonnifyPaymentWithRetries>> | null = null
    const monnifyImmediateSuccess = provider === 'monnify' && Boolean(monnifyResponse) && isMonnifyImmediateSuccessResponse(monnifyResponse)

    if (provider === 'monnify') {
      await logPaymentLifecycle({
        scope: type === 'wallet_funding' ? 'wallet_funding' : 'campaign_payment',
        status: 'callback_received',
        source: 'verify-payment',
        provider,
        role: 'advertiser',
        userId: String(userId || ''),
        reference: String(reference),
        references: referenceCandidates,
        amount: Number(amount || campaignData?.budget || 0) || null,
      })
      try {
        console.log('Monnify SDK payment callback received - awaiting provider confirmation')
        if (monnifyResponse) {
          console.log('Monnify SDK response:', JSON.stringify(monnifyResponse).substring(0, 200))
          if (referenceCandidates.length === 0) {
            return NextResponse.json(
              { success: false, message: 'Invalid Monnify SDK response - missing reference' },
              { status: 400 }
            )
          }
        }
        if (monnifyImmediateSuccess) {
          monnifyConfirmed = true
          monnifyConfirmation = {
            confirmed: true,
            references: referenceCandidates,
            paymentStatus: 'PAID',
            verificationResult: null,
          }
          console.log('Monnify SDK reported immediate success, proceeding without waiting for retry window')
        } else {
          monnifyConfirmation = await confirmMonnifyPaymentWithRetries(
            String(reference),
            referenceCandidates,
            WALLET_FUNDING_CONFIRMATION_RETRY_DELAYS_MS
          )
          referenceCandidates = monnifyConfirmation.references
          monnifyConfirmed = monnifyConfirmation.confirmed

          if (!monnifyConfirmation.confirmed) {
            console.warn('Monnify payment not yet confirmed:', monnifyConfirmation.paymentStatus)
          } else {
            console.log('Monnify payment confirmed server-side')
          }
        }
      } catch (e) {
        console.error('Monnify verification failed:', e)
        return NextResponse.json(
          { success: false, message: 'Unable to verify Monnify payment' },
          { status: 500 }
        )
      }
    }

    if (campaignData) {
      const campaignBudget = Number(campaignData?.budget || 0)
      const campaignCpl = Number(campaignData?.costPerLead || 0)
      if (campaignCpl > 0 && campaignBudget < campaignCpl) {
        return NextResponse.json({ success: false, message: 'Budget cannot be less than the task amount' }, { status: 400 })
      }
      if (provider === 'monnify' && !monnifyConfirmed) {
        await logPaymentLifecycle({
          scope: 'campaign_payment',
          status: 'pending_confirmation',
          source: 'verify-payment',
          provider,
          role: 'advertiser',
          userId: String(userId || ''),
          reference: String(reference),
          references: referenceCandidates,
          amount: Number(campaignData?.budget || 0) || null,
        })
        return NextResponse.json({
          success: true,
          completed: false,
          pendingConfirmation: true,
          message: 'Payment received. Awaiting Monnify confirmation.',
          references: referenceCandidates,
        })
      }

      try {
        const campaignRef = adminDb.collection('campaigns').doc()
        const campaignTitle = String(campaignData.title || 'Untitled')
        const advertiserName = String(
          campaignData.advertiserName ||
          campaignData.businessName ||
          campaignData.companyName ||
          campaignData.name ||
          userId ||
          'Advertiser'
        ).trim()
        const taskDurationValue = Number(campaignData.taskDurationValue || 0)
        const taskDurationUnit = String(campaignData.taskDurationUnit || '').toLowerCase() === 'days' ? 'days' : 'hours'

        await campaignRef.set({
          ...campaignData,
          paymentRef: reference,
          taskDurationValue: taskDurationValue > 0 ? taskDurationValue : null,
          taskDurationUnit: taskDurationValue > 0 ? taskDurationUnit : null,
          expiresAt:
            taskDurationValue > 0
              ? admin.firestore.Timestamp.fromMillis(
                  Date.now() + taskDurationValue * (taskDurationUnit === 'days' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000)
                )
              : null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        await dbAdmin.runTransaction(async (t) => {
          try {
            await awardAdvertiserFirstTaskReferralBonusInTransaction(
              adminDb,
              admin,
              t,
              String(userId || ''),
              campaignRef.id,
              Number(campaignData?.originalBudget || campaignData?.budget || 0),
              campaignTitle
            )
          } catch (bonusError) {
            console.warn('[verify-payment] advertiser referral bonus skipped after non-fatal error:', bonusError)
          }
        })
        await notifyAdminOfTaskCreated({
          advertiserId: String(userId || ''),
          advertiserName,
          campaignId: campaignRef.id,
          campaignTitle,
        })
        await sendNewTaskNotificationToEarners({
          campaignId: campaignRef.id,
          campaignTitle,
          availableSlots: Number(campaignData?.estimatedLeads || campaignData?.targetLeads || 0),
        })
        await logPaymentLifecycle({
          scope: 'campaign_payment',
          status: 'completed',
          source: 'verify-payment',
          provider,
          role: 'advertiser',
          userId: String(userId || ''),
          reference: String(reference),
          references: referenceCandidates,
          amount: Number(campaignData?.budget || 0) || null,
        })
      } catch (e) {
        console.error('Failed to create campaign:', e)
        return NextResponse.json({ success: false, message: 'Failed to create campaign' }, { status: 500 })
      }
    }

    if (type === 'wallet_funding' && userId && amount > 0) {
      let walletFundingUserType: 'advertiser' | 'earner' | 'vendor' | 'customer' = 'advertiser'
      if (requestedUserType === 'earner' || requestedUserType === 'vendor' || requestedUserType === 'customer' || requestedUserType === 'advertiser') {
        walletFundingUserType = requestedUserType
      } else {
        const [advertiserSnap, earnerSnap, vendorSnap, customerSnap] = await Promise.all([
          adminDb.collection('advertisers').doc(String(userId)).get(),
          adminDb.collection('earners').doc(String(userId)).get(),
          adminDb.collection('vendors').doc(String(userId)).get(),
          adminDb.collection('customers').doc(String(userId)).get(),
        ])
        walletFundingUserType = advertiserSnap.exists
          ? 'advertiser'
          : earnerSnap.exists
            ? 'earner'
            : vendorSnap.exists
              ? 'vendor'
              : customerSnap.exists
                ? 'customer'
                : 'advertiser'
      }

      if (provider === 'monnify') {
        const confirmation = monnifyConfirmation || await confirmMonnifyPaymentWithRetries(String(reference), referenceCandidates)
        referenceCandidates = confirmation.references

        const pendingTxCollection = walletFundingUserType === 'earner'
          ? 'earnerTransactions'
          : walletFundingUserType === 'vendor'
            ? 'vendorTransactions'
            : walletFundingUserType === 'customer'
              ? 'customerTransactions'
              : 'advertiserTransactions'
        const pendingSnap = await adminDb.collection(pendingTxCollection)
          .where('userId', '==', String(userId))
          .where('type', '==', 'wallet_funding')
          .where('status', '==', 'pending')
          .get()

        for (const doc of pendingSnap.docs) {
          const data = doc.data()
          const candidates = [String(data.reference || ''), ...(Array.isArray(data.referenceCandidates) ? data.referenceCandidates.map(String) : [])].filter(Boolean)
          if (!candidates.some((candidate) => referenceCandidates.includes(candidate))) continue
          await doc.ref.set({
            reference: referenceCandidates[0] || String(reference),
            referenceCandidates: Array.from(new Set([...candidates, ...referenceCandidates])),
            verificationState: confirmation.confirmed ? 'paid' : 'manual_check',
            verificationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true })
        }

        if (!confirmation.confirmed) {
          await logPaymentLifecycle({
            scope: 'wallet_funding',
            status: 'pending_confirmation',
            source: 'verify-payment',
            provider,
            role: 'advertiser',
            userId: String(userId),
            reference: String(reference),
            references: referenceCandidates,
            amount: Number(amount),
            details: { paymentStatus: confirmation.paymentStatus || null },
          })
          return NextResponse.json({
            success: true,
            completed: false,
            pendingConfirmation: true,
            message: 'Payment received. Awaiting Monnify confirmation.',
            references: referenceCandidates,
          })
        }
      }

      try {
        await processWalletFundingWithRetry(
          String(userId),
          referenceCandidates[0] || String(reference),
          Number(amount),
          provider === 'monnify' ? 'monnify' : 'paystack',
          walletFundingUserType,
          3,
          referenceCandidates
        )
        await adminDb.collection('adminNotifications').add({
          type: 'wallet_funding',
          title: 'Wallet funded',
          body: `Advertiser ${userId} funded wallet with ₦${amount}`,
          link: '/admin/transactions',
          userId,
          amount,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        await logPaymentLifecycle({
          scope: 'wallet_funding',
          status: 'completed',
          source: 'verify-payment',
          provider,
          role: 'advertiser',
          userId: String(userId),
          reference: referenceCandidates[0] || String(reference),
          references: referenceCandidates,
          amount: Number(amount),
        })
      } catch (e) {
        console.error('Failed to record wallet funding:', e)
        await logPaymentLifecycle({
          scope: 'wallet_funding',
          status: 'failed',
          source: 'verify-payment',
          provider,
          role: 'advertiser',
          userId: String(userId),
          reference: String(reference),
          references: referenceCandidates,
          amount: Number(amount),
          details: { message: e instanceof Error ? e.message : String(e) },
        })
        return NextResponse.json({ success: false, message: 'Failed to record transaction' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true, completed: true })
  } catch (err) {
    console.error('Payment processing error:', err)
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 })
  }
}
