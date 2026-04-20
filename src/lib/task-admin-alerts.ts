import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { sendAdminActionEmail } from "@/lib/mailer"

export async function notifyAdminOfTaskCreated({
  advertiserId,
  advertiserName,
  campaignId,
  campaignTitle,
}: {
  advertiserId?: string | null
  advertiserName: string
  campaignId: string
  campaignTitle: string
}) {
  const title = "New task created"
  const body = `Advertiser ${advertiserName} created a new task: ${campaignTitle}`
  const link = `/admin/campaigns/${campaignId}`

  try {
    const { dbAdmin, admin } = await initFirebaseAdmin()
    if (dbAdmin && admin) {
      await dbAdmin.collection("adminNotifications").add({
        type: "task_created",
        title,
        body,
        link,
        userId: advertiserId || null,
        campaignId,
        campaignTitle,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }

    await sendAdminActionEmail({
      subject: `New task created: ${campaignTitle}`,
      title,
      message: body,
      adminPath: link,
    })
  } catch (error) {
    console.error("Failed to notify admin of task creation", error)
  }
}
