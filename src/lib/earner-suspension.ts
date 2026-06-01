const DAY_IN_MS = 24 * 60 * 60 * 1000

export const EARNER_STRIKE_SUSPENSION_THRESHOLD = 20
const SUSPENSION_DURATION_DAYS = 3

type TimestampLike =
  | Date
  | string
  | number
  | { seconds?: number; toDate?: () => Date }
  | null
  | undefined

type EarnerSuspensionRecord = {
  status?: string
  suspensionCount?: number | string
  suspensionReleaseAt?: TimestampLike
}

export function getEarnerSuspensionCount(record: EarnerSuspensionRecord | null | undefined) {
  return Math.max(0, Number(record?.suspensionCount || 0))
}

export function getSuspensionDurationDaysForCount(suspensionCount: number) {
  return suspensionCount > 0 ? SUSPENSION_DURATION_DAYS : null
}

export function buildNextEarnerSuspension(record: EarnerSuspensionRecord | null | undefined, now = new Date()) {
  const suspensionCount = getEarnerSuspensionCount(record) + 1
  const durationDays = getSuspensionDurationDaysForCount(suspensionCount)
  const releaseAt = durationDays ? new Date(now.getTime() + durationDays * DAY_IN_MS) : null

  return {
    suspensionCount,
    durationDays,
    releaseAt,
    indefinite: false,
  }
}

export function toDateFromTimestampLike(value: unknown) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === "number") {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (typeof value === "string") {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (typeof value === "object") {
    const timestampValue = value as { toDate?: () => Date; seconds?: number }
    if (typeof timestampValue.toDate === "function") {
      return timestampValue.toDate()
    }
    if (typeof timestampValue.seconds === "number") {
      return new Date(timestampValue.seconds * 1000)
    }
  }
  return null
}

export function shouldAutoUnsuspendEarner(record: EarnerSuspensionRecord | null | undefined, nowMs = Date.now()) {
  if (String(record?.status || "").toLowerCase() !== "suspended") return false

  const suspensionCount = getEarnerSuspensionCount(record)
  if (suspensionCount < 1) return false

  const releaseAt = toDateFromTimestampLike(record?.suspensionReleaseAt)
  if (!releaseAt) return false

  return releaseAt.getTime() <= nowMs
}
