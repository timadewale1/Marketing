import { redirect } from "next/navigation"
import { requireSubmissionManagementSession } from "@/lib/submissionmanagement-session"
import SubmissionManagementShell from "../SubmissionManagementShell"

export default async function SubmissionManagementProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  try {
    await requireSubmissionManagementSession()
  } catch {
    redirect("/submissionmanagement/login")
  }

  return <SubmissionManagementShell>{children}</SubmissionManagementShell>
}
