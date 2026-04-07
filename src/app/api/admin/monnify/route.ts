import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/admin-session"
import {
  getTransactionsSearch,
  searchDisbursementTransactions,
} from "@/services/monnify"

type FeatureResult<T> = {
  ok: boolean
  data: T | null
  message: string | null
}

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

function matchesTransactionFilter(status: string, filter: string) {
  const normalizedStatus = status.toLowerCase()
  if (filter === "credit") {
    return normalizedStatus === "paid" || normalizedStatus === "success" || normalizedStatus === "successful"
  }
  if (filter === "debit") {
    return normalizedStatus === "reversed" || normalizedStatus === "failed" || normalizedStatus === "cancelled"
  }
  return true
}

function getTransactionSearchItems(payload: Record<string, unknown>) {
  const responseBody = asRecord(payload.responseBody)
  return asArray<Record<string, unknown>>(responseBody.content).length > 0
    ? asArray<Record<string, unknown>>(responseBody.content)
    : asArray<Record<string, unknown>>(responseBody.transactions)
}

function formatFeatureError(error: unknown) {
  if (!(error instanceof Error)) return "Unable to load this Monnify feature."
  const message = error.message || "Unable to load this Monnify feature."
  if (message.includes("You're not permitted to access this functionality")) {
    return "This Monnify feature is not enabled on your account yet."
  }
  return message
}

async function safeFeature<T>(loader: () => Promise<T>): Promise<FeatureResult<T>> {
  try {
    return {
      ok: true,
      data: await loader(),
      message: null,
    }
  } catch (error) {
    return {
      ok: false,
      data: null,
      message: formatFeatureError(error),
    }
  }
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
  const search = String(searchParams.get("search") || "").trim().toLowerCase()
  const startDate = parseDateParam(searchParams.get("startDate"))
  const endDate = parseDateParam(searchParams.get("endDate"))

  try {
    const [collectionsResult, disbursementResult] = await Promise.all([
      safeFeature(() =>
        getTransactionsSearch({
          page: statementPage,
          size: Math.max(statementSize, 50),
        })
      ),
      safeFeature(() =>
        searchDisbursementTransactions({
          pageNo: disbursementPage,
          pageSize: disbursementSize,
          startDate: startDate?.getTime() ?? null,
          endDate: endDate?.getTime() ?? null,
        })
      ),
    ])

    const collectionsItemsRaw = collectionsResult.ok
      ? getTransactionSearchItems(asRecord(collectionsResult.data))
      : []

    const collectionItems = collectionsItemsRaw
      .map((entry) => {
        const customer = asRecord(entry.customer)
        const status = String(entry.paymentStatus || entry.status || "")
        return {
          reference: String(entry.transactionReference || entry.paymentReference || entry.reference || ""),
          paymentReference: String(entry.paymentReference || ""),
          amount: asNumber(entry.amountPaid || entry.amount || entry.totalPayable),
          status,
          paidOn: toIso(entry.paidOn || entry.completedOn || entry.createdOn),
          customerName: String(customer.name || ""),
          customerEmail: String(customer.email || ""),
          narration: String(entry.paymentDescription || entry.description || ""),
          currency: String(entry.currencyCode || entry.currency || "NGN"),
        }
      })
      .filter((entry) => entry.amount > 0)
      .filter((entry) => matchesTransactionFilter(entry.status, statementFilter))
      .filter((entry) => {
        if (!search) return true
        return (
          entry.reference.toLowerCase().includes(search) ||
          entry.paymentReference.toLowerCase().includes(search) ||
          entry.customerEmail.toLowerCase().includes(search) ||
          entry.customerName.toLowerCase().includes(search)
        )
      })

    const successfulCollections = collectionItems.filter((item) => {
      const status = item.status.toUpperCase()
      return status === "PAID" || status === "SUCCESS" || status === "SUCCESSFUL"
    })

    const disbursementBody = asRecord(asRecord(disbursementResult.data).responseBody)
    const disbursementItems = disbursementResult.ok
      ? asArray<Record<string, unknown>>(
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
          .filter((item) => {
            if (!search) return true
            return (
              item.reference.toLowerCase().includes(search) ||
              item.destinationAccountNumber.toLowerCase().includes(search) ||
              item.destinationBankCode.toLowerCase().includes(search) ||
              item.narration.toLowerCase().includes(search)
            )
          })
      : []

    const totalCredits = successfulCollections.reduce((sum, item) => sum + item.amount, 0)
    const totalDebits = disbursementItems.reduce((sum, item) => sum + Math.max(0, item.amount + item.fee), 0)
    const totalDisbursements = disbursementItems.reduce((sum, item) => sum + Math.max(0, item.amount), 0)
    const netFlow = totalCredits - totalDebits

    return NextResponse.json({
      success: true,
      wallet: {
        accountNumber: String(process.env.MONNIFY_WALLET_ACCOUNT_NUMBER || ""),
        availableBalance: netFlow,
        ledgerBalance: netFlow,
        currency: collectionItems[0]?.currency || disbursementItems[0]?.currency || "NGN",
      },
      featureAccess: {
        walletBalance: {
          enabled: false,
          message: "Using Monnify transactions API totals because wallet balance is not enabled on this account.",
        },
        walletStatement: {
          enabled: collectionsResult.ok,
          message: collectionsResult.message,
        },
        disbursements: {
          enabled: disbursementResult.ok,
          message: disbursementResult.message,
        },
        collections: {
          enabled: collectionsResult.ok,
          message: collectionsResult.message,
        },
      },
      summary: {
        totalCredits,
        totalDebits,
        totalDisbursements,
        pendingSettlementsAmount: totalCredits,
      },
      filters: {
        startDate: startDate?.toISOString() ?? null,
        endDate: endDate?.toISOString() ?? null,
        statementFilter,
        disbursementFilter,
        search,
      },
      pendingSettlements: {
        count: successfulCollections.length,
        totalAmount: totalCredits,
        note: "Recent successful collections returned by Monnify transactions search for your account.",
        items: successfulCollections,
      },
      statement: {
        page: statementPage,
        size: statementSize,
        total: collectionItems.length,
        items: collectionItems.map((item) => ({
          reference: item.reference,
          paymentReference: item.paymentReference,
          transactionType: item.status || "Recorded",
          amount: item.amount,
          balanceBefore: 0,
          balanceAfter: 0,
          currency: item.currency || "NGN",
          status: item.status || "Recorded",
          createdOn: item.paidOn,
          narration: item.narration,
          customerName: item.customerName,
          customerEmail: item.customerEmail,
        })),
      },
      disbursements: {
        page: disbursementPage,
        size: disbursementSize,
        total: disbursementResult.ok
          ? asNumber(disbursementBody.totalElements ?? disbursementBody.totalCount ?? disbursementItems.length)
          : 0,
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
