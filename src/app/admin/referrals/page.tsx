"use client"

import { useEffect, useMemo, useState } from "react"
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore"
import { Medal, Search } from "lucide-react"
import { db } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AdminPageHeader,
  EmptyState,
  MetricCard,
  SectionCard,
  StatusBadge,
} from "@/app/admin/_components/admin-primitives"
import {
  getCurrentLagosWeekKey,
  getReferralTierDescription,
  getReferralTierFromCount,
  getReferralTierLabel,
  type ReferralRole,
} from "@/lib/referral-weekly"

type WeeklyReferralRow = {
  id: string
  userId: string
  role: ReferralRole
  name: string
  email: string
  totalReferred: number
  weeklyActivatedReferrals: number
}

const ROLE_OPTIONS: Array<{ value: ReferralRole | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "earner", label: "Earners" },
  { value: "advertiser", label: "Advertisers" },
]

export default function AdminReferralsPage() {
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<ReferralRole | "all">("all")
  const [search, setSearch] = useState("")
  const [rows, setRows] = useState<WeeklyReferralRow[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const weekKey = getCurrentLagosWeekKey()
        const roles: ReferralRole[] = role === "all" ? ["earner", "advertiser"] : [role]
        const snapshots = await Promise.all(
          roles.map((selectedRole) =>
            getDocs(
              query(
                collection(db, "referralWeeklyStats"),
                where("weekKey", "==", weekKey),
                where("role", "==", selectedRole),
                limit(200)
              )
            )
          )
        )

        const weeklyRows: WeeklyReferralRow[] = []
        for (let index = 0; index < snapshots.length; index += 1) {
          const selectedRole = roles[index]
          const snap = snapshots[index]
          const userDocReads = await Promise.all(
            snap.docs.map(async (statDoc) => {
              const stat = statDoc.data() as { userId?: string; name?: string; email?: string; weeklyActivatedReferrals?: number }
              const userId = String(stat.userId || "")
              const userRef = doc(db, selectedRole === "earner" ? "earners" : "advertisers", userId)
              const userSnap = await getDoc(userRef)
              const userData = userSnap.data() as { pointsReferralCount?: number; fullName?: string; name?: string; businessName?: string; companyName?: string; email?: string } | undefined

              return {
                id: statDoc.id,
                userId,
                role: selectedRole,
                name: String(
                  userData?.fullName ||
                    userData?.name ||
                    userData?.businessName ||
                    userData?.companyName ||
                    stat.name ||
                    stat.email ||
                    "User"
                ).trim(),
                email: String(userData?.email || stat.email || "").trim(),
                totalReferred: Number(userData?.pointsReferralCount || 0),
                weeklyActivatedReferrals: Number(stat.weeklyActivatedReferrals || 0),
              } satisfies WeeklyReferralRow
            })
          )
          weeklyRows.push(...userDocReads)
        }

        weeklyRows.sort((a, b) => b.weeklyActivatedReferrals - a.weeklyActivatedReferrals || b.totalReferred - a.totalReferred)
        setRows(weeklyRows)
      } catch (error) {
        console.error("Failed to load admin referral stats", error)
      } finally {
        setLoading(false)
      }
    }

    load().catch((error) => {
      console.error("Failed to load admin referral page", error)
      setLoading(false)
    })
  }, [role])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) =>
      row.name.toLowerCase().includes(term) ||
      row.email.toLowerCase().includes(term) ||
      row.userId.toLowerCase().includes(term)
    )
  }, [rows, search])

  const categoryTotals = useMemo(() => {
    const categories = {
      bronze: filteredRows.filter((row) => getReferralTierFromCount(row.weeklyActivatedReferrals) === "bronze"),
      silver: filteredRows.filter((row) => getReferralTierFromCount(row.weeklyActivatedReferrals) === "silver"),
      gold: filteredRows.filter((row) => getReferralTierFromCount(row.weeklyActivatedReferrals) === "gold"),
      elite: filteredRows.filter((row) => getReferralTierFromCount(row.weeklyActivatedReferrals) === "elite"),
    }
    return {
      bronze: categories.bronze.length,
      silver: categories.silver.length,
      gold: categories.gold.length,
      elite: categories.elite.length,
    }
  }, [filteredRows])

  const winnerRows = useMemo(() => {
    return filteredRows.filter((row) => row.weeklyActivatedReferrals >= 5)
  }, [filteredRows])

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Referrals"
        title="Weekly referral leaders"
        description="Track each user's total referred count and this week's activated referrals, grouped by recognition tier."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Bronze" value={categoryTotals.bronze} hint="5 to 19 weekly activations" icon={Medal} />
        <MetricCard label="Silver" value={categoryTotals.silver} hint="20 to 49 weekly activations" icon={Medal} tone="blue" />
        <MetricCard label="Gold" value={categoryTotals.gold} hint="50 to 99 weekly activations" icon={Medal} tone="emerald" />
        <MetricCard label="Elite" value={categoryTotals.elite} hint="100+ weekly activations" icon={Medal} tone="rose" />
      </div>

      <SectionCard
        title="Search and filter"
        description="Search by name, email, or user ID. Switch between earners, advertisers, or both."
      >
        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search referrals"
              className="h-11 rounded-2xl border-stone-200 bg-white pl-10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {ROLE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant={role === option.value ? "default" : "outline"}
                className={role === option.value ? "rounded-full bg-amber-500 text-stone-900" : "rounded-full"}
                onClick={() => setRole(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Referral ranking"
        description={`${filteredRows.length} user${filteredRows.length === 1 ? "" : "s"} matched the current filters. Ranked by weekly activated referrals.`}
      >
        {loading ? (
          <div className="h-48 animate-pulse rounded-3xl bg-stone-100" />
        ) : filteredRows.length === 0 ? (
          <EmptyState
            title="No referral leaders yet"
            description="Once people begin activating through referrals this week, their rankings will appear here."
          />
        ) : (
          <div className="space-y-4">
            {(["bronze", "silver", "gold", "elite"] as const).map((tier) => {
              const tierRows = filteredRows
                .filter((row) => getReferralTierFromCount(row.weeklyActivatedReferrals) === tier)
                .sort((a, b) => b.weeklyActivatedReferrals - a.weeklyActivatedReferrals)

              if (tierRows.length === 0) return null

              const topCount = tierRows[0].weeklyActivatedReferrals
              const winners = tierRows.filter((row) => row.weeklyActivatedReferrals === topCount)

              return (
                <div key={tier} className="rounded-3xl border border-stone-200 bg-white p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-stone-900">{getReferralTierLabel(tier)}</h3>
                      <p className="text-sm text-stone-600">{getReferralTierDescription(tier)}</p>
                    </div>
                    <StatusBadge label={`${winners.length} winner${winners.length === 1 ? "" : "s"}`} tone="green" />
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-stone-200 text-left text-stone-500">
                          <th className="py-3 pr-4 font-medium">Name</th>
                          <th className="py-3 pr-4 font-medium">Email</th>
                          <th className="py-3 pr-4 font-medium text-right">Total referred</th>
                          <th className="py-3 pr-4 font-medium text-right">This week</th>
                          <th className="py-3 pr-4 font-medium text-right">Recognition</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tierRows.map((row) => {
                          const isWinner = row.weeklyActivatedReferrals === topCount
                          return (
                            <tr key={row.id} className="border-b border-stone-100 last:border-b-0">
                              <td className="py-3 pr-4 font-medium text-stone-900">{row.name}</td>
                              <td className="py-3 pr-4 text-stone-600">{row.email || "—"}</td>
                              <td className="py-3 pr-4 text-right text-stone-700">{row.totalReferred.toLocaleString()}</td>
                              <td className="py-3 pr-4 text-right font-semibold text-stone-900">{row.weeklyActivatedReferrals.toLocaleString()}</td>
                              <td className="py-3 pr-4 text-right">
                                {isWinner ? (
                                  <StatusBadge label="Winner" tone="green" />
                                ) : (
                                  <span className="text-xs text-stone-500">Competitor</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Recognition preview"
        description="These are the current weekly winners with ties included."
      >
        {winnerRows.length === 0 ? (
          <EmptyState
            title="No weekly winners yet"
            description="As referrals activate this week, the prize messages will appear here."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {winnerRows.slice(0, 8).map((row) => (
              <div key={`${row.role}-${row.userId}`} className="rounded-3xl border border-amber-200 bg-amber-50/70 p-4">
                <p className="text-sm font-semibold text-amber-700">{getReferralTierLabel(getReferralTierFromCount(row.weeklyActivatedReferrals))}</p>
                <p className="mt-2 text-base font-semibold text-stone-900">{row.name}</p>
                <p className="text-sm text-stone-600">
                  {row.weeklyActivatedReferrals.toLocaleString()} weekly activated referrals, {row.totalReferred.toLocaleString()} total referred.
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
