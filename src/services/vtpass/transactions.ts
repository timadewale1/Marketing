import { initFirebaseAdmin } from '@/lib/firebaseAdmin'

export async function saveVtpassTransaction(collection: string, payload: Record<string, unknown>) {
  const { dbAdmin } = await initFirebaseAdmin()
  if (!dbAdmin) return null
  const doc = await dbAdmin.collection(collection).add({ ...payload, createdAt: new Date().toISOString() })
  return doc.id
}

export default { saveVtpassTransaction }
