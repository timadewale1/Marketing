"use client";

import React, { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase"
import {
  collection,
  onSnapshot,
  updateDoc,
  doc,
  getDoc,
  getDocs,
  addDoc,
  serverTimestamp,
  increment,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import toast from "react-hot-toast";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

interface Submission {
  id: string;
  userId: string;
  earnerName?: string;
  campaignId: string;
  campaignTitle: string;
  advertiserName?: string;
  advertiserId?: string;
  category: string;
  note: string;
  proofUrl: string;
  status: string;
  createdAt: { seconds: number };
  earnerPrice: number;
  reviewedAt?: { seconds: number };
  reviewedBy?: string;
  rejectionReason?: string;
  completionRate?: number;
  campaignProgress?: number;
  dailySubmissionCount?: number;
}

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "earnerSubmissions"),
      orderBy("createdAt", "desc")
    );

    const unsubSubmissions = onSnapshot(q, (snap) => {
      const submissionsData = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          userId: data.userId || "",
          campaignId: data.campaignId || "",
          campaignTitle: data.campaignTitle || "",
          category: data.category || "",
          note: data.note || "",
          proofUrl: data.proofUrl || "",
          status: data.status || "",
          createdAt: data.createdAt || { seconds: Date.now() / 1000 },
          earnerPrice: data.earnerPrice || 0,
        };
      });
      setSubmissions(submissionsData);
      setLoading(false);
    });

    return () => unsubSubmissions();
  }, []);

  const markProofStatus = async (id: string, status: string) => {
    try {
      const subRef = doc(db, "earnerSubmissions", id);
      const subSnap = await getDoc(subRef);
      if (!subSnap.exists()) {
        toast.error("Submission not found");
        return;
      }
      const submission = subSnap.data() as Omit<Submission, "id">;

      // Get campaign data for stats
      const campaignRef = doc(db, "campaigns", submission.campaignId);
      const campaignSnap = await getDoc(campaignRef);
      if (!campaignSnap.exists()) {
        toast.error("Campaign not found");
        return;
      }
      const campaign = campaignSnap.data();8

      // Calculate stats
      const completedLeads = (campaign.generatedLeads || 0) + 1;
      const targetLeads = campaign.estimatedLeads || 0;
      const completionRate = targetLeads > 0 ? (completedLeads / targetLeads) * 100 : 0;

      // Get daily submissions count
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dailySubmissionsQuery = query(
        collection(db, "earnerSubmissions"),
        where("campaignId", "==", submission.campaignId),
        where("createdAt", ">=", today)
      );
      const dailySubmissionsSnap = await getDocs(dailySubmissionsQuery);
      const dailyCount = dailySubmissionsSnap.size;

      // Update submission with complete details
      const prevStatus = submission.status
  const prevAutoVerified = (subSnap.data() as { autoVerified?: boolean })?.autoVerified

      await updateDoc(subRef, {
        status,
        reviewedAt: serverTimestamp(),
        reviewedBy: auth.currentUser?.uid || null,
        completionRate: completionRate,
        campaignProgress: completionRate,
        dailySubmissionCount: dailyCount,
        metrics: {
          timeToReview: (Date.now() - submission.createdAt.seconds * 1000) / (1000 * 60), // minutes
          reviewerId: auth.currentUser?.uid,
          updatedAt: serverTimestamp()
        }
      });

      // If marking verified, update all related collections atomically
  if (status === "Verified") {
        const userId = submission.userId;
        const amount = Number(submission.earnerPrice || 0);
        const fullAmount = amount * 2; // Total cost including advertiser portion
        const advertiserId = campaign.ownerId;

        // Get advertiser data
        const advertiserRef = doc(db, "advertisers", advertiserId);
        const advertiserSnap = await getDoc(advertiserRef);
        if (!advertiserSnap.exists()) {
          toast.error("Advertiser not found");
          return;
        }

        if (userId && amount > 0) {
          // 1. Update campaign stats with completion metrics
          await updateDoc(campaignRef, {
            generatedLeads: increment(1),
            budget: increment(-fullAmount),
            completedLeads: increment(1),
            lastLeadAt: serverTimestamp(),
            completionRate: completionRate,
            dailySubmissionCount: dailyCount,
            status: completionRate >= 100 ? "Completed" : "Active",
            metrics: {
              completionRate,
              dailyCount,
              averageReviewTime: campaign.metrics?.averageReviewTime || 0,
              totalSpent: (campaign.metrics?.totalSpent || 0) + fullAmount,
              lastUpdate: serverTimestamp()
            }
          });

          // 2. Create earner transaction and update balance
          await addDoc(collection(db, "earnerTransactions"), {
            userId,
            campaignId: submission.campaignId,
            type: "credit",
            amount: amount,
            status: "completed",
            note: `Payment for ${submission.campaignTitle}`,
            createdAt: serverTimestamp(),
          });

          await updateDoc(doc(db, "earners", userId), {
            balance: increment(amount),
            leadsPaidFor: increment(1),
            totalEarned: increment(amount),
            lastEarnedAt: serverTimestamp(),
          });

          // 3. Update advertiser stats and create transaction
          await addDoc(collection(db, "advertiserTransactions"), {
            userId: advertiserId,
            campaignId: submission.campaignId,
            type: "debit",
            amount: fullAmount,
            status: "completed",
            note: `Payment for lead in ${submission.campaignTitle}`,
            createdAt: serverTimestamp(),
          });

          await updateDoc(advertiserRef, {
            totalSpent: increment(fullAmount),
            leadsGenerated: increment(1),
            lastLeadAt: serverTimestamp(),
          });
        }
      }

        // If admin rejects a submission that was previously verified (autoVerified or verified), reverse payments
        if (status === "Rejected") {
          try {
            const wasAuto = !!prevAutoVerified
            const wasVerifiedBefore = prevStatus === 'Verified'
            if (wasAuto || wasVerifiedBefore) {
              const userId = submission.userId
              const amount = Number(submission.earnerPrice || 0)
              const fullAmount = amount * 2
              const advertiserId = campaign.ownerId

              if (userId && amount > 0) {
                // 1. Create reversal transaction for earner and decrement balance
                await addDoc(collection(db, "earnerTransactions"), {
                  userId,
                  campaignId: submission.campaignId,
                  type: "reversal",
                  amount: -amount,
                  status: "completed",
                  note: `Reversal for rejected submission ${submission.campaignTitle}`,
                  createdAt: serverTimestamp(),
                });

                await updateDoc(doc(db, "earners", userId), {
                  balance: increment(-amount),
                  leadsPaidFor: increment(-1),
                  totalEarned: increment(-amount),
                });
              }

              // 2. Refund advertiser (credit back) and update campaign stats
              if (advertiserId) {
                await addDoc(collection(db, "advertiserTransactions"), {
                  userId: advertiserId,
                  campaignId: submission.campaignId,
                  type: "refund",
                  amount: fullAmount,
                  status: "completed",
                  note: `Refund for rejected submission ${submission.campaignTitle}`,
                  createdAt: serverTimestamp(),
                });

                await updateDoc(doc(db, "advertisers", advertiserId), {
                  totalSpent: increment(-fullAmount),
                  leadsGenerated: increment(-1),
                });

                // Restore campaign budget and decrement generated/completed leads
                await updateDoc(campaignRef, {
                  generatedLeads: increment(-1),
                  budget: increment(fullAmount),
                  completedLeads: increment(-1),
                });
              }
            }
          } catch (revErr) {
            console.error('Reversal error on reject:', revErr)
            // don't block admin action; notify
            toast.error('Failed to fully reverse funds; check logs')
          }
        }

      toast.success(`Marked as ${status}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
    }
  };

  const filteredSubmissions = submissions.filter((s) => {
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    const matchesSearch =
      search === "" ||
      s.campaignTitle.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase()) ||
      s.note.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-800">Campaign Submissions</h1>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search by campaign title, category, or notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Verified">Verified</SelectItem>
              <SelectItem value="Rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Submissions Table */}
      <Card className="p-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">Campaign</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Proof</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSubmissions.map((submission) => (
              <TableRow key={submission.id}>
                <TableCell className="font-medium">
                  <a href={`/admin/campaigns/${submission.campaignId}`} className="hover:underline">
                    {submission.campaignTitle}
                  </a>
                  {submission.note && (
                    <p className="text-sm text-stone-500 mt-1">Note: {submission.note}</p>
                  )}
                </TableCell>
                <TableCell>{submission.category}</TableCell>
                <TableCell>₦{submission.earnerPrice.toLocaleString()}</TableCell>
                <TableCell>
                  {new Date(
                    submission.createdAt.seconds * 1000
                  ).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      submission.status === "Verified"
                        ? "bg-green-100 text-green-700"
                        : submission.status === "Rejected"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {submission.status}
                  </span>
                </TableCell>
                <TableCell>
                  {submission.proofUrl && (
                    <Link
                      href={submission.proofUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-600 hover:text-amber-700"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {submission.status !== "Verified" && (
                      <Button
                        onClick={() => markProofStatus(submission.id, "Verified")}
                        variant="outline"
                        size="sm"
                        className="text-green-700"
                      >
                        Verify
                      </Button>
                    )}
                    {submission.status !== "Rejected" && (
                      <Button
                        onClick={() => markProofStatus(submission.id, "Rejected")}
                        variant="outline"
                        size="sm"
                        className="text-red-700"
                      >
                        Reject
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredSubmissions.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-4">
                  No submissions found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}