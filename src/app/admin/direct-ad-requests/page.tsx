"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Megaphone, Search } from "lucide-react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import toast from "react-hot-toast";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AdminPageHeader,
  EmptyState,
  MetricCard,
  PaginatedCardList,
  SectionCard,
  StatusBadge,
} from "@/app/admin/_components/admin-primitives";

type DirectAdvertRequest = {
  id: string;
  businessName?: string;
  contactName: string;
  phone: string;
  email: string;
  advertType?: string;
  duration?: string;
  budget?: number;
  message?: string;
  status: string;
};

function currency(amount?: number) {
  return `₦${Number(amount || 0).toLocaleString()}`;
}

export default function AdminDirectAdRequestsPage() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<DirectAdvertRequest[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const snap = await getDocs(query(collection(db, "directAdvertRequests"), orderBy("createdAt", "desc"), limit(200)));
      setRequests(
        snap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            businessName: data.businessName ? String(data.businessName) : undefined,
            contactName: String(data.contactName || ""),
            phone: String(data.phone || ""),
            email: String(data.email || ""),
            advertType: data.advertType ? String(data.advertType) : undefined,
            duration: data.duration ? String(data.duration) : undefined,
            budget: Number(data.budget || 0),
            message: data.message ? String(data.message) : undefined,
            status: String(data.status || "pending"),
          };
        })
      );
      setLoading(false);
    };

    load().catch((error) => {
      console.error("Failed to load direct advert requests", error);
      toast.error("Failed to load direct advert requests");
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return requests.filter((request) => {
      if (!term) return true;
      return (
        (request.businessName || "").toLowerCase().includes(term) ||
        request.contactName.toLowerCase().includes(term) ||
        request.email.toLowerCase().includes(term)
      );
    });
  }, [requests, search]);

  const setStatus = async (id: string, status: string) => {
    try {
      const response = await fetch(`/api/admin/direct-ad-requests/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to update request");
      }
      setRequests((current) =>
        current.map((request) => (request.id === id ? { ...request, status } : request))
      );
      toast.success("Request updated");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update request");
    }
  };

  const stats = {
    total: requests.length,
    pending: requests.filter((request) => request.status === "pending").length,
    approved: requests.filter((request) => request.status === "approved").length,
  };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Direct ads"
        title="Direct advert requests"
        description="Review businesses asking for handled campaigns and move them through approval faster."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Requests" value={stats.total} hint="All direct ad requests" icon={Megaphone} />
        <MetricCard label="Pending" value={stats.pending} hint="Needs review" icon={Megaphone} tone="amber" />
        <MetricCard label="Approved" value={stats.approved} hint="Already accepted" icon={Megaphone} tone="emerald" />
      </div>

      <SectionCard title="Search requests" description="Search by business, contact, or email.">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search direct advert requests"
            className="h-11 rounded-2xl border-stone-200 bg-white pl-10"
          />
        </div>
      </SectionCard>

      <SectionCard title="Requests" description={`${filtered.length} request${filtered.length === 1 ? "" : "s"} matched the current search.`}>
        {loading ? (
          <div className="h-48 animate-pulse rounded-3xl bg-stone-100" />
        ) : filtered.length === 0 ? (
          <EmptyState title="No requests" description="No direct advert requests matched the current search." />
        ) : (
          <PaginatedCardList
            items={filtered}
            itemsPerPage={3}
            renderItem={(request) => (
              <div key={request.id} className="rounded-3xl border border-stone-200 bg-white p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/direct-ad-requests/${request.id}`}
                        className="text-lg font-semibold text-stone-900 hover:text-amber-700"
                      >
                        {request.businessName || "Unnamed request"}
                      </Link>
                      <StatusBadge
                        label={request.status}
                        tone={
                          request.status === "approved"
                            ? "green"
                            : request.status === "rejected"
                              ? "red"
                              : "amber"
                        }
                      />
                    </div>
                    <p className="text-sm text-stone-500">
                      {request.contactName} • {request.phone} • {request.email}
                    </p>
                    <p className="text-sm text-stone-600">
                      {request.advertType || "No type"} • {request.duration || "No duration"} • {currency(request.budget)}
                    </p>
                    {request.message ? (
                      <p className="text-sm leading-6 text-stone-600">{request.message}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" className="rounded-full">
                      <Link href={`/admin/direct-ad-requests/${request.id}`}>Open request</Link>
                    </Button>
                    <Button className="rounded-full bg-stone-900 text-white hover:bg-stone-800" onClick={() => setStatus(request.id, "approved")}>
                      Approve
                    </Button>
                    <Button variant="outline" className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setStatus(request.id, "rejected")}>
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            )}
          />
        )}
      </SectionCard>
    </div>
  );
}
