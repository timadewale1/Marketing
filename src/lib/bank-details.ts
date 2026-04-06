export type BankDetails = {
  accountNumber: string
  bankName: string
  accountName: string
  bankCode?: string
  verified?: boolean
}

type BankLike = {
  bank?: Partial<BankDetails> | null
  bankCode?: string | null
  bankName?: string | null
  accountNumber?: string | null
  accountName?: string | null
}

export function getBankDetails(source: BankLike | null | undefined): BankDetails | null {
  if (!source) return null

  const nested = source.bank || {}
  const accountNumber = String(nested.accountNumber || source.accountNumber || "").trim()
  const bankName = String(nested.bankName || source.bankName || "").trim()
  const accountName = String(nested.accountName || source.accountName || "").trim()
  const bankCode = String(nested.bankCode || source.bankCode || "").trim()
  const verified = Boolean(nested.verified)

  if (!accountNumber || !bankName || !accountName) {
    return null
  }

  return {
    accountNumber,
    bankName,
    accountName,
    bankCode: bankCode || undefined,
    verified,
  }
}
