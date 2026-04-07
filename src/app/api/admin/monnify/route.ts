import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/admin-session"
import {
  getSettlementInformationForTransaction,
  getTransactionsSearch,
  getWalletBalance,
  getWalletTransactions,
} from "@/services/monnify"

function asNumber(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

function toIso(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

function getSettlementEntries(payload: Record<string, unknown> | undefined) {
  const responseBody = payload?.responseBody
  if (!responseBody || typeof responseBody !== "object") return []
  const settlements = (responseBody as Record<string, unknown>).settlements
  return Array.isArray(settlements) ? settlements : []
}

export async function GET(req: Request) {
  await requireAdminSession()

  const { searchParams } = new URL(req.url)
  const page = Math.max(0, Number(searchParams.get("page") || 0))
  const size = Math.min(50, Math.max(5, Number(searchParams.get("size") || 20)))

  try {
    const [walletBalanceResponse, walletTransactionsResponse, transactionSearchResponse] = await Promise.all([
      getWalletBalance(),
      getWalletTransactions({ pageNo: page, pageSize: size }),
      getTransactionsSearch({ page, size: Math.max(size, 30) }),
    ])

    const walletBalanceBody = walletBalanceResponse.responseBody || {}
    const walletTransactionsBody = (walletTransactionsResponse.responseBody || {}) as Record<string, unknown>
    const searchBody = (transactionSearchResponse.responseBody || {}) as Record<string, unknown>

    const walletTransactions = Array.isArray(walletTransactionsBody.content)
      ? walletTransactionsBody.content.map((transaction) => {
          const row = transaction as Record<string, unknown>
          return {
            walletTransactionReference: String(row.walletTransactionReference || row.reference || ""),
            monnifyTransactionReference: String(row.monnifyTransactionReference || ""),
            transactionType: String(row.transactionType || row.type || ""),
            amount: asNumber(row.amount),
            balanceBefore: asNumber(row.balanceBefore),
            balanceAfter: asNumber(row.balanceAfter),
            currency: String(row.currency || "NGN"),
            status: String(row.status || row.paymentStatus || ""),
            createdOn: toIso(row.createdOn || row.transactionDate || row.createdAt),
            narration: String(row.narration || row.remark || ""),
          }
        })
      : []

    const collectionTransactions = Array.isArray(searchBody.content)
      ? searchBody.content
      : Array.isArray(searchBody.transactions)
        ? searchBody.transactions
        : []

    const successfulTransactions = collectionTransactions
      .map((transaction) => transaction as Record<string, unknown>)
      .filter((transaction) => {
        const status = String(transaction.paymentStatus || transaction.status || "").toUpperCase()
        return status === "PAID" || status === "SUCCESS" || status === "SUCCESSFUL"
      })
      .slice(0, 12)

    const settlementResults = await Promise.all(
      successfulTransactions.map(async (transaction) => {
        const transactionReference = String(transaction.transactionReference || "")
        if (!transactionReference) return null
        try {
          const payload = await getSettlementInformationForTransaction(transactionReference)
          const settlements = getSettlementEntries(payload)
          if (settlements.length > 0) {
            return {
              transactionReference,
              settled: true,
              payload,
              settlements,
              transaction,
            }
          }
          return {
            transactionReference,
            settled: false,
            payload,
            settlements: [],
            transaction,
          }
        } catch {
          return {
            transactionReference,
            settled: false,
            payload: null,
            settlements: [],
            transaction,
          }
        }
      })
    )

    const pendingSettlements = settlementResults
      .filter((item): item is NonNullable<typeof item> => Boolean(item) && !item?.settled)
      .map((item) => ({
        transactionReference: item.transactionReference,
        paymentReference: String(item.transaction.paymentReference || ""),
        amountPaid: asNumber(item.transaction.amountPaid || item.transaction.amount || item.transaction.totalPayable),
        customerName: String((item.transaction.customer as Record<string, unknown> | undefined)?.name || ""),
        customerEmail: String((item.transaction.customer as Record<string, unknown> | undefined)?.email || ""),
        paidOn: toIso(item.transaction.paidOn || item.transaction.completedOn || item.transaction.createdOn),
        status: String(item.transaction.paymentStatus || item.transaction.status || ""),
      }))

    const pendingSettlementAmount = pendingSettlements.reduce((sum, item) => sum + item.amountPaid, 0)

    return NextResponse.json({
      success: true,
      wallet: {
        accountNumber: String(walletBalanceBody.accountNumber || process.env.MONNIFY_WALLET_ACCOUNT_NUMBER || ""),
        availableBalance: asNumber(walletBalanceBody.availableBalance ?? walletBalanceBody.availableBalanceAmount ?? walletBalanceBody.balance),
        ledgerBalance: asNumber(walletBalanceBody.ledgerBalance ?? walletBalanceBody.actualBalance ?? walletBalanceBody.balance),
        currency: String(walletBalanceBody.currency || "NGN"),
      },
      pendingSettlements: {
        count: pendingSettlements.length,
        totalAmount: pendingSettlementAmount,
        note: "Pending settlements are inferred from successful recent Monnify transactions that do not yet return settlement details.",
        items: pendingSettlements,
      },
      transactions: {
        page,
        size,
        total: asNumber(walletTransactionsBody.totalElements ?? walletTransactionsBody.totalCount ?? walletTransactions.length),
        items: walletTransactions,
      },
    })
  } catch (error) {
    console.error("[admin][monnify] failed to load dashboard data", error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to load Monnify data",
      },
      { status: 500 }
    )
  }
}
