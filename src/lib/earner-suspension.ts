const DAY_IN_MS = 24 * 60 * 60 * 1000

export const EARNER_STRIKE_SUSPENSION_THRESHOLD = 5

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
  if (suspensionCount <= 1) return 7
  if (suspensionCount === 2) return 14
  return null
}

export function buildNextEarnerSuspension(record: EarnerSuspensionRecord | null | undefined, now = new Date()) {
  const suspensionCount = getEarnerSuspensionCount(record) + 1
  const durationDays = getSuspensionDurationDaysForCount(suspensionCount)
  const releaseAt = durationDays ? new Date(now.getTime() + durationDays * DAY_IN_MS) : null

  return {
    suspensionCount,
    durationDays,
    releaseAt,
    indefinite: durationDays === null,
  }
}

export function toDateFromTimestampLike(value: TimestampLike) {
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
    if (typeof value.toDate === "function") {
      return value.toDate()
    }
    if (typeof value.seconds === "number") {
      return new Date(value.seconds * 1000)
    }
  }
  return null
}

export function shouldAutoUnsuspendEarner(record: EarnerSuspensionRecord | null | undefined, nowMs = Date.now()) {
  if (String(record?.status || "").toLowerCase() !== "suspended") return false

  const suspensionCount = getEarnerSuspensionCount(record)
  if (suspensionCount < 1 || suspensionCount >= 3) return false

  const releaseAt = toDateFromTimestampLike(record?.suspensionReleaseAt)
  if (!releaseAt) return false

  return releaseAt.getTime() <= nowMs
}
