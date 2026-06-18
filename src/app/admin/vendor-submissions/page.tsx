"use client"

import { CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AdminPageHeader, EmptyState, SectionCard, StatusBadge } from "@/app/admin/_components/admin-primitives"

export default function AdminVendorSubmissionsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Cashback review"
        title="Vendor Purchase Submissions"
        description="Review purchase evidence from earners and advertisers, then approve or reject the cashback claim."
      />

      <SectionCard
        title="Review queue"
        description="When a shopper submits proof of purchase from a Pamba vendor, the claim will land here for approval."
      >
        <EmptyState
          title="No cashback claims yet"
          description="Claims for 10% cashback will appear here once users start submitting vendor purchase evidence."
        />
      </SectionCard>

      <SectionCard
        title="Example actions"
        description="Approved claims will credit cashback automatically, while rejected claims can carry a clear reason."
      >
        <div className="flex flex-wrap gap-3">
          <Button className="rounded-full bg-emerald-600 hover:bg-emerald-500">
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Approve claim
          </Button>
          <Button variant="outline" className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50">
            <XCircle className="mr-2 h-4 w-4" />
            Reject claim
          </Button>
          <StatusBadge label="Awaiting proof" tone="amber" />
        </div>
      </SectionCard>
    </div>
  )
}
