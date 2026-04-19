"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Search, Sparkles } from "lucide-react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AdminPageHeader,
  EmptyState,
  MetricCard,
  PaginatedCardList,
  SectionCard,
  StatusBadge,
} from "@/app/admin/_components/admin-primitives";
import { summarizeCampaignProgress } from "@/lib/campaign-progress";

type Campaign = {
  id: string;
  title: string;
  advertiserName: string;
  category: string;
  status: string;
  budget: number;
  reservedBudget: number;
  earnerPrice: number;
  generatedLeads: number;
  targetLeads: number;
  description: string;
};

type SubmissionProgressRecord = {
  id: string;
  campaignId: string;
  status: string;
};

function currency(amount: number) {
  return `₦${amount.toLocaleString()}`;
}

export default function SubmissionManagementCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionProgressRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [campaignSnap, submissionsSnap] = await Promise.all([
        getDocs(query(collection(db, "campaigns"), orderBy("createdAt", "desc"))),
        getDocs(collection(db, "earnerSubmissions")),
      ]);

      setCampaigns(
        campaignSnap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            title: String(data.title || "Untitled campaign"),
            advertiserName: String(data.advertiserName || "Unknown advertiser"),
            category: String(data.category || "Unknown"),
            status: String(data.status || "Unknown"),
            budget: Number(data.budget || 0),
            reservedBudget: Number(data.reservedBudget || 0),
            earnerPrice: Number(data.earnerPrice || data.costPerLead || 0),
            generatedLeads: Number(data.generatedLeads || data.completedLeads || 0),
            targetLeads: Number(data.targetLeads || data.estimatedLeads || 0),
            description: String(data.description || ""),
          };
        })
      );

      setSubmissions(
        submissionsSnap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            campaignId: String(data.campaignId || ""),
            status: String(data.status || ""),
          };
        })
      );
      setLoading(false);
    };

    load().catch((error) => {
      console.error("Failed to load submission management campaigns", error);
      setLoading(false);
    });
  }, []);

  const categories = useMemo(() => Array.from(new Set(campaigns.map((campaign) => campaign.category))).filter(Boolean), [campaigns]);

  const filteredCampaigns = useMemo(() => {
    const term = search.trim().toLowerCase();
    return campaigns.filter((campaign) => {
      const matchesStatus = statusFilter === "all" || campaign.status === statusFilter;
      const matchesCategory = categoryFilter === "all" || campaign.category === categoryFilter;
      const matchesSearch =
        !term ||
        campaign.title.toLowerCase().includes(term) ||
        campaign.advertiserName.toLowerCase().includes(term) ||
        campaign.description.toLowerCase().includes(term);
      return matchesStatus && matchesCategory && matchesSearch;
    });
  }, [campaigns, categoryFilter, search, statusFilter]);

  const stats = useMemo(() => ({
    active: campaigns.filter((campaign) => campaign.status === "Active").length,
    paused: campaigns.filter((campaign) => campaign.status === "Paused").length,
    deleted: campaigns.filter((campaign) => campaign.status === "Deleted").length,
  }), [campaigns]);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Submission management"
        title="Campaign queue"
        description="Review campaigns and open the linked moderation detail without the broader advertiser-finance view."
        action={
          <Button variant="outline" className="rounded-full border-stone-300 bg-white/80" onClick={() => window.location.reload()}>
            <Sparkles className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Active" value={stats.active} hint="Currently running" icon={BarChart3} />
        <MetricCard label="Paused" value={stats.paused} hint="Temporarily halted" icon={BarChart3} tone="amber" />
        <MetricCard label="Deleted" value={stats.deleted} hint="History preserved" icon={BarChart3} tone="rose" />
      </div>

      <SectionCard title="Filters" description="Narrow campaigns by status, category, or text search.">
        <div className="grid gap-3 lg:grid-cols-[1.6fr_0.8fr_0.8fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, advertiser, or description" className="h-11 rounded-2xl border-stone-200 bg-white pl-10" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-11 rounded-2xl border-stone-200 bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {["Active", "Paused", "Stopped", "Completed", "Deleted"].map((status) => (
                <SelectItem key={status} value={status}>{status}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-11 rounded-2xl border-stone-200 bg-white"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>{category}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      <SectionCard title="Campaign list" description={`${filteredCampaigns.length} campaign${filteredCampaigns.length === 1 ? "" : "s"} matched the current filters.`}>
        {loading ? (
          <div className="h-48 animate-pulse rounded-3xl bg-stone-100" />
        ) : filteredCampaigns.length === 0 ? (
          <EmptyState title="No campaigns matched" description="Try widening the filters to see more campaigns." />
        ) : (
          <PaginatedCardList
            items={filteredCampaigns}
            itemsPerPage={3}
            renderItem={(campaign) => {
              const progress = summarizeCampaignProgress({
                target: campaign.targetLeads,
                generatedLeads: campaign.generatedLeads,
                submissions: submissions.filter((submission) => submission.campaignId === campaign.id),
              });

              return (
                <div key={campaign.id} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-[0_18px_40px_-34px_rgba(28,25,23,0.6)]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/submissionmanagement/campaigns/${campaign.id}`} className="text-lg font-semibold text-stone-900 hover:text-amber-700">
                          {campaign.title}
                        </Link>
                        <StatusBadge
                          label={campaign.status}
                          tone={campaign.status === "Active" ? "green" : campaign.status === "Paused" ? "amber" : campaign.status === "Deleted" ? "red" : "blue"}
                        />
                      </div>
                      <p className="text-sm text-stone-500">{campaign.advertiserName} • {campaign.category}</p>
                      <p className="text-sm leading-6 text-stone-600">{campaign.description || "No description recorded."}</p>
                    </div>
                    <Button asChild className="rounded-full bg-stone-900 text-white hover:bg-stone-800">
                      <Link href={`/submissionmanagement/campaigns/${campaign.id}`}>Open campaign</Link>
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-stone-50 p-3">
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Available</p>
                      <p className="mt-2 font-semibold text-stone-900">{currency(campaign.budget)}</p>
                    </div>
                    <div className="rounded-2xl bg-stone-50 p-3">
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Payout</p>
                      <p className="mt-2 font-semibold text-stone-900">{currency(campaign.earnerPrice)}</p>
                    </div>
                    <div className="rounded-2xl bg-stone-50 p-3">
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Progress</p>
                      <p className="mt-2 font-semibold text-stone-900">{progress.verified}/{progress.target || 0}</p>
                      <p className="mt-1 text-xs text-stone-500">{progress.pending} pending</p>
                    </div>
                  </div>
                </div>
              );
            }}
          />
        )}
      </SectionCard>
    </div>
  );
}
