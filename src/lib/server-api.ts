type ApiFetchInput = `/${string}`

function getConfiguredBaseUrl() {
  const serverBase = (process.env.API_BASE_URL || "").trim()
  const publicBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim()
  const configured = typeof window === "undefined" ? serverBase : publicBase
  return configured.replace(/\/+$/, "")
}

export function resolveApiUrl(path: ApiFetchInput) {
  const base = getConfiguredBaseUrl()
  if (!base) return path
  return `${base}${path}`
}

export function apiFetch(path: ApiFetchInput, init?: RequestInit) {
  return fetch(resolveApiUrl(path), init)
}

