import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import type { Firestore as AdminFirestore } from 'firebase-admin/firestore'

// Handle all campaign status changes with proper balance syncing
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { campaignId, action, userId, budget } = body
    
    if (!campaignId || !action || !userId) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin || !admin) {
      return NextResponse.json({ success: false, message: 'Server admin unavailable' }, { status: 500 })
    }

    const adminDb = dbAdmin as AdminFirestore
    const campaignRef = adminDb.collection('campaigns').doc(campaignId)
    const campaignSnap = await campaignRef.get()

    if (!campaignSnap.exists) {
      return NextResponse.json({ success: false, message: 'Campaign not found' }, { status: 404 })
    }

    const campaign = campaignSnap.data()
    if (!campaign) {
      return NextResponse.json({ success: false, message: 'Invalid campaign data' }, { status: 400 })
    }

    // Start a transaction for atomic updates
    await adminDb.runTransaction(async (transaction) => {
      const advertiserRef = adminDb.collection('advertisers').doc(campaign.ownerId)
      const advertiserSnap = await transaction.get(advertiserRef)

      if (!advertiserSnap.exists) {
        throw new Error('Advertiser not found')
      }

      const advertiser = advertiserSnap.data()
      if (!advertiser) {
        throw new Error('Invalid advertiser data')
      }

      // Handle campaign actions
      switch (action) {
        case 'delete': {
          // Mark campaign as deleted
          transaction.update(campaignRef, {
            status: 'Deleted',
            deletedAt: admin.firestore.FieldValue.serverTimestamp()
          })

          // Decrement campaign counter
          transaction.update(advertiserRef, {
            campaignsCreated: admin.firestore.FieldValue.increment(-1)
          })

          // Refund remaining budget to advertiser
          if (campaign.status === 'Active' && campaign.budget > 0) {
            const refundAmount = campaign.budget
            transaction.update(advertiserRef, {
              balance: admin.firestore.FieldValue.increment(refundAmount)
            })

            // Log refund transaction
            const txRef = adminDb.collection('advertiserTransactions').doc()
            transaction.set(txRef, {
              userId: campaign.ownerId,
              type: 'refund',
              amount: refundAmount,
              campaignId,
              campaignTitle: campaign.title,
              note: `Refund from deleted campaign: ${campaign.title}`,
              status: 'completed',
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            })
          }
          break
        }

        case 'pause': {
          transaction.update(campaignRef, {
            status: 'Paused',
            pausedAt: admin.firestore.FieldValue.serverTimestamp()
          })
          break
        }

        case 'activate': {
          // Check budget and advertiser balance
          if (!campaign.budget || campaign.budget <= 0) {
            throw new Error('Insufficient campaign budget')
          }

          // Check if campaign was previously stopped
          if (campaign.status === 'Stopped') {
            // For stopped campaigns, require new budget allocation
            if (!budget || Number(budget) <= 0) {
              throw new Error('Budget required to resume stopped campaign')
            }

            const newBudget = Number(budget)

            if (advertiser.balance < newBudget) {
              throw new Error('Insufficient advertiser balance')
            }

            // Deduct new budget from advertiser balance
            transaction.update(advertiserRef, {
              balance: admin.firestore.FieldValue.increment(-newBudget)
            })

            // Set new campaign budget and activate
            transaction.update(campaignRef, {
              status: 'Active',
              budget: newBudget,
              resumedAt: admin.firestore.FieldValue.serverTimestamp()
            })

            // Log transaction
            const txRef = adminDb.collection('advertiserTransactions').doc()
            transaction.set(txRef, {
              userId: campaign.ownerId,
              type: 'campaign_resume',
              amount: -newBudget,
              campaignId,
              campaignTitle: campaign.title,
              note: `Budget allocated for resumed campaign: ${campaign.title}`,
              status: 'completed',
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            })
          } else {
            // Direct activation for paused campaigns
            transaction.update(campaignRef, {
              status: 'Active',
              activatedAt: admin.firestore.FieldValue.serverTimestamp()
            })
          }
          break
        }

        case 'stop': {
          // When stopping, refund remaining budget
          if (campaign.budget > 0) {
            const refundAmount = campaign.budget
            transaction.update(advertiserRef, {
              balance: admin.firestore.FieldValue.increment(refundAmount)
            })

            // Log refund transaction
            const txRef = adminDb.collection('advertiserTransactions').doc()
            transaction.set(txRef, {
              userId: campaign.ownerId,
              type: 'refund',
              amount: refundAmount,
              campaignId,
              campaignTitle: campaign.title,
              note: `Refund from stopped campaign: ${campaign.title}`,
              status: 'completed',
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            })
          }

          transaction.update(campaignRef, {
            status: 'Stopped',
            stoppedAt: admin.firestore.FieldValue.serverTimestamp(),
            budget: 0 // Clear budget since it's refunded
          })
          break
        }

        default:
          throw new Error('Invalid action')
      }

      return { success: true }
    })

    return NextResponse.json({ success: true, message: `Campaign ${action} successful` })
  } catch (err) {
    console.error('Campaign transaction error:', err)
    return NextResponse.json({ 
      success: false, 
      message: err instanceof Error ? err.message : 'Internal server error' 
    }, { status: 500 })
  }
}