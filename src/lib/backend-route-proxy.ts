const BACKEND_BASE_ENV_KEYS = [
  "BACKEND_API_BASE_URL",
  "FUNCTIONS_API_BASE_URL",
  "API_BASE_URL",
] as const

const INTERNAL_SECRET_ENV_KEYS = [
  "API_INTERNAL_SECRET",
  "CRON_SECRET",
] as const

function getBackendBaseUrl() {
  for (const key of BACKEND_BASE_ENV_KEYS) {
    const value = String(process.env[key] || "").trim()
    if (value) return value.replace(/\/+$/, "")
  }
  return ""
}

function getInternalAuthHeaderValue() {
  for (const key of INTERNAL_SECRET_ENV_KEYS) {
    const value = String(process.env[key] || "").trim()
    if (value) return `Bearer ${value}`
  }
  return ""
}

type ProxyOptions = {
  internalAuth?: boolean
}

export async function proxyToBackendIfConfigured(
  path: `/${string}`,
  request: Request,
  options: ProxyOptions = {}
): Promise<Response | null> {
  if (path.startsWith("/api/internal/")) {
    return null
  }

  if (request.headers.get("x-skip-backend-proxy") === "1") {
    return null
  }

  const base = getBackendBaseUrl()
  if (!base) return null

  let target: URL
  let incoming: URL
  try {
    target = new URL(`${base}${path}`)
    incoming = new URL(request.url)
  } catch {
    return null
  }

  // Guard against accidental loop if backend base points to the same origin.
  if (target.origin === incoming.origin) {
    return null
  }

  const headers = new Headers(request.headers)
  headers.delete("host")
  headers.delete("content-length")
  if (options.internalAuth) {
    const internalAuth = getInternalAuthHeaderValue()
    if (internalAuth) {
      headers.set("authorization", internalAuth)
    }
  }

  const method = (request.method || "GET").toUpperCase()
  const init: RequestInit = {
    method,
    headers,
    redirect: "manual",
  }

  if (method !== "GET" && method !== "HEAD") {
    init.body = await request.text()
  }

  try {
    const upstream = await fetch(target.toString(), init)

    // During phased migration, fall back to local logic if backend route is absent/unavailable.
    if (!upstream.ok) {
      const fallbackStatuses = new Set([401, 403, 404, 405, 500, 501, 502, 503, 504])
      if (fallbackStatuses.has(upstream.status)) {
        return null
      }
    }

    const body = await upstream.arrayBuffer()
    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    })
  } catch {
    return null
  }
}
