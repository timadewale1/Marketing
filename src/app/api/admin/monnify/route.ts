import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/admin-session"
import {
  getTransactionsSearch,
  getWalletBalance,
  getWalletStatement,
  searchDisbursementTransactions,
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

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function asArray<T = Record<string, unknown>>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : []
}

function parseDateParam(value: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function matchesStatementFilter(type: string, filter: string) {
  const normalizedType = type.toLowerCase()
  if (filter === "credit") {
    return normalizedType.includes("credit") || normalizedType.includes("inflow")
  }
  if (filter === "debit") {
    return normalizedType.includes("debit") || normalizedType.includes("withdraw") || normalizedType.includes("disbursement")
  }
  return true
}

function getTransactionSearchItems(payload: Record<string, unknown>) {
  const responseBody = asRecord(payload.responseBody)
  return asArray<Record<string, unknown>>(responseBody.content).length > 0
    ? asArray<Record<string, unknown>>(responseBody.content)
    : asArray<Record<string, unknown>>(responseBody.transactions)
}

export async function GET(req: Request) {
  await requireAdminSession()

  const { searchParams } = new URL(req.url)
  const statementPage = Math.max(0, Number(searchParams.get("statementPage") || 0))
  const statementSize = Math.min(50, Math.max(5, Number(searchParams.get("statementSize") || 20)))
  const disbursementPage = Math.max(0, Number(searchParams.get("disbursementPage") || 0))
  const disbursementSize = Math.min(50, Math.max(5, Number(searchParams.get("disbursementSize") || 20)))
  const statementFilter = String(searchParams.get("statementFilter") || "all").toLowerCase()
  const disbursementFilter = String(searchParams.get("disbursementFilter") || "all").toLowerCase()
  const startDate = parseDateParam(searchParams.get("startDate"))
  const endDate = parseDateParam(searchParams.get("endDate"))

  try {
    const [walletBalanceResponse, walletStatementResponse, disbursementResponse, creditsResponse] = await Promise.all([
      getWalletBalance(),
      getWalletStatement({
        pageNo: statementPage,
        pageSize: statementSize,
        startDate: startDate?.getTime() ?? null,
        endDate: endDate?.getTime() ?? null,
        enableTimeFilter: Boolean(startDate || endDate),
      }),
      searchDisbursementTransactions({
        pageNo: disbursementPage,
        pageSize: disbursementSize,
        startDate: startDate?.getTime() ?? null,
        endDate: endDate?.getTime() ?? null,
      }),
      getTransactionsSearch({
        page: 0,
        size: 50,
      }),
    ])

    const walletBalanceBody = asRecord(walletBalanceResponse.responseBody)
    const statementBody = asRecord(walletStatementResponse.responseBody)
    const disbursementBody = asRecord(disbursementResponse.responseBody)

    const walletStatementItems = asArray<Record<string, unknown>>(statementBody.content).map((entry) => {
      const amount = asNumber(entry.amount)
      const transactionType = String(entry.transactionType || entry.type || entry.entryType || "")
      const reference = String(
        entry.walletTransactionReference ||
        entry.transactionReference ||
        entry.monnifyTransactionReference ||
        entry.reference ||
        ""
      )

      return {
        reference,
        transactionType,
        amount,
        balanceBefore: asNumber(entry.balanceBefore),
        balanceAfter: asNumber(entry.balanceAfter),
        currency: String(entry.currency || "NGN"),
        status: String(entry.status || entry.paymentStatus || transactionType || "Recorded"),
        createdOn: toIso(entry.createdOn || entry.transactionDate || entry.createdAt),
        narration: String(entry.narration || entry.remark || entry.description || ""),
      }
    })

    const filteredWalletStatement = walletStatementItems.filter((item) =>
      matchesStatementFilter(item.transactionType, statementFilter)
    )

    const disbursementItems = asArray<Record<string, unknown>>(
      disbursementBody.content ?? disbursementBody.items ?? disbursementBody.transactions
    )
      .map((entry) => ({
        reference: String(entry.reference || entry.transactionReference || entry.disbursementReference || ""),
        amount: asNumber(entry.amount),
        status: String(entry.status || entry.paymentStatus || "Recorded"),
        createdOn: toIso(entry.createdOn || entry.transactionDate || entry.createdAt),
        narration: String(entry.narration || entry.remark || entry.description || ""),
        destinationAccountNumber: String(entry.destinationAccountNumber || ""),
        destinationBankCode: String(entry.destinationBankCode || ""),
        fee: asNumber(entry.fee || entry.transactionFee),
        currency: String(entry.currency || "NGN"),
      }))
      .filter((item) => disbursementFilter === "all" || item.status.toLowerCase() === disbursementFilter)

    const recentCollections = getTransactionSearchItems(creditsResponse)
      .map((entry) => {
        const customer = asRecord(entry.customer)
        return {
          reference: String(entry.transactionReference || entry.paymentReference || entry.reference || ""),
          paymentReference: String(entry.paymentReference || ""),
          amount: asNumber(entry.amountPaid || entry.amount || entry.totalPayable),
          status: String(entry.paymentStatus || entry.status || ""),
          paidOn: toIso(entry.paidOn || entry.completedOn || entry.createdOn),
          customerName: String(customer.name || ""),
          customerEmail: String(customer.email || ""),
        }
      })
      .filter((entry) => entry.amount > 0)
      .slice(0, 20)

    const pendingSettlementItems = recentCollections.filter((item) => {
      const status = item.status.toUpperCase()
      return status === "PAID" || status === "SUCCESS" || status === "SUCCESSFUL"
    })

    const pendingSettlementAmount = pendingSettlementItems.reduce((sum, item) => sum + item.amount, 0)
    const totalCredits = filteredWalletStatement
      .filter((item) => matchesStatementFilter(item.transactionType, "credit"))
      .reduce((sum, item) => sum + Math.max(0, item.amount), 0)
    const totalDebits = filteredWalletStatement
      .filter((item) => matchesStatementFilter(item.transactionType, "debit"))
      .reduce((sum, item) => sum + Math.abs(item.amount), 0)
    const totalDisbursements = disbursementItems.reduce((sum, item) => sum + Math.max(0, item.amount), 0)

    return NextResponse.json({
      success: true,
      wallet: {
        accountNumber: String(walletBalanceBody.accountNumber || process.env.MONNIFY_WALLET_ACCOUNT_NUMBER || ""),
        availableBalance: asNumber(walletBalanceBody.availableBalance ?? walletBalanceBody.availableBalanceAmount ?? walletBalanceBody.balance),
        ledgerBalance: asNumber(walletBalanceBody.ledgerBalance ?? walletBalanceBody.actualBalance ?? walletBalanceBody.balance),
        currency: String(walletBalanceBody.currency || "NGN"),
      },
      summary: {
        totalCredits,
        totalDebits,
        totalDisbursements,
        pendingSettlementsAmount: pendingSettlementAmount,
      },
      filters: {
        startDate: startDate?.toISOString() ?? null,
        endDate: endDate?.toISOString() ?? null,
        statementFilter,
        disbursementFilter,
      },
      pendingSettlements: {
        count: pendingSettlementItems.length,
        totalAmount: pendingSettlementAmount,
        note: "Recent successful collections returned by Monnify transaction search for your account.",
        items: pendingSettlementItems,
      },
      statement: {
        page: statementPage,
        size: statementSize,
        total: asNumber(statementBody.totalElements ?? statementBody.totalCount ?? walletStatementItems.length),
        items: filteredWalletStatement,
      },
      disbursements: {
        page: disbursementPage,
        size: disbursementSize,
        total: asNumber(disbursementBody.totalElements ?? disbursementBody.totalCount ?? disbursementItems.length),
        items: disbursementItems,
      },
    })
  } catch (error) {
    console.error("[admin][monnify] failed to load dashboard data", error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to load Monnify account data",
      },
      { status: 500 }
    )
  }
}
