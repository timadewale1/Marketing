"use client"

import { useEffect, useMemo, useState } from "react"
import { collection, getDocs, limit, orderBy, query, startAfter, where } from "firebase/firestore"
import { Search, ShoppingCart, Banknote, ChartColumnBig } from "lucide-react"
import { db } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AdminPageHeader,
  EmptyState,
  MetricCard,
  PaginatedCardList,
  SectionCard,
  StatusBadge,
} from "@/app/admin/_components/admin-primitives"
import { getBillsCommission, getBillsServiceLabel } from "@/lib/bills-commission"

type BillRecord = {
  id: string
  serviceID: string
  serviceLabel: string
  amount: number
  paidAmount: number
  profit: number
  profitRate: number
  actorName: string
  actorRole: string
  actorUserId?: string
  paymentChannel?: string
  status?: string
  createdAtMs: number
  reference?: string
  response?: unknown
}

function toMillis(value: unknown) {
  if (!value) return 0
  if (typeof value === "object" && value !== null && "seconds" in value) {
    return Number((value as { seconds?: number }).seconds || 0) * 1000
  }
  if (value instanceof Date) return value.getTime()
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

function asLower(value: unknown) {
  return String(value || "").trim().toLowerCase()
}

export default function AdminBillsProfitPage() {
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState("")
  const [records, setRecords] = useState<BillRecord[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [cursor, setCursor] = useState<unknown | null>(null)
  const [stats, setStats] = useState({ totalPurchases: 0, totalAmount: 0, totalProfit: 0 })

  const mapRecord = (id: string, data: Record<string, unknown>): BillRecord => {
    const paidAmount = Number(data.paidAmount || data.amount || 0)
    const profitMeta = getBillsCommission(String(data.serviceID || ""), paidAmount, String(data.serviceLabel || getBillsServiceLabel(String(data.serviceID || ""))))
    return {
      id,
      serviceID: String(data.serviceID || ""),
      serviceLabel: String(data.serviceLabel || profitMeta.label || getBillsServiceLabel(String(data.serviceID || ""))),
      amount: Number(data.amount || 0),
      paidAmount,
      profit: Number(data.profit || profitMeta.profit || 0),
      profitRate: Number(data.profitRate || profitMeta.rate || 0),
      actorName: String(data.actorName || "Guest user"),
      actorRole: String(data.actorRole || "guest"),
      actorUserId: data.actorUserId ? String(data.actorUserId) : undefined,
      paymentChannel: data.paymentChannel ? String(data.paymentChannel) : undefined,
      status: String(data.status || ""),
      createdAtMs: toMillis(data.createdAt),
      reference: String(data.reference || data.paystackReference || data.request_id || ""),
      response: data.response,
    }
  }

  const loadStats = async () => {
    const response = await fetch("/api/admin/vtpass/stats", { credentials: "include" })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.message || "Failed to load bills profit stats")
    }
    setStats({
      totalPurchases: Number(payload.stats?.totalTransactions || 0),
      totalAmount: Number(payload.stats?.totalTransacted || 0),
      totalProfit: Number(payload.stats?.totalMarkup || 0),
    })
  }

  const loadPage = async (append = false, nextCursor: unknown | null = null) => {
    const baseQuery = query(
      collection(db, "vtpassTransactions"),
      orderBy("createdAt", "desc"),
      ...(nextCursor ? [startAfter(nextCursor as never)] : []),
      limit(25)
    )
    const snapshot = await getDocs(baseQuery)
    const mapped = snapshot.docs.map((docItem) => mapRecord(docItem.id, docItem.data() as Record<string, unknown>))
    setRecords((current) => (append ? [...current, ...mapped] : mapped))
    setHasMore(snapshot.docs.length === 25)
    setCursor(snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null)
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        await loadStats()
        await loadPage(false, null)
      } catch (error) {
        console.error("Failed to load bills profit dashboard", error)
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const term = search.trim().toLowerCase()

    const runSearch = async () => {
      if (!term) {
        await loadPage(false, null)
        return
      }

      const searchQueries = [
        query(collection(db, "vtpassTransactions"), where("actorNameLower", "==", term), limit(50)),
        query(collection(db, "vtpassTransactions"), where("serviceIDLower", "==", term), limit(50)),
        query(collection(db, "vtpassTransactions"), where("referenceLower", "==", term), limit(50)),
        query(collection(db, "vtpassTransactions"), where("userId", "==", term), limit(50)),
      ]

      const snaps = await Promise.all(searchQueries.map((q) => getDocs(q).catch(() => null)))
      const merged = new Map<string, BillRecord>()
      snaps.forEach((snap) => {
        snap?.docs.forEach((docItem) => {
          merged.set(docItem.id, mapRecord(docItem.id, docItem.data() as Record<string, unknown>))
        })
      })

      if (active) {
        const list = Array.from(merged.values()).sort((a, b) => b.createdAtMs - a.createdAtMs)
        setRecords(list)
        setHasMore(false)
        setCursor(null)
      }
    }

    runSearch().catch((error) => {
      console.error("Failed to search bills profit records", error)
    })

    return () => {
      active = false
    }
  }, [search])

  const filtered = useMemo(() => records, [records])

  const totals = useMemo(() => {
    return {
      profitMargin: stats.totalAmount > 0 ? (stats.totalProfit / stats.totalAmount) * 100 : 0,
    }
  }, [stats.totalAmount, stats.totalProfit])

  const loadMore = async () => {
    if (!hasMore || loadingMore || !cursor) return
    setLoadingMore(true)
    try {
      const nextQuery = query(
        collection(db, "vtpassTransactions"),
        orderBy("createdAt", "desc"),
        startAfter(cursor as never),
        limit(25)
      )
      const snapshot = await getDocs(nextQuery)
      const mapped = snapshot.docs.map((docItem) => mapRecord(docItem.id, docItem.data() as Record<string, unknown>))
      setRecords((current) => [...current, ...mapped])
      setHasMore(snapshot.docs.length === 25)
      setCursor(snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : cursor)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Bills"
        title="Bills profit"
        description="Track purchase history, the buying user or guest, and profit from each bill transaction."
        action={
          <Button
            variant="outline"
            className="rounded-full border-stone-300 bg-white/80"
            onClick={() => window.location.reload()}
          >
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Purchases" value={stats.totalPurchases} hint="All tracked bills purchases" icon={ShoppingCart} />
        <MetricCard label="Amount" value={`₦${stats.totalAmount.toLocaleString()}`} hint="Total money spent" icon={Banknote} tone="blue" />
        <MetricCard label="Profit" value={`₦${stats.totalProfit.toLocaleString()}`} hint="Calculated commission earnings" icon={ChartColumnBig} tone="emerald" />
        <MetricCard label="Profit rate" value={`${totals.profitMargin.toFixed(2)}%`} hint="Profit as a share of spend" icon={ChartColumnBig} tone="rose" />
      </div>

      <SectionCard title="Search transactions" description="Search exact actor names, service IDs, references, or user IDs.">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search bills purchases"
            className="h-11 rounded-2xl border-stone-200 bg-white pl-10"
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Purchase history"
        description={`${filtered.length} transaction${filtered.length === 1 ? "" : "s"} loaded. Most recent purchases appear first.`}
      >
        {loading ? (
          <div className="h-48 animate-pulse rounded-3xl bg-stone-100" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No purchases found"
            description="When bills payments are processed, they will show up here with profit totals."
          />
        ) : (
          <PaginatedCardList
            items={filtered}
            itemsPerPage={3}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            renderItem={(record) => (
              <div key={record.id} className="rounded-3xl border border-stone-200 bg-white p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-stone-900">{record.actorName}</h3>
                      <StatusBadge label={record.actorRole || "guest"} tone={record.actorRole === "advertiser" ? "blue" : "amber"} />
                      <StatusBadge label={record.status || "completed"} tone={record.status === "failed" ? "red" : record.status === "pending" ? "amber" : "green"} />
                    </div>
                    <p className="text-sm text-stone-600">
                      {record.paymentChannel === "wallet" ? "Wallet purchase" : "Direct or external purchase"} • {record.serviceLabel || record.serviceID}
                    </p>
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                      {record.createdAtMs ? new Date(record.createdAtMs).toLocaleString() : "Unknown date"}
                    </p>
                  </div>
                  <div className="grid gap-3 text-left lg:text-right">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Amount</p>
                      <p className="text-lg font-semibold text-stone-900">₦{record.paidAmount.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Profit</p>
                      <p className="text-lg font-semibold text-emerald-700">₦{record.profit.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Reference</p>
                      <p className="text-sm text-stone-700">{record.reference || "—"}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          />
        )}
      </SectionCard>
    </div>
  )
}
