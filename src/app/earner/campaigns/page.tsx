"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { collection, limit, onSnapshot, query, where, doc } from "firebase/firestore";
import Image from "next/image";
import toast from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PageLoader } from "@/components/ui/loader";

type Campaign = {
  id: string;
  title: string;
  category?: string;
  budget?: number;
  reservedBudget?: number;
  costPerLead?: number;
  reward?: number;
  bannerUrl?: string;
  status?: string;
  createdAt?: import("firebase/firestore").Timestamp | Date | { seconds: number; nanoseconds: number } | string | undefined;
};

const TASK_TYPES = [
  "Video",
  "Share my Product",
  "other website tasks",
  "Survey",
  "App Download",
  "Instagram Follow",
  "Instagram Like",
  "Instagram Share",
  "Twitter Follow",
  "Twitter Retweet",
  "Facebook Like",
  "Facebook Share",
  "TikTok Follow",
  "TikTok Like",
  "TikTok Share",
  "YouTube Subscribe",
  "YouTube Like",
  "YouTube Comment",
  "WhatsApp Status",
  "WhatsApp Group Join",
  "Telegram Group Join",
  "Facebook Group Join",
];

export default function AvailableCampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [activated, setActivated] = useState<boolean | null>(null);
  const [accountStatus, setAccountStatus] = useState<string>("active");
  const [activatingLoading, setActivatingLoading] = useState(true);
  const [participatedIds, setParticipatedIds] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string>("All");
  const [currentPage, setCurrentPage] = useState(1);
  const activationReloadedRef = useRef(false);
  const previousActivatedRef = useRef<boolean | null>(null);
  const campaignsPerPage = 3;

  const getCampaignDate = (value: Campaign["createdAt"]) => {
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
    const u = auth.currentUser;
    let unsubProfile: (() => void) | null = null;
    if (u) {
      if (!u.emailVerified) {
        router.replace("/auth/verify-email");
        setActivated(false);
        setActivatingLoading(false);
        return;
      }
      const earnerDoc = doc(db, "earners", u.uid);
      unsubProfile = onSnapshot(earnerDoc, (d) => {
        if (!d.exists()) {
          router.replace("/auth/sign-in");
          setActivatingLoading(false);
          return;
        }
        if (!d.data()?.onboarded) {
          router.replace("/earner/onboarding");
          setActivatingLoading(false);
          return;
        }
        const nextActivated = !!d.data()?.activated;
        setActivated(nextActivated);
        setAccountStatus(String(d.data()?.status || "active"));
        if (
          previousActivatedRef.current === false &&
          nextActivated &&
          !activationReloadedRef.current
        ) {
          activationReloadedRef.current = true;
          toast.success("Your account is now activated. Refreshing this page...");
          setTimeout(() => window.location.reload(), 700);
        }
        previousActivatedRef.current = nextActivated;
        setActivatingLoading(false);
      });
    } else {
      setActivated(false);
      setActivatingLoading(false);
    }

    const q = query(collection(db, "campaigns"), where("status", "==", "Active"), limit(150));
    const unsub = onSnapshot(q, (snap) => {
      const mapped = snap.docs.map((d) => {
        const data = d.data() as Partial<Campaign>;
        return {
          id: d.id,
          title: data.title || "Untitled task",
          category: data.category,
          budget: data.budget,
          reservedBudget: data.reservedBudget,
          costPerLead: data.costPerLead,
          reward: data.reward,
          bannerUrl: data.bannerUrl,
          status: data.status,
          createdAt: data.createdAt,
        } as Campaign;
      });

      mapped.sort((a, b) => {
        const aTime = getCampaignDate(a.createdAt)?.getTime() || 0;
        const bTime = getCampaignDate(b.createdAt)?.getTime() || 0;
        return bTime - aTime;
      });

      setCampaigns(mapped);
      setCurrentPage(1);
      setLoading(false);
    });

    let unsubParts: (() => void) | null = null;
    const user = auth.currentUser;
    if (user) {
      const qParts = query(collection(db, "earnerSubmissions"), where("userId", "==", user.uid), limit(250));
      type Sub = { campaignId?: string };
      unsubParts = onSnapshot(qParts, (s) => {
        setParticipatedIds(s.docs.map((d) => (d.data() as Sub).campaignId).filter(Boolean) as string[]);
      });
    }

    return () => {
      unsub();
      if (unsubParts) unsubParts();
      if (unsubProfile) unsubProfile();
    };
  }, [router]);

  const filteredCampaigns = campaigns
    .filter((c) => Number(c.budget || 0) > 0)
    .filter((c) => filterType === "All" || c.category === filterType)
    .filter((c) => !participatedIds.includes(c.id));

  const totalPages = Math.max(1, Math.ceil(filteredCampaigns.length / campaignsPerPage));
  const paginatedCampaigns = filteredCampaigns.slice(
    (currentPage - 1) * campaignsPerPage,
    currentPage * campaignsPerPage
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
      <div className="px-6 py-8 max-w-6xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.back()} className="hover:bg-white/20">
            <ArrowLeft size={16} className="mr-2" /> Back
          </Button>
          <h1 className="text-2xl font-semibold text-stone-800">Available Tasks</h1>
        </div>

        <Card className="mb-6 border-none bg-white/75 p-6 shadow-lg backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">Task marketplace</p>
              <h2 className="mt-2 text-3xl font-semibold text-stone-900">Pick from live tasks and start earning</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                Browse active tasks, filter by category, and jump into any task you have not submitted yet. The newest tasks show first where timestamps are available.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:min-w-[240px]">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-stone-500">Available</div>
                <div className="mt-1 text-2xl font-semibold text-stone-900">{filteredCampaigns.length}</div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-amber-700">This page</div>
                <div className="mt-1 text-2xl font-semibold text-stone-900">{paginatedCampaigns.length}</div>
              </div>
            </div>
          </div>
        </Card>

        {activatingLoading || loading ? (
          <PageLoader />
        ) : (
          <div>
            {activated === false ? (
              <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Your account will activate automatically once your earnings reach ₦2,000. Until then, you can do tasks normally, but withdrawals and bill purchases from your wallet are disabled.
              </div>
            ) : null}

            <Card className="mb-6 border-none bg-white/75 p-4 shadow backdrop-blur">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">Filter by task type</label>
                  <select
                    className="w-full md:w-72 rounded-xl border border-stone-300 bg-white px-4 py-2 text-stone-800 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                    value={filterType}
                    onChange={(e) => {
                      setFilterType(e.target.value);
                      setCurrentPage(1);
                    }}
                  >
                    <option value="All">All Task Types</option>
                    {TASK_TYPES.map((taskType) => (
                      <option key={taskType} value={taskType}>
                        {taskType}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-sm text-stone-600">
                  Only tasks you have not participated in are shown here.
                </p>
              </div>
            </Card>

            {filteredCampaigns.length === 0 ? (
              <Card className="border-none bg-white/80 p-10 shadow-lg backdrop-blur">
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="mb-6 text-6xl">📭</div>
                  <h3 className="text-3xl font-bold text-stone-800">No Available Tasks</h3>
                  <p className="mt-2 text-lg text-stone-600">Nothing is open right now.</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-stone-500">
                    Check back later for fresh tasks to complete and earn from.
                  </p>
                </div>
              </Card>
            ) : (
              <div className="space-y-4">
                {paginatedCampaigns.map((c) => {
                  const earnerPrice = Math.round((c.costPerLead || 0) / 2);

                  return (
                    <Card key={c.id} className="overflow-hidden border-none bg-white/80 shadow-md backdrop-blur transition duration-300 hover:shadow-xl">
                      <div className="grid gap-0 md:grid-cols-[260px_1fr]">
                        <div className="relative min-h-[220px] overflow-hidden bg-stone-100">
                          <Image
                            src={c.bannerUrl || "/placeholders/default.jpg"}
                            alt={c.title || "task banner"}
                            fill
                            style={{ objectFit: "cover" }}
                          />
                        </div>
                        <div className="p-6">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <div className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                                {c.category || "General task"}
                              </div>
                              <h3 className="mt-3 text-xl font-semibold text-stone-800">{c.title}</h3>
                              <p className="mt-2 text-sm leading-6 text-stone-600">
                                Complete the task instructions carefully, submit clear proof, and wait for review before payout.
                              </p>
                            </div>
                            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 min-w-[150px]">
                              <div className="text-xs uppercase tracking-wide text-stone-500">Earn per lead</div>
                              <div className="mt-1 text-xl font-bold text-amber-600">₦{earnerPrice.toLocaleString()}</div>
                            </div>
                          </div>

                          <div className="mt-5 flex flex-wrap items-center gap-3">
                            <Button
                              onClick={() => {
                                const user = auth.currentUser;
                                if (!user) {
                                  toast.error("Please login to participate in tasks");
                                  router.push("/auth/sign-in");
                                  return;
                                }
                                if (accountStatus === "suspended") {
                                  toast.error("Your account is suspended. Please contact support for review.");
                                  return;
                                }
                                router.push(`/earner/campaigns/${c.id}`);
                              }}
                              className="bg-amber-500 hover:bg-amber-600 text-stone-900 font-medium"
                            >
                              Participate
                            </Button>
                            <span className="text-sm text-stone-500">Task opens in full detail before submission.</span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}

                {totalPages > 1 ? (
                  <Card className="border-none bg-white/75 p-4 shadow backdrop-blur">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-stone-600">
                        Showing {(currentPage - 1) * campaignsPerPage + 1} to {Math.min(currentPage * campaignsPerPage, filteredCampaigns.length)} of {filteredCampaigns.length}
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
        )}
      </div>
    </div>
  );
}
