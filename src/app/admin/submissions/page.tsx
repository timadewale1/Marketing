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
  autoVerified?: boolean;
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
  const [perPage] = useState(15)
  const [page, setPage] = useState(1)

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
          autoVerified: !!data.autoVerified,
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
      const user = auth.currentUser
      let res: Response
      if (user) {
        const idToken = await user.getIdToken()
        res = await fetch('/api/admin/submissions/review', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ submissionId: id, action: status }),
        })
      } else {
        // No Firebase admin signed in — rely on httpOnly adminSession cookie set by admin login
        res = await fetch('/api/admin/submissions/review', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissionId: id, action: status }),
        })
      }

      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        toast.success(`Marked as ${status}`)
      } else {
        toast.error(data?.message || 'Failed to update status')
      }
    } catch (err) {
      console.error('Review API error', err)
      toast.error('Failed to update status')
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

  const totalPages = Math.max(1, Math.ceil(filteredSubmissions.length / perPage))
  const paginated = filteredSubmissions.slice((page - 1) * perPage, page * perPage)

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
            {paginated.map((submission) => (
              <TableRow key={submission.id}>
                <TableCell className="font-medium">
                  <a href={`/admin/campaigns/${submission.campaignId}`} className="hover:underline">
                    {submission.campaignTitle}
                  </a>
                  {submission.note && (
                    <p className="text-sm text-stone-500 mt-1">Note: {submission.note}</p>
                  )}
                  {submission.autoVerified && (
                    <div className="inline-block ml-2 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">Auto</div>
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
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-stone-600">Showing {(page-1)*perPage + 1} - {Math.min(page*perPage, filteredSubmissions.length)} of {filteredSubmissions.length}</div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 border rounded" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page===1}>Prev</button>
            <span className="text-sm">{page} / {totalPages}</span>
            <button className="px-3 py-1 border rounded" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page===totalPages}>Next</button>
          </div>
        </div>
      </Card>
    </div>
  );
}