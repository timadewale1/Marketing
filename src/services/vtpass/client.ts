import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

const LIVE = process.env.VTPASS_LIVE_BASE_URL || 'https://vtpass.com/api'
const SANDBOX = process.env.VTPASS_BASE_URL || 'https://sandbox.vtpass.com/api'

const baseURL =
  process.env.VTPASS_ENV === 'sandbox'
    ? SANDBOX
    : process.env.NODE_ENV === 'production'
      ? LIVE
      : SANDBOX

const trim = (value: string | undefined) => (value || '').replace(/^['"]|['"]$/g, '')

const API_KEY = trim(process.env.VTPASS_API_KEY)
const PUBLIC_KEY = trim(process.env.VTPASS_PUBLIC_KEY)
const SECRET_KEY = trim(process.env.VTPASS_SECRET_KEY)
const BASIC_USER = trim(process.env.VTPASS_BASIC_USER)
const BASIC_PASS = trim(process.env.VTPASS_BASIC_PASS)

type AuthMode = 'api-keys' | 'basic' | 'bearer'

type VtpassRequestConfig = InternalAxiosRequestConfig & {
  __vtpassAuthMode?: AuthMode
  __vtpassRetriedModes?: AuthMode[]
}

const getAvailableAuthModes = (method?: string): AuthMode[] => {
  const upperMethod = String(method || 'get').toUpperCase()
  const modes: AuthMode[] = []

  if (API_KEY && ((upperMethod === 'GET' && PUBLIC_KEY) || (upperMethod !== 'GET' && SECRET_KEY))) {
    modes.push('api-keys')
  }
  if (BASIC_USER && BASIC_PASS) {
    modes.push('basic')
  }
  if (SECRET_KEY) {
    modes.push('bearer')
  }

  return modes
}

const applyAuthHeaders = (config: VtpassRequestConfig, mode: AuthMode) => {
  const headers = config.headers
  headers.delete?.('api-key')
  headers.delete?.('public-key')
  headers.delete?.('secret-key')
  headers.delete?.('Authorization')

  if (mode === 'api-keys') {
    headers.set?.('api-key', API_KEY)
    if (String(config.method || 'get').toUpperCase() === 'GET') {
      headers.set?.('public-key', PUBLIC_KEY)
    } else {
      headers.set?.('secret-key', SECRET_KEY)
    }
    return
  }

  if (mode === 'basic') {
    const token = Buffer.from(`${BASIC_USER}:${BASIC_PASS}`).toString('base64')
    headers.set?.('Authorization', `Basic ${token}`)
    return
  }

  headers.set?.('Authorization', `Bearer ${SECRET_KEY}`)
}

const describeAuthMode = (mode: AuthMode) => {
  if (mode === 'api-keys') return 'API keys'
  if (mode === 'basic') return 'Basic auth'
  return 'Bearer secret'
}

export const createVtpassClient = () => {
  const instance = axios.create({ baseURL, timeout: 20_000 })

  instance.interceptors.request.use((config) => {
    const typedConfig = config as VtpassRequestConfig
    const availableModes = getAvailableAuthModes(config.method)

    if (availableModes.length === 0) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[VTPASS] No credentials configured. Requests will likely fail authentication.')
      }
      return config
    }

    const authMode = typedConfig.__vtpassAuthMode || availableModes[0]
    typedConfig.__vtpassAuthMode = authMode
    applyAuthHeaders(typedConfig, authMode)

    if (process.env.NODE_ENV !== 'production') {
      try {
        const method = String(config.method || 'get').toUpperCase()
        const url = `${config.baseURL || ''}${config.url || ''}`
        const data = config.data ? JSON.stringify(config.data) : ''
        console.debug(`[VTPASS][REQ] ${method} ${url} ${data} | auth=${describeAuthMode(authMode)}`)
      } catch {
        console.debug(`[VTPASS][REQ] auth=${describeAuthMode(authMode)}`)
      }
    }

    return typedConfig
  })

  instance.interceptors.response.use(
    (response) => {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[VTPASS][RES]', response.status, response.data)
      }
      return response
    },
    async (error: AxiosError) => {
      const responseStatus = error.response?.status
      const config = error.config as VtpassRequestConfig | undefined

      if (config && (responseStatus === 401 || responseStatus === 403)) {
        const availableModes = getAvailableAuthModes(config.method)
        const triedModes = new Set<AuthMode>([
          ...(config.__vtpassRetriedModes || []),
          ...(config.__vtpassAuthMode ? [config.__vtpassAuthMode] : []),
        ])
        const nextMode = availableModes.find((mode) => !triedModes.has(mode))

        if (nextMode) {
          config.__vtpassRetriedModes = Array.from(triedModes)
          config.__vtpassAuthMode = nextMode
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`[VTPASS][AUTH] ${responseStatus} with ${describeAuthMode(Array.from(triedModes)[0] || nextMode)}. Retrying with ${describeAuthMode(nextMode)}.`)
          }
          return instance.request(config)
        }
      }

      console.error('[VTPASS][ERR]', error.response?.status, error.message)
      throw error
    }
  )

  return instance
}

export const vtpassClient = createVtpassClient()

export default vtpassClient
