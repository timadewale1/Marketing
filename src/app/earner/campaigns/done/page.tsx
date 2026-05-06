"use client";

import React, { useEffect, useState } from "react";
import { auth, db, storage } from "@/lib/firebase";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { PageLoader } from "@/components/ui/loader";
import { ArrowLeft } from "lucide-react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import toast from "react-hot-toast";
import { getProofUrls } from "@/lib/proofs";

type Submission = {
  id: string;
  campaignTitle?: string;
  createdAt?: import("firebase/firestore").Timestamp | Date | { seconds: number; nanoseconds: number } | string | undefined;
  status?: string;
  earnerPrice?: number;
  proofUrl?: string;
  proofUrls?: string[];
  note?: string;
  rejectionReason?: string;
};

export default function DoneCampaignsPage() {
  const [subs, setSubs] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [proofFiles, setProofFiles] = useState<Record<string, File[]>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const router = useRouter();
  const submissionsPerPage = 3;

  const getSubmissionDate = (value: Submission["createdAt"]) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === "object" && "seconds" in value && typeof value.seconds === "number") {
      return new Date(value.seconds * 1000);
    }
    if (typeof value === "string") {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  };

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.push("/auth/sign-in");
      return;
    }
    const q = query(collection(db, "earnerSubmissions"), where("userId", "==", user.uid), limit(250));
    const unsub = onSnapshot(q, (snap) => {
      const mapped: Submission[] = snap.docs.map((d) => {
        const data = d.data() as Partial<Submission>;
        return {
          id: d.id,
          campaignTitle: data.campaignTitle,
          createdAt: data.createdAt,
          status: data.status,
          earnerPrice: data.earnerPrice,
          proofUrl: data.proofUrl,
          proofUrls: getProofUrls(data as { proofUrl?: unknown; proofUrls?: unknown }),
          note: data.note,
          rejectionReason: data.rejectionReason,
        } as Submission;
      });

      mapped.sort((a, b) => {
        const aTime = getSubmissionDate(a.createdAt)?.getTime() || 0;
        const bTime = getSubmissionDate(b.createdAt)?.getTime() || 0;
        return bTime - aTime;
      });

      setSubs(mapped);
      setCurrentPage(1);
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  const uploadProofs = async (submissionId: string, files: File[]) => {
    const user = auth.currentUser;
    if (!user) throw new Error("You must be signed in");

    return Promise.all(
      files.map(async (file) => {
        const storageRef = ref(storage, `earnerSubmissions/${user.uid}/resubmits/${submissionId}/${Date.now()}-${file.name}`);
        await uploadBytes(storageRef, file);
        return getDownloadURL(storageRef);
      })
    );
  };

  const handleResubmit = async (submissionId: string) => {
    const files = proofFiles[submissionId] || [];
    if (files.length === 0) {
      toast.error("Select at least one new proof file");
      return;
    }

    try {
      setUpdatingId(submissionId);
      const user = auth.currentUser;
      if (!user) throw new Error("You must be signed in");
      const token = await user.getIdToken();
      const uploadedProofs = await uploadProofs(submissionId, files);
      const response = await fetch(`/api/earner/submissions/${submissionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ proofUrls: uploadedProofs }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to update proof");
      }
      setProofFiles((current) => ({ ...current, [submissionId]: [] }));
      toast.success("Proof updated successfully");
    } catch (error) {
      console.error("Failed to resubmit proof", error);
      toast.error(error instanceof Error ? error.message : "Failed to update proof");
    } finally {
      setUpdatingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(subs.length / submissionsPerPage));
  const paginatedSubs = subs.slice(
    (currentPage - 1) * submissionsPerPage,
    currentPage * submissionsPerPage
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
      <div className="px-6 py-8 max-w-4xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.back()} className="hover:bg-white/20">
            <ArrowLeft size={16} className="mr-2" /> Back
          </Button>
          <h1 className="text-2xl font-semibold text-stone-800">Done Tasks</h1>
        </div>

        <Card className="mb-6 border-none bg-white/75 p-6 shadow-lg backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">Submission history</p>
              <h2 className="mt-2 text-3xl font-semibold text-stone-900">Review every proof you have sent</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                Your latest submissions appear first. Pending ones can still be updated with stronger proof while completed and rejected records stay here for reference.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:min-w-[220px]">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-stone-500">Total</div>
                <div className="mt-1 text-2xl font-semibold text-stone-900">{subs.length}</div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-amber-700">This page</div>
                <div className="mt-1 text-2xl font-semibold text-stone-900">{paginatedSubs.length}</div>
              </div>
            </div>
          </div>
        </Card>

        {loading ? (
          <PageLoader />
        ) : subs.length === 0 ? (
          <Card className="border-none bg-white/80 p-10 text-center shadow-lg backdrop-blur">
            <p className="text-lg font-medium text-stone-800">No submissions yet.</p>
            <p className="mt-2 text-sm text-stone-600">Once you complete tasks and submit proof, they will show here.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {paginatedSubs.map((s) => (
              <Card key={s.id} className="border-none bg-white/80 shadow-md backdrop-blur transition duration-300 hover:shadow-lg">
                <div className="p-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-lg font-semibold text-stone-800">{s.campaignTitle || "Untitled task"}</h3>
                        <div
                          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                            s.status === "Verified"
                              ? "bg-green-100 text-green-700"
                              : s.status === "Rejected"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {s.status || "Pending"}
                        </div>
                      </div>

                      {s.note ? <p className="mt-2 text-sm text-stone-600">{s.note}</p> : null}
                      {s.status === "Rejected" && s.rejectionReason ? (
                        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                          <span className="font-semibold">Rejection reason:</span> {s.rejectionReason}
                        </div>
                      ) : null}

                      {(s.proofUrls || []).length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(s.proofUrls || []).map((proof, index) => (
                            <a
                              key={`${s.id}-proof-${index}`}
                              href={proof}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-700 hover:bg-amber-100"
                            >
                              {`View Proof ${index + 1} ->`}
                            </a>
                          ))}
                        </div>
                      ) : null}

                      <p className="mt-3 text-xs text-stone-500">
                        Submitted on {getSubmissionDate(s.createdAt)?.toLocaleDateString() || "Unknown date"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 lg:min-w-[150px]">
                      <div className="text-xs uppercase tracking-wide text-stone-500">Reward</div>
                      <div className="mt-1 text-lg font-bold text-amber-600">
                        ₦{(s.earnerPrice || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {s.status !== "Verified" && s.status !== "Rejected" ? (
                    <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
                      <p className="text-sm font-medium text-stone-800">Replace proof</p>
                      <p className="mt-1 text-xs text-stone-500">
                        You can upload new proof files while this submission is still pending review.
                      </p>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        className="mt-3 block w-full text-sm"
                        onChange={(event) =>
                          setProofFiles((current) => ({
                            ...current,
                            [s.id]: Array.from(event.target.files || []).slice(0, 5),
                          }))
                        }
                      />
                      <div className="mt-3 flex items-center gap-3">
                        <Button
                          className="bg-stone-900 text-white hover:bg-stone-800"
                          disabled={updatingId === s.id}
                          onClick={() => void handleResubmit(s.id)}
                        >
                          {updatingId === s.id ? "Updating..." : "Update proof"}
                        </Button>
                        <p className="text-xs text-stone-500">
                          {(proofFiles[s.id] || []).length > 0
                            ? `${(proofFiles[s.id] || []).length} file(s) selected`
                            : "No new files selected"}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </Card>
            ))}

            {totalPages > 1 ? (
              <Card className="border-none bg-white/75 p-4 shadow backdrop-blur">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-stone-600">
                    Showing {(currentPage - 1) * submissionsPerPage + 1} to {Math.min(currentPage * submissionsPerPage, subs.length)} of {subs.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    >
                      Previous
                    </Button>
                    {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                      <Button
                        key={page}
                        variant={page === currentPage ? "default" : "outline"}
                        className={page === currentPage ? "bg-stone-900 text-white hover:bg-stone-800" : ""}
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </Button>
                    ))}
                    <Button
                      variant="outline"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </Card>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
