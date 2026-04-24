import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { runSubmissionProofCleanupIfDue } from '@/lib/submission-proof-cleanup'

export async function GET(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET
    const authHeader = req.headers.get('authorization') || ''

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ success: false, message: 'Firebase admin unavailable' }, { status: 500 })
    }

    const result = await runSubmissionProofCleanupIfDue(admin, dbAdmin, { force: true })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Submission proof cleanup route error', error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Cleanup failed' },
      { status: 500 }
    )
  }
}
