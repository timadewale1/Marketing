"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { auth, db } from "@/lib/firebase"
import { collection, limit, onSnapshot, query, where } from "firebase/firestore"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Gift } from "lucide-react"
import { getRedeemablePoints, POINTS_REDEEM_MINIMUM } from "@/lib/points"

type Role = "earner" | "advertiser"

type PointsPanelProps = {
  role: Role
  userId: string
  displayName: string
  pointsBalance: number
  activated?: boolean
  walletRoute?: string
  tasksRoute?: string
  billsRoute?: string
  withdrawRoute?: string
}

const REFERRAL_CATEGORY_GUIDE = [
  {
    label: "Bronze Earner",
    requirement: "5 active users",
    reward: "250 points",
  },
  {
    label: "Silver",
    requirement: "20 activated users",
    reward: "1,000 points",
  },
  {
    label: "Gold",
    requirement: "50 activated users",
    reward: "2,500 points",
  },
  {
    label: "Elite",
    requirement: "100 activated users and above",
    reward: "5,000 points",
  },
]

const TARGETS: Array<{ value: "wallet" | "withdraw" | "bills" | "tasks"; label: string; description: string }> = [
  { value: "wallet", label: "Add to wallet", description: "Move points into wallet balance for later use." },
  { value: "withdraw", label: "Withdraw", description: "Convert points now, then open your withdraw flow." },
  { value: "bills", label: "Pay bills", description: "Convert points and use your wallet to pay bills." },
  { value: "tasks", label: "Pay for tasks", description: "Advertisers can convert points to fund new tasks." },
]

