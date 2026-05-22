"use client"

import { useEffect, useMemo, useState } from "react"
import { collection, limit, onSnapshot, query, where } from "firebase/firestore"
import { Medal, Trophy } from "lucide-react"
import { db } from "@/lib/firebase"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  getCurrentLagosWeekKey,
  getReferralTierDescription,
  getReferralTierFromCount,
  getReferralTierLabel,
  isReferralRecognitionWeekEnd,
  type ReferralRole,
  type ReferralTier,
} from "@/lib/referral-weekly"

type WeeklyStat = {
  id: string
  userId: string
  role: ReferralRole
  name?: string
  email?: string
  weeklyActivatedReferrals: number
}

type Props = {
  role: ReferralRole
  userId: string
  displayName: string
}

function categoryForCount(count: number): ReferralTier | null {
  return getReferralTierFromCount(count)
}

export default function WeeklyReferralRecognition({ role, userId, displayName }: Props) {
  const [stats, setStats] = useState<WeeklyStat[]>([])
  const weekKey = useMemo(() => getCurrentLagosWeekKey(), [])
  const showRecognition = useMemo(() => isReferralRecognitionWeekEnd(), [])

  useEffect(() => {
    if (!userId || !showRecognition) return

    const weeklyQuery = query(
      collection(db, "referralWeeklyStats"),
      where("weekKey", "==", weekKey),
      where("role", "==", role),
      limit(100)
    )

    const unsub = onSnapshot(weeklyQuery, (snapshot) => {
      setStats(
        snapshot.docs.map((docItem) => {
          const data = docItem.data() as Partial<WeeklyStat>
          return {
            id: docItem.id,
            userId: String(data.userId || ""),
            role: String(data.role || role) as ReferralRole,
            name: data.name || undefined,
            email: data.email || undefined,
            weeklyActivatedReferrals: Number(data.weeklyActivatedReferrals || 0),
          }
        })
      )
    }, (error) => {
      console.error("Failed to load weekly referral recognition", error)
    })

    return () => unsub()
  }, [role, userId, weekKey, showRecognition])

  const tierBuckets = useMemo(() => {
    const buckets: Record<ReferralTier, WeeklyStat[]> = {
      bronze: [],
      silver: [],
      gold: [],
      elite: [],
    }

    for (const stat of stats) {
      const tier = categoryForCount(stat.weeklyActivatedReferrals)
      if (tier) buckets[tier].push(stat)
    }

    return buckets
  }, [stats])

  const userStat = useMemo(
    () => stats.find((stat) => stat.userId === userId),
    [stats, userId]
  )

  const userTier = categoryForCount(userStat?.weeklyActivatedReferrals || 0)
  const userTierLabel = getReferralTierLabel(userTier)

  const categoryCards = (["bronze", "silver", "gold", "elite"] as ReferralTier[]).map((tier) => {
    const tierStats = tierBuckets[tier].sort(
      (a, b) => b.weeklyActivatedReferrals - a.weeklyActivatedReferrals
    )
    const topCount = tierStats[0]?.weeklyActivatedReferrals || 0
    const winners = tierStats.filter((item) => item.weeklyActivatedReferrals === topCount && topCount > 0)
    const winnerNames = winners.map((winner) => winner.name || winner.email || "User")
    const userWon = winners.some((winner) => winner.userId === userId)

    return {
      tier,
      label: getReferralTierLabel(tier),
      description: getReferralTierDescription(tier),
      topCount,
      winners,
      winnerNames,
      userWon,
    }
  })

  const currentWeekTotal = userStat?.weeklyActivatedReferrals || 0
  const eligible = Boolean(userTier)
  const visibleCategoryCards = categoryCards.filter((card) => card.winnerNames.length > 0)

  if (!showRecognition) {
    return null
  }

  if (visibleCategoryCards.length === 0) {
    return null
  }

  return (
    <Card className="border-none bg-white/80 shadow-md backdrop-blur">
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-600" />
              <h3 className="text-lg font-semibold text-stone-900">Weekly Referral Recognition</h3>
            </div>
            <p className="text-sm leading-6 text-stone-600">
              This week only. Old referrals are excluded. Winners in each category are chosen from the highest weekly activated referrals, and ties all win together.
            </p>
          </div>
          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
            {weekKey}
          </Badge>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Your weekly standing</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900">
            {displayName}, you have referred {currentWeekTotal.toLocaleString()} people this week.
          </p>
          <p className="mt-1 text-sm text-stone-600">
            {eligible
              ? `You are currently in the ${userTierLabel} tier. ${getReferralTierDescription(userTier)}.`
              : "You need at least 5 activated referrals this week to enter the recognition tiers."}
          </p>
          {userTier ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
              <Medal className="h-4 w-4" />
              {userTierLabel}
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {visibleCategoryCards.map((card) => (
            <div
              key={card.tier}
              className={`rounded-2xl border p-4 ${
                card.userWon ? "border-amber-300 bg-amber-50/80" : "border-stone-200 bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                <div>
                  <p className="text-sm font-semibold text-stone-900">{card.label}</p>
                  <p className="text-xs text-stone-500">{card.description}</p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <p className="text-sm text-stone-700">
                  Congratulations to {card.winnerNames.join(", ")} for referring the highest number of people in the {card.label.toLowerCase()} category this week.
                </p>
                {card.userWon ? (
                  <p className="text-sm font-semibold text-amber-700">
                    Congratulations {displayName}, you won this week&apos;s {card.label.toLowerCase()} prize. Kindly reach out to admin to accept your prize.
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
