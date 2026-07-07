export const PRODUCT_CATEGORIES = [
  "Clothing",
  "Accessories",
  "Beauty",
  "Electronics",
  "Food",
  "Home & Kitchen",
  "Tools",
  "Books",
  "Services",
  "Digital Products",
  "Other",
] as const

export type ProductContactMethod = "whatsapp" | "instagram" | "telegram" | "email" | "website" | "other"

export function normalizeProductContactMethod(value: unknown): ProductContactMethod {
  const method = String(value || "").trim().toLowerCase()
  if (method === "instagram" || method === "telegram" || method === "email" || method === "website" || method === "other") {
    return method
  }
  return "whatsapp"
}

export function buildProductContactLink(method: unknown, details: unknown) {
  const normalizedMethod = normalizeProductContactMethod(method)
  const raw = String(details || "").trim()
  if (!raw) return ""

  const stripped = raw.replace(/^@/, "")
  const digits = raw.replace(/\D/g, "")

  switch (normalizedMethod) {
    case "whatsapp":
      return digits ? `https://wa.me/${digits}` : raw
    case "instagram":
      return `https://instagram.com/${stripped}`
    case "telegram":
      return `https://t.me/${stripped}`
    case "email":
      return raw.startsWith("mailto:") ? raw : `mailto:${raw}`
    case "website":
      return /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, "")}`
    default:
      return /^https?:\/\//i.test(raw) ? raw : raw
  }
}

export function getContactPlaceholder(method: unknown) {
  switch (normalizeProductContactMethod(method)) {
    case "instagram":
      return "Instagram handle"
    case "telegram":
      return "Telegram username"
    case "email":
      return "Email address"
    case "website":
      return "Website or product page"
    case "other":
      return "Contact username, link, or number"
    default:
      return "WhatsApp number"
  }
}

export function getContactHelperText(method: unknown) {
  switch (normalizeProductContactMethod(method)) {
    case "instagram":
      return "Example: @yourshopname"
    case "telegram":
      return "Example: @yourtelegram"
    case "email":
      return "Example: hello@yourstore.com"
    case "website":
      return "Example: yourshop.com/product"
    case "other":
      return "Add the best contact detail for this product."
    default:
      return "Example: 08012345678"
  }
}