export function PointsPanel({
  role,
  userId,
  displayName,
  pointsBalance,
  activated = true,
  walletRoute,
  tasksRoute,
  billsRoute,
  withdrawRoute,
}: PointsPanelProps) {
  const router = useRouter()
  const [redeemOpen, setRedeemOpen] = useState(false)
  const [redeemTarget, setRedeemTarget] = useState<"wallet" | "withdraw" | "bills" | "tasks">("wallet")
  const [redeemAmount, setRedeemAmount] = useState<string>(String(POINTS_REDEEM_MINIMUM))
  const [redeeming, setRedeeming] = useState(false)
  const seenPointIdsRef = useRef<Set<string>>(new Set())
  const loginAwardAttemptedRef = useRef(false)
  const redeemablePoints = useMemo(() => getRedeemablePoints(pointsBalance), [pointsBalance])
  const totalUserPoints = Math.max(0, Number(pointsBalance || 0))

  useEffect(() => {
    if (!userId || loginAwardAttemptedRef.current) return
    const unsub = auth.onAuthStateChanged((currentUser) => {
      if (!currentUser || loginAwardAttemptedRef.current) return
      loginAwardAttemptedRef.current = true

      void (async () => {
        try {
          const idToken = await currentUser.getIdToken()
          const res = await fetch("/api/points/login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ role }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) {
            if (data?.message) console.warn("Login points award skipped:", data.message)
            return
          }
          if (data?.awarded) {
            toast.success(`Daily login bonus: +${data.pointsAwarded || 0} points`)
          }
        } catch (error) {
          console.warn("Daily login bonus check failed", error)
        }
      })()
    })

    return () => unsub()
  }, [role, userId])

  useEffect(() => {
    if (!userId) {
      return
    }

    const pointsQuery = query(
      collection(db, "pointsTransactions"),
      where("userId", "==", userId),
      limit(20)
    )

    const unsub = onSnapshot(pointsQuery, (snapshot) => {
      const currentIds = new Set<string>()
      snapshot.docs.forEach((snap) => {
        currentIds.add(snap.id)
        if (!seenPointIdsRef.current.has(snap.id)) {
          const data = snap.data() as { amount?: number; type?: string; note?: string }
          const amount = Number(data.amount || 0)
          if (amount > 0) {
            toast.success(`You earned +${amount.toLocaleString()} points`)
          }
        }
      })
      seenPointIdsRef.current = currentIds
    })

    return () => unsub()
  }, [userId])

  const handleRedeem = async () => {
    try {
      const amount = Number(redeemAmount || 0)
      if (!amount || amount < POINTS_REDEEM_MINIMUM) {
        toast.error(`Minimum redemption is ${POINTS_REDEEM_MINIMUM.toLocaleString()} points`)
        return
      }
      if (amount % POINTS_REDEEM_MINIMUM !== 0) {
        toast.error(`Redemption must be in multiples of ${POINTS_REDEEM_MINIMUM.toLocaleString()} points`)
        return
      }
      if (amount > redeemablePoints) {
        toast.error("You do not have enough redeemable points yet")
        return
      }
      if (role === "earner" && !activated && redeemTarget !== "wallet") {
        toast.error("Please activate your account before redeeming points to this option.")
        return
      }

      const currentUser = auth.currentUser
      if (!currentUser) {
        toast.error("Please sign in again to redeem points")
        return
      }

      setRedeeming(true)
      const idToken = await currentUser.getIdToken()
      const res = await fetch("/api/points/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          role,
          amount,
          target: redeemTarget,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        toast.error(data?.message || "Failed to redeem points")
        return
      }

      toast.success("Points redeemed successfully")
      setRedeemOpen(false)
      const nextUrl = typeof data?.nextUrl === "string" && data.nextUrl
        ? data.nextUrl
        : getFallbackRoute(redeemTarget)
      if (nextUrl) {
        router.push(nextUrl)
      }
    } catch (error) {
      console.error("Redeem points failed", error)
      toast.error("Failed to redeem points")
    } finally {
      setRedeeming(false)
    }
  }

  const openTargetRoute = (target: "wallet" | "withdraw" | "bills" | "tasks") => {
    setRedeemTarget(target)
    setRedeemAmount(String(Math.max(POINTS_REDEEM_MINIMUM, redeemablePoints)))
    setRedeemOpen(true)
  }

  const targetOptions = role === "advertiser" ? TARGETS : TARGETS.filter((option) => option.value !== "tasks")
  const getFallbackRoute = (target: "wallet" | "withdraw" | "bills" | "tasks") => {
    if (target === "wallet") return walletRoute || null
    if (target === "withdraw") return withdrawRoute || null
    if (target === "bills") return billsRoute || null
    if (target === "tasks") return tasksRoute || null
    return null
  }

  return (
    <>
      <Card className="bg-white/75 backdrop-blur border-none shadow-md hover:shadow-lg transition-all">
        <CardContent className="p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="p-3 bg-amber-100 rounded-2xl">
                  <Gift size={28} className="text-amber-700" />
                </div>
                <div>
                  <h3 className="text-sm text-stone-600 font-medium">Points Balance</h3>
                  <p className="text-xs text-stone-500">{displayName}</p>
                  <p className="text-3xl font-bold text-stone-900">{totalUserPoints.toLocaleString()} points</p>
                </div>
              </div>
              <p className="text-sm text-stone-600 max-w-2xl">
                Earn points for daily logins, referrals, completed tasks, bills, and high-value tasks. Redeem starts at {POINTS_REDEEM_MINIMUM.toLocaleString()} points.
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-stone-500">
                <span>Daily login: +10</span>
                <span>Approved task: +10</span>
                <span>Bills: +5 for bills of ₦200 and above</span>
                <span>Referral: +5</span>
                <span>Referral activation: +50</span>
                <span>High-value task: +200</span>
              </div>
            </div>
            <div className="flex flex-col gap-3 min-w-[220px]">
              <Button
                onClick={() => setRedeemOpen(true)}
                disabled={redeemablePoints < POINTS_REDEEM_MINIMUM}
                className="bg-amber-500 hover:bg-amber-600 text-stone-900"
              >
                Redeem Points
              </Button>
              <div className="grid grid-cols-2 gap-2">
                {targetOptions.map((target) => (
                  <Button
                    key={target.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="justify-center"
                    onClick={() => openTargetRoute(target.value)}
                    disabled={redeemablePoints < POINTS_REDEEM_MINIMUM}
                  >
                    {target.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-stone-500">
                Redeemable now: {redeemablePoints.toLocaleString()} points
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/75 backdrop-blur border-none shadow-md mt-6">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Gift className="h-5 w-5 text-amber-600" />
            <div>
              <h3 className="text-lg font-semibold text-stone-900">Referral category guide</h3>
              <p className="text-sm text-stone-600">See the badge level, referral target, and reward for each category.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Badge</TableHead>
                  <TableHead>Requirement</TableHead>
                  <TableHead className="text-right">Reward</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {REFERRAL_CATEGORY_GUIDE.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="font-medium text-stone-900">{row.label}</TableCell>
                    <TableCell className="text-stone-600">{row.requirement}</TableCell>
                    <TableCell className="text-right font-semibold text-amber-700">{row.reward}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={redeemOpen} onOpenChange={setRedeemOpen}>
        <DialogContent className="bg-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Redeem Points</DialogTitle>
            <DialogDescription>
              Redeem in batches of {POINTS_REDEEM_MINIMUM.toLocaleString()} points. You can convert them to wallet balance and then use them for the selected action.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {targetOptions.map((target) => (
                <Button
                  key={target.value}
                  type="button"
                  variant={redeemTarget === target.value ? "default" : "outline"}
                  className="justify-start h-auto py-3 text-left"
                  onClick={() => setRedeemTarget(target.value)}
                >
                  <div className="flex flex-col items-start">
                    <span>{target.label}</span>
                    <span className="text-xs font-normal opacity-70">{target.description}</span>
                  </div>
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">Points to redeem</label>
              <Input
                type="number"
                min={POINTS_REDEEM_MINIMUM}
                step={POINTS_REDEEM_MINIMUM}
                value={redeemAmount}
                onChange={(event) => setRedeemAmount(event.target.value)}
              />
              <p className="text-xs text-stone-500">
                Available redeemable points: {redeemablePoints.toLocaleString()}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRedeemOpen(false)} disabled={redeeming}>
              Cancel
            </Button>
            <Button onClick={handleRedeem} disabled={redeeming} className="bg-amber-500 hover:bg-amber-600 text-stone-900">
              {redeeming ? "Redeeming..." : "Redeem Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
