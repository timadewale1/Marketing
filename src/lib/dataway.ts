// Dataway compatibility shim (DEPRECATED)
// The Dataway integration was intentionally removed from the codebase.
// Any import of this module will throw an explicit error to avoid accidental usage.

export function _datawayRemoved() {
  throw new Error('Dataway integration removed. Please migrate to /api/vtpass and src/services/vtpass')
}

export default {
  callVend: async () => { _datawayRemoved() },
  callQuery: async () => { _datawayRemoved() },
  callBalance: async () => { _datawayRemoved() }
}

export const getCategories = async () => { _datawayRemoved() }
export const getServices = async (_slug: string) => { _datawayRemoved() }
export const getServiceVariations = async (_service_slug: string) => { _datawayRemoved() }
export const validateBiller = async (_payload: Record<string, unknown>) => { _datawayRemoved() }
