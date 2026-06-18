"use client"

import Link from "next/link"
import { Store, ShieldCheck, Package, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AdminPageHeader, MetricCard, SectionCard, EmptyState, StatusBadge } from "@/app/admin/_components/admin-primitives"

export default function AdminVendorsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Vendor management"
        title="Pamba Vendors"
        description="Review vendor verification, rent status, and product listings from one place."
        action={
          <Button asChild className="rounded-full">
            <Link href="/marketplace">Open marketplace</Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Pending verification" value="0" hint="Vendors waiting for approval" icon={ShieldCheck} />
        <MetricCard label="Active shops" value="0" hint="Verified vendors with products live" icon={Store} tone="emerald" />
        <MetricCard label="Products listed" value="0" hint="All published vendor products" icon={Package} tone="blue" />
        <MetricCard label="Rent overdue" value="0" hint="Vendors on hold for unpaid monthly rent" icon={Wallet} tone="rose" />
      </div>

      <SectionCard title="Verification queue" description="Approve a vendor after email, address, proof of address, NIN, and face verification are complete.">
        <EmptyState
          title="No vendors waiting right now"
          description="Once vendors start signing up, their verification requests will appear here with the review actions."
        />
      </SectionCard>

      <SectionCard title="Products" description="Product listings and storefront links will show up here once vendors begin publishing items.">
        <EmptyState
          title="No products live yet"
          description="The marketplace is still onboarding vendors, so product moderation will appear here when the first shops go live."
        />
      </SectionCard>

      <SectionCard title="Recent vendor updates" description="You will also see rent status, approval actions, and shop activity in this area.">
        <div className="flex flex-wrap gap-2">
          <StatusBadge label="Onboarding" tone="amber" />
          <StatusBadge label="Verification pending" tone="blue" />
          <StatusBadge label="Store hidden" tone="red" />
        </div>
      </SectionCard>
    </div>
  )
}
