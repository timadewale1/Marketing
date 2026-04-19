import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { sendAdminActionEmail } from "@/lib/mailer"

type BillsPurchaseActor = {
  name: string
  adminPath: string
  roleLabel: string
}

async function resolveBillsPurchaseActor(userId?: string | null): Promise<BillsPurchaseActor> {
  if (!userId) {
    return {
      name: "Guest user",
      adminPath: "/admin/notifications",
      roleLabel: "customer",
    }
  }

  const { dbAdmin } = await initFirebaseAdmin()

  if (!dbAdmin) {
    return {
      name: "User",
      adminPath: "/admin/notifications",
      roleLabel: "user",
    }
  }

  const advertiserSnap = await dbAdmin.collection("advertisers").doc(String(userId)).get()
  if (advertiserSnap.exists) {
    const data = advertiserSnap.data() as {
      fullName?: string
      name?: string
      businessName?: string
      companyName?: string
      email?: string
    }

    return {
      name: String(
        data.fullName ||
          data.name ||
          data.businessName ||
          data.companyName ||
          data.email ||
          "Advertiser"
      ).trim(),
      adminPath: `/admin/advertisers/${userId}`,
      roleLabel: "advertiser",
    }
  }

  const earnerSnap = await dbAdmin.collection("earners").doc(String(userId)).get()
  if (earnerSnap.exists) {
    const data = earnerSnap.data() as { fullName?: string; name?: string; email?: string }

    return {
      name: String(data.fullName || data.name || data.email || "Earner").trim(),
      adminPath: `/admin/earners/${userId}`,
      roleLabel: "earner",
    }
  }

  return {
    name: "User",
    adminPath: "/admin/notifications",
    roleLabel: "user",
  }
}

export async function notifyAdminOfBillsPurchase({
  actorUserId,
  paidAmount,
  serviceID,
  paymentChannel,
  reference,
}: {
  actorUserId?: string | null
  paidAmount: number
  serviceID: string
  paymentChannel: string
  reference?: string | null
}) {
  try {
    const actor = await resolveBillsPurchaseActor(actorUserId)
    const { dbAdmin, admin } = await initFirebaseAdmin()

    const title = "Bills purchase completed"
    const body = `${actor.name} completed a ${paymentChannel} bills purchase for ${serviceID} (NGN ${paidAmount.toLocaleString()}).`

    if (dbAdmin && admin) {
      await dbAdmin.collection("adminNotifications").add({
        type: "bills_purchase",
        title,
        body,
        link: actor.adminPath,
        userId: actorUserId || null,
        serviceID,
        paymentChannel,
        amount: paidAmount,
        reference: reference || null,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }

    await sendAdminActionEmail({
      subject: `Bills purchase - NGN ${paidAmount.toLocaleString()}`,
      title,
      message: `${body}${reference ? ` Reference: ${reference}.` : ""}`,
      adminPath: actor.adminPath,
    })
  } catch (error) {
    console.error("Failed to notify admin of bills purchase", error)
  }
}
