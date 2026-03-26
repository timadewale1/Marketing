import { NextResponse } from 'next/server'
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
import { requireAdminSession } from '@/lib/admin-session'

function toMillis(value: unknown) {
  if (!value) return 0
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    return Number((value as { seconds?: number }).seconds || 0) * 1000
  }
  if (value instanceof Date) return value.getTime()
  return 0
}

export async function GET() {
  try {
    await requireAdminSession()

    const { dbAdmin } = await initFirebaseAdmin()
    if (!dbAdmin) {
      return NextResponse.json({ success: false, message: 'Firebase admin unavailable' }, { status: 500 })
    }

    const snap = await dbAdmin.collection('homepageDirectAds').get()
    const ads = snap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>
        return {
          id: doc.id,
          brandName: String(data.brandName || ''),
          phone: String(data.phone || ''),
          email: String(data.email || ''),
          writeup: String(data.writeup || ''),
          link: data.link ? String(data.link) : '',
          mediaType: String(data.mediaType || 'image'),
          mediaUrl: String(data.mediaUrl || ''),
          mediaPath: String(data.mediaPath || ''),
          durationDays: Number(data.durationDays || 0),
          status: String(data.status || 'inactive'),
          createdAtMs: toMillis(data.createdAt),
          startsAtMs: toMillis(data.startsAt),
          expiresAtMs: toMillis(data.expiresAt),
        }
      })
      .sort((a, b) => (a.createdAtMs < b.createdAtMs ? 1 : -1))

    return NextResponse.json({ success: true, ads })
  } catch (error) {
    console.error('Admin homepage direct ads load error:', error)
    return NextResponse.json({ success: false, message: 'Failed to load homepage direct ads' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminSession()

    const { admin, dbAdmin } = await initFirebaseAdmin()
    if (!admin || !dbAdmin) {
      return NextResponse.json({ success: false, message: 'Firebase admin unavailable' }, { status: 500 })
    }

    const formData = await req.formData()
    const brandName = String(formData.get('brandName') || '').trim()
    const phone = String(formData.get('phone') || '').trim()
    const email = String(formData.get('email') || '').trim()
    const writeup = String(formData.get('writeup') || '').trim()
    const link = String(formData.get('link') || '').trim()
    const durationDays = Number(formData.get('durationDays') || 0)
    const file = formData.get('media')

    if (!brandName || !phone || !email || !writeup || !durationDays || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: 'Brand name, phone, email, writeup, duration, and media are required' },
        { status: 400 }
      )
    }

    const mimeType = file.type || ''
    if (!mimeType.startsWith('image/') && !mimeType.startsWith('video/')) {
      return NextResponse.json({ success: false, message: 'Only image or video uploads are supported' }, { status: 400 })
    }

    const bucketName =
      process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    if (!bucketName) {
      return NextResponse.json({ success: false, message: 'Storage bucket is not configured' }, { status: 500 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const extension = file.name.includes('.') ? file.name.split('.').pop() : mimeType.split('/')[1] || 'bin'
    const sanitizedBrand = brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const mediaPath = `homepage-direct-ads/${Date.now()}-${sanitizedBrand}.${extension}`

    const bucket = admin.storage().bucket(bucketName)
    const bucketFile = bucket.file(mediaPath)
    await bucketFile.save(buffer, {
      metadata: {
        contentType: mimeType,
        cacheControl: 'public,max-age=3600',
      },
    })

    const [mediaUrl] = await bucketFile.getSignedUrl({
      action: 'read',
      expires: '03-01-2035',
    })

    const adRef = dbAdmin.collection('homepageDirectAds').doc()
    const startsAt = admin.firestore.Timestamp.now()
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      startsAt.toMillis() + durationDays * 24 * 60 * 60 * 1000
    )
    const now = admin.firestore.FieldValue.serverTimestamp()

    await adRef.set({
      id: adRef.id,
      brandName,
      phone,
      email,
      writeup,
      link: link || null,
      mediaType: mimeType.startsWith('video/') ? 'video' : 'image',
      mediaUrl,
      mediaPath,
      durationDays,
      status: 'active',
      startsAt,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })

    await dbAdmin.collection('adminNotifications').doc().set({
      type: 'homepage_direct_ad_uploaded',
      title: 'New homepage direct advert uploaded',
      body: `${brandName} is now scheduled on the homepage`,
      link: '/admin/homepage-direct-ads',
      read: false,
      createdAt: now,
    })

    return NextResponse.json({ success: true, message: 'Homepage direct advert uploaded successfully' })
  } catch (error) {
    console.error('Homepage direct advert upload error:', error)
    return NextResponse.json({ success: false, message: 'Failed to upload homepage direct advert' }, { status: 500 })
  }
}
