"use client";

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, updateDoc, doc, getDoc, addDoc, serverTimestamp, increment, Timestamp } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import toast from "react-hot-toast";

export default function AdminDashboard() {
  type ProofSubmission = {
    id: string;
    userId: string;
    campaignId: string;
    campaignTitle?: string;
    category?: string;
    note?: string;
    proofUrl?: string;
    status: string;
    createdAt?: Timestamp;
    earnerPrice?: number;
  };
  const [proofs, setProofs] = useState<ProofSubmission[]>([]);
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  type Withdrawal = {
    id: string;
    userId: string;
    amount: number;
    status: string;
    createdAt?: Timestamp;
    bank?: {
      accountNumber: string;
      bankName: string;
      accountName: string;
    };
  };
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);

  // Password protection
  const ADMIN_PASSWORD = "Adewale1#";

  useEffect(() => {
    if (!authenticated) return;
    setLoading(true);
    const unsubWithdrawals = onSnapshot(collection(db, "earnerWithdrawals"), (snap) => {
      setWithdrawals(snap.docs.map((d) => {
        const data = d.data() as Omit<Withdrawal, "id">;
        return { ...data, id: d.id };
      }));
      setLoading(false);
    });

    const unsubProofs = onSnapshot(collection(db, "earnerSubmissions"), (snap) => {
      setProofs(snap.docs.map((d) => {
        const data = d.data() as Omit<ProofSubmission, "id">;
        return { ...data, id: d.id };
      }));
    });

    return () => {
      unsubWithdrawals();
      unsubProofs();
    };
  }, [authenticated]);

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setAuthenticated(true);
      toast.success("Admin access granted");
    } else {
      toast.error("Incorrect password");
    }
  };

  // mark a proof submission as Verified or Rejected. When Verified, credit the earner.
  async function markProofStatus(id: string, status: string) {
    try {
      const subRef = doc(db, "earnerSubmissions", id);
      const subSnap = await getDoc(subRef);
      if (!subSnap.exists()) {
        toast.error("Submission not found");
        return;
      }
      const submission = subSnap.data() as Omit<ProofSubmission, "id">;

      // Update submission status
      await updateDoc(subRef, { status });

      // If marking verified, credit the earner: add transaction and increment balance
      if (status === "Verified") {
        const userId = submission.userId as string;
        const amount = Number(submission.earnerPrice || 0);
        if (userId && amount > 0) {
          // create transaction record
          await addDoc(collection(db, "earnerTransactions"), {
            userId,
            type: "credit",
            amount: amount,
            status: "completed",
            note: `Payment for ${submission.campaignTitle || submission.campaignId}`,
            createdAt: serverTimestamp(),
          });

          // increment user balance and leadsPaidFor
          await updateDoc(doc(db, "earners", userId), {
            balance: increment(amount),
            leadsPaidFor: increment(1),
          });
        }
      }

      toast.success(`Marked as ${status}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
    }
  }

  const markAsSent = async (id: string) => {
    try {
      await updateDoc(doc(db, "earnerWithdrawals", id), { status: "sent" });
      toast.success("Marked as sent");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-700 via-stone-800 to-stone-900">
        <Card className="p-8 max-w-md mx-auto">
          <h2 className="text-xl font-bold mb-4 text-stone-800">Admin Login</h2>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter admin password"
            className="mb-4"
          />
          <Button onClick={handleLogin} className="bg-amber-500 text-stone-900 font-semibold w-full">Login</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300 px-6 py-8">
      <h1 className="text-3xl font-bold mb-8 text-stone-800">Admin Dashboard</h1>

      {/* Withdrawal Requests */}
      <Card className="p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4 text-stone-800">Withdrawal Requests</h2>
        {loading ? (
          <div>Loading...</div>
        ) : withdrawals.length === 0 ? (
          <div className="text-stone-600">No withdrawal requests.</div>
        ) : (
          <div className="space-y-4">
            {withdrawals.map((w) => (
              <Card key={w.id} className="p-4 flex items-center justify-between bg-white/90">
                <div>
                  <div className="font-medium text-stone-800">₦{w.amount.toLocaleString()}</div>
                  <div className="text-sm text-stone-600">{w.bank?.bankName} • {w.bank?.accountNumber}</div>
                  <div className="text-xs text-stone-500">Status: {w.status}</div>
                </div>
                {w.status !== "sent" && (
                  <Button onClick={() => markAsSent(w.id)} className="bg-green-500 text-white font-semibold">Mark as Sent</Button>
                )}
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* Campaign Management */}
      <Card className="p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4 text-stone-800">Campaigns</h2>
        {/* TODO: List all campaigns, filter by status, view details, manage campaigns */}
        <div className="text-stone-500">Campaign management coming soon...</div>
      </Card>

      {/* Proof Submissions */}
      <Card className="p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4 text-stone-800">Proof Submissions</h2>
        {proofs.length === 0 ? (
          <div className="text-stone-600">No proof submissions yet.</div>
        ) : (
          <div className="space-y-4">
            {proofs.map((p) => (
              <Card key={p.id} className="p-4 bg-white/90">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="font-semibold text-lg text-stone-800">{p.campaignTitle}</div>
                    <div className="text-sm text-stone-600">Category: {p.category}</div>
                    {p.note && <div className="text-sm text-stone-600 mt-1">Note: {p.note}</div>}
                    {p.proofUrl && (
                      <a href={p.proofUrl} target="_blank" rel="noreferrer" className="text-amber-600 hover:underline mt-2 block">View Proof</a>
                    )}
                    {p.createdAt && (
                      <div className="text-xs text-stone-500 mt-1">Submitted: {new Date(p.createdAt.seconds * 1000).toLocaleString()}</div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${p.status === "Verified" ? "bg-green-100 text-green-700" : p.status === "Rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{p.status}</span>
                    <div className="text-lg font-bold text-amber-600">₦{(p.earnerPrice || 0).toLocaleString()}</div>
                    <div className="flex gap-2">
                      {p.status !== "Verified" && (
                        <Button onClick={() => markProofStatus(p.id, "Verified")} className="bg-green-500 text-white font-semibold">Verify</Button>
                      )}
                      {p.status !== "Rejected" && (
                        <Button onClick={() => markProofStatus(p.id, "Rejected")} className="bg-red-500 text-white font-semibold">Reject</Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* User Management */}
      <Card className="p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4 text-stone-800">Users</h2>
        {/* TODO: List all users, view details, manage earners/advertisers */}
        <div className="text-stone-500">User management coming soon...</div>
      </Card>

      {/* Email Alerts Integration */}
      <Card className="p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4 text-stone-800">Email Alerts</h2>
        <div className="text-stone-500">Email alerts for new proofs/withdrawals will be sent to timadewale1@gmail.com.</div>
      </Card>
    </div>
  );
}
