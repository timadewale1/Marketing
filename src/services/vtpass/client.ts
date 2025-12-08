import axios from 'axios'

// VTpass endpoints per docs
const LIVE = process.env.VTPASS_LIVE_BASE_URL || 'https://vtpass.com/api'
const SANDBOX = process.env.VTPASS_BASE_URL || 'https://sandbox.vtpass.com/api'

const baseURL = (process.env.NODE_ENV === 'production' ? LIVE : SANDBOX)

export const createVtpassClient = () => {
  const instance = axios.create({ baseURL, timeout: 20_000 })

  // Authentication: prefer Basic (username/password) if provided, otherwise fallback to Bearer secret
  const basicUser = process.env.VTPASS_BASIC_USER || ''
  const basicPass = process.env.VTPASS_BASIC_PASS || ''
  const bearer = process.env.VTPASS_SECRET_KEY || ''

  if (basicUser && basicPass) {
    // set Authorization header to Basic <base64>
    const token = Buffer.from(`${basicUser}:${basicPass}`).toString('base64')
    const defaultsHeaders = instance.defaults.headers as unknown as Record<string, unknown>
    defaultsHeaders.common = {
      ...(defaultsHeaders.common as Record<string, unknown> | undefined || {}),
      Authorization: `Basic ${token}`,
    }
    // indicate auth method for debugging (no secrets logged)
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('[VTPASS] Using Basic auth (username provided)')
    }
  } else if (bearer) {
    const defaultsHeaders = instance.defaults.headers as unknown as Record<string, unknown>
    defaultsHeaders.common = {
      ...(defaultsHeaders.common as Record<string, unknown> | undefined || {}),
      Authorization: `Bearer ${bearer}`,
    }
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('[VTPASS] Using Bearer token auth (secret key provided)')
    }
  }
  else {
    // No authentication configured — VTpass will return 401. Log a helpful warning.
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[VTPASS] No credentials configured (VTPASS_BASIC_USER/PASS or VTPASS_SECRET_KEY). VTpass requests will likely return 401 Unauthorized.')
    }
  }

  // request debug interceptor
  instance.interceptors.request.use((config) => {
    if (process.env.NODE_ENV !== 'production') {
      try {
        const method = (config.method || 'get').toUpperCase()
        const url = `${config.baseURL || ''}${config.url || ''}`
        const data = config.data ? JSON.stringify(config.data) : ''
        console.debug(`[VTPASS][REQ] ${method} ${url} ${data}`)
      } catch { /* ignore */ }
    }
    return config
  })

  instance.interceptors.response.use((res) => {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('[VTPASS][RES]', res.status, res.data)
    }
    return res
  }, (err) => {
    // eslint-disable-next-line no-console
    console.error('[VTPASS][ERR]', err?.response?.status, err?.message)
    throw err
  })

  return instance
}

export const vtpassClient = createVtpassClient()

export default vtpassClient
