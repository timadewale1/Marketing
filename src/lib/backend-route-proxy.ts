const BACKEND_BASE_ENV_KEYS = [
  "BACKEND_API_BASE_URL",
  "FUNCTIONS_API_BASE_URL",
  "API_BASE_URL",
] as const

function getBackendBaseUrl() {
  for (const key of BACKEND_BASE_ENV_KEYS) {
    const value = String(process.env[key] || "").trim()
    if (value) return value.replace(/\/+$/, "")
  }
  return ""
}

export async function proxyToBackendIfConfigured(path: `/${string}`, request: Request): Promise<Response | null> {
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

  const method = (request.method || "GET").toUpperCase()
  const init: RequestInit = {
    method,
    headers,
    redirect: "manual",
  }

  if (method !== "GET" && method !== "HEAD") {
    init.body = await request.text()
  }

  const upstream = await fetch(target.toString(), init)
  const body = await upstream.arrayBuffer()
  return new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  })
}

