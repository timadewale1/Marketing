"use client";

import React, { useEffect, useState } from "react";
import { auth, db, storage } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
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
};

export default function DoneCampaignsPage() {
  const [subs, setSubs] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [proofFiles, setProofFiles] = useState<Record<string, File[]>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.push("/auth/sign-in");
      return;
    }
    const q = query(collection(db, "earnerSubmissions"), where("userId", "==", user.uid));
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
        } as Submission;
      });
      setSubs(mapped);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
      <div className="px-6 py-8 max-w-4xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.back()} className="hover:bg-white/20">
            <ArrowLeft size={16} className="mr-2" /> Back
          </Button>
          <h1 className="text-2xl font-semibold text-stone-800">My Submissions</h1>
        </div>

        {loading ? (
          <PageLoader />
        ) : subs.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-stone-600">No submissions yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {subs.map((s) => (
              <Card key={s.id} className="bg-white/80 backdrop-blur hover:shadow-lg transition duration-300">
                <div className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg text-stone-800">{s.campaignTitle}</h3>
                      {s.note && (
                        <p className="mt-1 text-sm text-stone-600">{s.note}</p>
                      )}
                      {(s.proofUrls || []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(s.proofUrls || []).map((proof, index) => (
                            <a
                              key={`${s.id}-proof-${index}`}
                              href={proof}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center text-sm text-amber-600 hover:text-amber-700"
                            >
                              {`View Proof ${index + 1} ->`}
                            </a>
                          ))}
                        </div>
                      )}
                      {s.createdAt && (
                        <p className="mt-2 text-xs text-stone-500">
                          Submitted on {
                            s.createdAt instanceof Date
                              ? s.createdAt.toLocaleDateString()
                              : typeof s.createdAt === 'object' && 'seconds' in s.createdAt
                                ? new Date(s.createdAt.seconds * 1000).toLocaleDateString()
                                : typeof s.createdAt === 'string'
                                  ? new Date(s.createdAt).toLocaleDateString()
                                  : 'Unknown date'
                          }
                        </p>
                      )}
                    </div>
                    <div className="flex flex-row sm:flex-col items-center sm:items-end gap-4 sm:gap-2">
                      <div className={`
                        px-3 py-1.5 rounded-full text-sm font-medium
                        ${s.status === "Verified" ? "bg-green-100 text-green-700" :
                          s.status === "Rejected" ? "bg-red-100 text-red-700" :
                          "bg-amber-100 text-amber-700"}
                      `}>
                        {s.status || "Pending"}
                      </div>
                      <div className="text-lg font-bold text-amber-600">
                        â‚¦{(s.earnerPrice || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {s.status !== "Verified" && s.status !== "Rejected" ? (
                    <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
                      <p className="text-sm font-medium text-stone-800">Replace proof</p>
                      <p className="mt-1 text-xs text-stone-500">You can upload new proof files while this submission is still pending review.</p>
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
                          {(proofFiles[s.id] || []).length > 0 ? `${(proofFiles[s.id] || []).length} file(s) selected` : "No new files selected"}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
