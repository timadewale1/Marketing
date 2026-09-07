import { initFirebaseAdmin } from "@/lib/firebaseAdmin"
import { sendAdminActionEmail } from "@/lib/mailer"

export async function notifyAdminOfServiceListing({
  providerId,
  providerName,
  providerEmail,
  categories,
  services,
}: {
  providerId: string
  providerName: string
  providerEmail: string
  categories: string[]
  services: string[]
}) {
  const title = "New Skills & Services listing"
  const body = `${providerName} listed services on PAMBA.\nEmail: ${providerEmail}\nCategories: ${categories.join(", ") || "Not specified"}\nServices: ${services.join(", ") || "Not specified"}`

  try {
    const { dbAdmin, admin } = await initFirebaseAdmin()
    if (dbAdmin && admin) {
      await dbAdmin.collection("adminNotifications").add({
        type: "service_listing_created",
        title,
        body,
        link: "/admin/skills-services",
        userId: providerId,
        providerId,
        providerName,
        providerEmail,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }

    await sendAdminActionEmail({
      subject: `${title}: ${providerName}`,
      title,
      message: body,
      adminPath: "/admin/skills-services",
    })
  } catch (error) {
    console.error("Failed to notify admin of service listing", error)
  }
}

export async function notifyAdminOfServiceConnectionPayment({
  customerId,
  customerEmail,
  customerName,
  providerId,
  providerName,
  amount,
  reference,
}: {
  customerId: string
  customerEmail: string
  customerName: string
  providerId: string
  providerName: string
  amount: number
  reference: string
}) {
  const title = "New Skills & Services hire payment"
  const body = `${customerName || "A customer"} paid to connect with ${providerName}.\nCustomer email: ${customerEmail}\nAmount: ₦${amount.toLocaleString()}\nPayment reference: ${reference}`

  try {
    const { dbAdmin, admin } = await initFirebaseAdmin()
    if (dbAdmin && admin) {
      await dbAdmin.collection("adminNotifications").add({
        type: "service_connection_paid",
        title,
        body,
        link: "/admin/skills-services",
        userId: customerId,
        customerId,
        customerEmail,
        providerId,
        providerName,
        amount,
        reference,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }

    await sendAdminActionEmail({
      subject: `${title}: ${providerName}`,
      title,
      message: body,
      adminPath: "/admin/skills-services",
    })
  } catch (error) {
    console.error("Failed to notify admin of service connection payment", error)
  }
}
