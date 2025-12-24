"use client";

import React, { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { collection, onSnapshot, updateDoc, doc, getDoc, getDocs, query, where, orderBy, addDoc, serverTimestamp, increment } from "firebase/firestore";
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

interface Withdrawal {
  id: string;
  userId: string;
  amount: number;
  status: string;
  createdAt: { seconds: number };
  bank: {
    accountNumber: string;
    bankName: string;
    accountName: string;
  };
  source: 'earner' | 'advertiser';
}

export default function WithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    // Listen to both earnerWithdrawals and advertiserWithdrawals and merge
    const qEarners = query(collection(db, "earnerWithdrawals"), orderBy("createdAt", "desc"));
    const qAdvertisers = query(collection(db, "advertiserWithdrawals"), orderBy("createdAt", "desc"));

    const unsubEarners = onSnapshot(qEarners, (snap) => {
      const data = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          userId: d.userId || "",
          amount: d.amount || 0,
          status: d.status || "",
          createdAt: d.createdAt || { seconds: Date.now() / 1000 },
          bank: {
            accountNumber: d.bank?.accountNumber || "",
            bankName: d.bank?.bankName || "",
            accountName: d.bank?.accountName || "",
          },
          source: 'earner'
        } as Withdrawal & { source: string };
      });
      setWithdrawals((prev) => {
        const others = prev.filter((p) => p.source !== 'earner');
        return [...data, ...others].sort((a, b) => (b.createdAt.seconds || 0) - (a.createdAt.seconds || 0));
      });
      setLoading(false);
    });

    const unsubAdvertisers = onSnapshot(qAdvertisers, (snap) => {
      const data = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          userId: d.userId || "",
          amount: d.amount || 0,
          status: d.status || "",
          createdAt: d.createdAt || { seconds: Date.now() / 1000 },
          bank: {
            accountNumber: d.bank?.accountNumber || "",
            bankName: d.bank?.bankName || "",
            accountName: d.bank?.accountName || "",
          },
          source: 'advertiser'
        } as Withdrawal & { source: string };
      });
      setWithdrawals((prev) => {
        const others = prev.filter((p) => p.source !== 'advertiser');
        return [...data, ...others].sort((a, b) => (b.createdAt.seconds || 0) - (a.createdAt.seconds || 0));
      });
      setLoading(false);
    });

    return () => {
      unsubEarners()
      unsubAdvertisers()
    }
  }, []);

  const markAsSent = async (id: string, source: 'earner' | 'advertiser' = 'earner') => {
    try {
      const collectionName = source === 'advertiser' ? 'advertiserWithdrawals' : 'earnerWithdrawals'
      const txCollection = source === 'advertiser' ? 'advertiserTransactions' : 'earnerTransactions'
      const userCollection = source === 'advertiser' ? 'advertisers' : 'earners'

      const refDoc = doc(db, collectionName, id);
      const snap = await getDoc(refDoc);
      if (!snap.exists()) {
        toast.error("Withdrawal request not found");
        return;
      }
      const data = snap.data();
      // Update withdrawal status and record processedAt
      await updateDoc(refDoc, { status: "sent", sentAt: serverTimestamp(), processedBy: auth.currentUser?.uid || null });

      // Try to find an existing placeholder transaction and complete it.
      try {
        const txsSnap = await getDocs(
          query(
            collection(db, txCollection),
            where("userId", "==", data.userId),
            where("type", "==", "withdrawal_request"),
            where("requestedAmount", "==", data.amount),
            where("status", "==", "pending")
          )
        );

        if (!txsSnap.empty) {
          const updates = txsSnap.docs.map((t) => updateDoc(doc(db, txCollection, t.id), {
            amount: -Math.abs(data.amount),
            status: "completed",
            note: "Withdrawal processed by admin",
            completedAt: serverTimestamp(),
          }));
          await Promise.all(updates);
        } else {
          await addDoc(collection(db, txCollection), {
            userId: data.userId,
            type: "withdrawal",
            amount: -Math.abs(data.amount),
            fee: data.fee || 0,
            net: data.net || data.amount,
            status: "completed",
            note: "Withdrawal processed by admin",
            createdAt: serverTimestamp(),
          });
        }

        // Decrement earner balance now that withdrawal has been processed.
        // Advertisers were already debited at request time, so only update their totalWithdrawn counter.
        if (source === 'earner') {
          await updateDoc(doc(db, userCollection, data.userId), {
            balance: increment(-Math.abs(data.amount)),
            totalWithdrawn: increment(Number(data.amount) || 0),
          });
        } else {
          // Advertiser: increment totalWithdrawn but do not change balance (already reserved)
          await updateDoc(doc(db, userCollection, data.userId), {
            totalWithdrawn: increment(Number(data.amount) || 0),
          });
        }
      } catch (e) {
        console.warn("Error finalizing withdrawal transaction", e);
      }

      toast.success("Marked as sent");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
    }
  };

  const filteredWithdrawals = withdrawals.filter((w) => {
    const matchesStatus = statusFilter === "all" || w.status === statusFilter;
    const matchesSearch =
      search === "" ||
      w.bank.accountNumber.toLowerCase().includes(search.toLowerCase()) ||
      w.bank.accountName.toLowerCase().includes(search.toLowerCase()) ||
      w.bank.bankName.toLowerCase().includes(search.toLowerCase());
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
        <h1 className="text-2xl font-bold text-stone-800">Withdrawal Requests</h1>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search by account number, name, or bank..."
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
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Withdrawals Table */}
      <Card className="p-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Bank Details</TableHead>
              <TableHead>Account Name</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredWithdrawals.map((withdrawal) => (
              <TableRow key={withdrawal.id}>
                <TableCell className="font-medium">
                  {withdrawal.bank.bankName}
                  <br />
                  <span className="text-sm text-stone-500">{withdrawal.bank.accountNumber}</span>
                </TableCell>
                <TableCell>
                  {withdrawal.source === 'advertiser' ? (
                    <a href={`/admin/advertisers/${withdrawal.userId}`} className="hover:underline">
                      {withdrawal.bank.accountName}
                    </a>
                  ) : (
                    <a href={`/admin/earners/${withdrawal.userId}`} className="hover:underline">
                      {withdrawal.bank.accountName}
                    </a>
                  )}
                </TableCell>
                <TableCell>₦{withdrawal.amount.toLocaleString()}</TableCell>
                <TableCell>
                  {new Date(
                    withdrawal.createdAt.seconds * 1000
                  ).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      withdrawal.status === "sent"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {withdrawal.status}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {withdrawal.status !== "sent" && (
                    <Button
                      onClick={() => markAsSent(withdrawal.id, withdrawal.source)}
                      variant="outline"
                      size="sm"
                    >
                      Mark as Sent
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filteredWithdrawals.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-4">
                  No withdrawal requests found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}