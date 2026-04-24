import { getProofUrls } from '@/lib/proofs'

type AdminApp = typeof import('firebase-admin')
type FirestoreDb = import('firebase-admin').firestore.Firestore

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000
const CLEANUP_RUN_INTERVAL_MS = 6 * 60 * 60 * 1000
const MAX_DOCS_PER_RUN = 100

export function getProofCleanupEligibleAt(baseDate: Date = new Date()) {
  return new Date(baseDate.getTime() + TWO_WEEKS_MS)
}

export function extractStoragePathFromUrl(url: string) {
  const trimmed = String(url || '').trim()
  if (!trimmed) return null

  if (trimmed.startsWith('gs://')) {
    const [, ...rest] = trimmed.replace('gs://', '').split('/')
    return rest.length > 0 ? rest.join('/') : null
  }

  try {
    const parsed = new URL(trimmed)

    if (parsed.hostname === 'firebasestorage.googleapis.com') {
      const marker = '/o/'
      const markerIndex = parsed.pathname.indexOf(marker)
      if (markerIndex >= 0) {
        const encodedPath = parsed.pathname.slice(markerIndex + marker.length)
        return decodeURIComponent(encodedPath)
      }
    }

    if (parsed.hostname === 'storage.googleapis.com') {
      const parts = parsed.pathname.split('/').filter(Boolean)
      return parts.length > 1 ? parts.slice(1).join('/') : null
    }
  } catch {
    return null
  }

  return null
}

export async function deleteSubmissionProofs(
  admin: AdminApp,
  submission: { proofUrl?: unknown; proofUrls?: unknown }
) {
  const urls = getProofUrls(submission)
  if (urls.length === 0) {
    return { deletedCount: 0, failedUrls: [] as string[] }
  }

  const bucket = admin.storage().bucket()
  let deletedCount = 0
  const failedUrls: string[] = []

  for (const url of urls) {
    const storagePath = extractStoragePathFromUrl(url)
    if (!storagePath) {
      failedUrls.push(url)
      continue
    }

    try {
      await bucket.file(storagePath).delete({ ignoreNotFound: true })
      deletedCount += 1
    } catch (error) {
      console.error('Failed to delete submission proof from storage', { storagePath, error })
      failedUrls.push(url)
    }
  }

  return { deletedCount, failedUrls }
}

function asDate(value: unknown) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'object' && value !== null) {
    const maybeTimestamp = value as { toDate?: () => Date; seconds?: number }
    if (typeof maybeTimestamp.toDate === 'function') {
      return maybeTimestamp.toDate()
    }
    if (typeof maybeTimestamp.seconds === 'number') {
      return new Date(maybeTimestamp.seconds * 1000)
    }
  }
  return null
}

export async function runSubmissionProofCleanupIfDue(
  admin: AdminApp,
  dbAdmin: FirestoreDb,
  options?: { force?: boolean }
) {
  const force = Boolean(options?.force)
  const taskRef = dbAdmin.collection('systemTasks').doc('submissionProofCleanup')
  const now = new Date()
  let shouldRun = force

  if (!force) {
    await dbAdmin.runTransaction(async (transaction) => {
      const taskSnap = await transaction.get(taskRef)
      const lastCompletedAt = asDate(taskSnap.data()?.lastCompletedAt)

      if (lastCompletedAt && now.getTime() - lastCompletedAt.getTime() < CLEANUP_RUN_INTERVAL_MS) {
        return
      }

      shouldRun = true
      transaction.set(
        taskRef,
        {
          lastStartedAt: now,
          updatedAt: now,
        },
        { merge: true }
      )
    })
  }

  if (!shouldRun) {
    return {
      success: true,
      skipped: true,
      reason: 'Cleanup not due yet',
      scanned: 0,
      deletedSubmissions: 0,
      deletedFiles: 0,
      failedSubmissions: 0,
    }
  }

  const snap = await dbAdmin
    .collection('earnerSubmissions')
    .where('proofCleanupEligibleAt', '<=', now)
    .limit(MAX_DOCS_PER_RUN)
    .get()

  let deletedSubmissions = 0
  let deletedFiles = 0
  let skippedSubmissions = 0
  let failedSubmissions = 0

  for (const docSnap of snap.docs) {
    const submission = docSnap.data() as {
      status?: string
      proofUrl?: unknown
      proofUrls?: unknown
      proofCleanupStatus?: string
      proofsDeletedAt?: unknown
    }
    const status = String(submission.status || '')
    const alreadyDeleted = Boolean(submission.proofsDeletedAt)
    const cleanupStatus = String(submission.proofCleanupStatus || '').toLowerCase()

    if (!['Verified', 'Rejected'].includes(status) || alreadyDeleted || cleanupStatus === 'deleted') {
      skippedSubmissions += 1
      continue
    }

    try {
      const { deletedCount, failedUrls } = await deleteSubmissionProofs(admin, submission)
      deletedFiles += deletedCount
      deletedSubmissions += 1

      await docSnap.ref.set(
        {
          proofUrl: null,
          proofUrls: [],
          proofCleanupStatus: failedUrls.length > 0 ? 'partial' : 'deleted',
          proofCleanupFailedUrls: failedUrls,
          proofsDeletedAt: now,
          updatedAt: now,
        },
        { merge: true }
      )
    } catch (error) {
      failedSubmissions += 1
      console.error('Submission proof cleanup failed', { submissionId: docSnap.id, error })
      await docSnap.ref.set(
        {
          proofCleanupStatus: 'failed',
          proofCleanupLastError: error instanceof Error ? error.message : 'Unknown cleanup error',
          proofCleanupLastAttemptAt: now,
        },
        { merge: true }
      )
    }
  }

  await taskRef.set(
    {
      lastCompletedAt: now,
      lastRunSummary: {
        scanned: snap.size,
        deletedSubmissions,
        deletedFiles,
        skippedSubmissions,
        failedSubmissions,
      },
      updatedAt: now,
    },
    { merge: true }
  )

  return {
    success: true,
    skipped: false,
    scanned: snap.size,
    deletedSubmissions,
    deletedFiles,
    skippedSubmissions,
    failedSubmissions,
  }
}
