"use client";

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, updateDoc, doc, getDoc, getDocs, query, where, orderBy } from "firebase/firestore";
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
}

export default function WithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "earnerWithdrawals"),
      orderBy("createdAt", "desc")
    );

    const unsubWithdrawals = onSnapshot(q, (snap) => {
      const withdrawalsData = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          userId: data.userId || "",
          amount: data.amount || 0,
          status: data.status || "",
          createdAt: data.createdAt || { seconds: Date.now() / 1000 },
          bank: {
            accountNumber: data.bank?.accountNumber || "",
            bankName: data.bank?.bankName || "",
            accountName: data.bank?.accountName || "",
          }
        };
      });
      setWithdrawals(withdrawalsData);
      setLoading(false);
    });

    return () => unsubWithdrawals();
  }, []);

  const markAsSent = async (id: string) => {
    try {
      const ref = doc(db, "earnerWithdrawals", id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        toast.error("Withdrawal request not found");
        return;
      }
      const data = snap.data();
      await updateDoc(ref, { status: "sent" });

      // Try to find matching advertiserTransactions entry and mark completed
      try {
        const txsSnap = await getDocs(
          query(
            collection(db, "advertiserTransactions"),
            where("userId", "==", data.userId),
            where("type", "==", "withdrawal"),
            where("amount", "==", -Math.abs(data.amount)),
            where("status", "==", "pending")
          )
        );
        txsSnap.forEach(async (t) => {
          await updateDoc(doc(db, "advertiserTransactions", t.id), {
            status: "completed",
          });
        });
      } catch (e) {
        console.warn("No matching advertiser transaction updated", e);
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
                  <a href={`/admin/earners/${withdrawal.userId}`} className="hover:underline">
                    {withdrawal.bank.accountName}
                  </a>
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
                      onClick={() => markAsSent(withdrawal.id)}
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