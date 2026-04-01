"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import toast from "react-hot-toast";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import {
  AdminPageHeader,
  EmptyState,
  SectionCard,
  StatusBadge,
} from "@/app/admin/_components/admin-primitives";

type DirectAdRequest = {
  id: string;
  businessName?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  advertType?: string;
  duration?: string;
  budget?: number;
  message?: string;
  status?: string;
};

export default function DirectAdRequestDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<DirectAdRequest | null>(null);

  useEffect(() => {
    const load = async () => {
      const docId = typeof id === "string" ? id : id?.[0];
      if (!docId) return;

      try {
        const snap = await getDoc(doc(db, "directAdvertRequests", docId));
        if (!snap.exists()) {
          setRequest(null);
          return;
        }
        setRequest({ id: snap.id, ...(snap.data() || {}) });
      } catch (error) {
        console.error(error);
        toast.error("Failed to load request");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const setStatus = async (status: string) => {
    if (!request) return;
    try {
      const response = await fetch(`/api/admin/direct-ad-requests/${request.id}`, {
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
      setRequest({ ...request, status });
      toast.success("Request updated");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update request");
    }
  };

  if (loading) {
    return <div className="h-48 animate-pulse rounded-3xl bg-stone-100" />;
  }

  if (!request) {
    return (
      <div className="space-y-6">
        <AdminPageHeader eyebrow="Direct ad detail" title="Request not found" description="This direct advert request could not be located." />
        <EmptyState
          title="Missing request"
          description="The request may have been removed or the link may be incorrect."
          href="/admin/direct-ad-requests"
          cta="Back to direct ads"
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Direct ad detail"
        title={request.businessName || "Unnamed request"}
        description="Review the full submission details and update the approval state."
        action={
          <Button variant="outline" className="rounded-full" onClick={() => router.back()}>
            Back
          </Button>
        }
      />

      <div className="flex gap-2">
        <StatusBadge
          label={request.status || "pending"}
          tone={
            request.status === "approved"
              ? "green"
              : request.status === "rejected"
                ? "red"
                : "amber"
          }
        />
      </div>

      <SectionCard title="Request details" description="Business, contact, and request information.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-stone-50 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Contact</p>
            <div className="mt-3 space-y-2 text-sm text-stone-700">
              <p>{request.contactName || "No contact name"}</p>
              <p>{request.phone || "No phone"}</p>
              <p>{request.email || "No email"}</p>
            </div>
          </div>
          <div className="rounded-2xl bg-stone-50 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Campaign ask</p>
            <div className="mt-3 space-y-2 text-sm text-stone-700">
              <p>{request.advertType || "No advert type"}</p>
              <p>{request.duration || "No duration"}</p>
              <p>₦{Number(request.budget || 0).toLocaleString()}</p>
            </div>
          </div>
          <div className="rounded-2xl bg-stone-50 p-4 md:col-span-2">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Message</p>
            <p className="mt-3 text-sm leading-7 text-stone-700">
              {request.message || "No message supplied."}
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button className="rounded-full bg-stone-900 text-white hover:bg-stone-800" onClick={() => setStatus("approved")}>
            Approve
          </Button>
          <Button variant="outline" className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setStatus("rejected")}>
            Reject
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
